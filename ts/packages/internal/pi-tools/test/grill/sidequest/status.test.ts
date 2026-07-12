import { describe, expect, test } from "vitest";

import type { SidequestEventContext } from "../../../src/grill/sidequest/protocol.ts";
import {
	buildGrillStatusWidgetLines,
	clearGrillStatusWidget,
	GRILL_STATUS_WIDGET_KEY,
	refreshGrillStatusWidget,
} from "../../../src/grill/sidequest/status.ts";

describe("buildGrillStatusWidgetLines", () => {
	test("no grill or ended grill clears the widget", () => {
		expect(buildGrillStatusWidgetLines({ grill: "none" })).toBeUndefined();
		expect(buildGrillStatusWidgetLines({ grill: "ended", answeredCount: 4 })).toBeUndefined();
	});

	test("grilling state shows progress, estimate, and question preview", () => {
		const lines = buildGrillStatusWidgetLines({
			grill: "active",
			answeredCount: 2,
			pendingAsk: {
				question: "How should the cache invalidate entries across worktrees?",
				toolCallId: "call-3",
				estimatedRemaining: { kind: "range", min: 2, max: 4, basis: "two open branches" },
			},
		});

		expect(lines).toHaveLength(1);
		const line = lines?.[0];
		if (line === undefined) throw new Error("Expected one Grill status line");
		expect(line).toContain("[grill] · 2 answered · Remaining 2–4");
		expect(line).toContain("Q3 pending");
		expect(line).toContain('"How should the cache invalidate entries across worktrees?"');
		expect(line).not.toContain("Start a side quest in grill menu");
	});

	test("grilling state without a pending ask shows the remaining estimate", () => {
		const lines = buildGrillStatusWidgetLines({
			grill: "active",
			answeredCount: 10,
			remainingEstimate: { kind: "range", min: 2, max: 4, basis: "two open branches" },
		});

		expect(lines).toEqual(["[grill] · 10 answered · Remaining 2–4 (rough: two open branches)"]);
	});

	test("grilling state without an available estimate reports that it is unknown", () => {
		expect(buildGrillStatusWidgetLines({ grill: "active", answeredCount: 0 })).toEqual([
			"[grill] · 0 answered · Remaining unknown (estimate not supplied)",
		]);
	});

	test("long questions are truncated to a single compact line", () => {
		const longQuestion = `Should we ${"really ".repeat(30)}do this?`;
		const lines = buildGrillStatusWidgetLines({
			grill: "active",
			answeredCount: 1,
			pendingAsk: { question: longQuestion },
		});

		const line = lines?.[0];
		if (line === undefined) throw new Error("Expected one Grill status line");
		expect(line.length).toBeLessThan(220);
		expect(line).toContain("…");
	});

	test("quest state shows the topic, paused question number, and both return routes", () => {
		const lines = buildGrillStatusWidgetLines({
			grill: "active",
			answeredCount: 2,
			activeQuest: {
				questId: "quest-1",
				markEntryId: "mark",
				topic: "cache layout",
				pendingAsk: { question: "Q?" },
			},
		});

		expect(lines).toEqual([
			"[grill] ⚑ side quest: cache layout · paused at Q3 · back: tree → ⚑ mark, or /pi:grill-return",
		]);
	});
});

describe("refreshGrillStatusWidget", () => {
	function widgetContext(options: {
		branch?: unknown[];
		hasUI?: boolean;
		setWidget?: SidequestEventContext["ui"]["setWidget"];
	}): {
		ctx: SidequestEventContext;
		calls: Array<{ lines: string[] | undefined; placement: string | undefined }>;
	} {
		const calls: Array<{ lines: string[] | undefined; placement: string | undefined }> = [];
		const ctx: SidequestEventContext = {
			hasUI: options.hasUI ?? true,
			ui: {
				setWidget:
					options.setWidget ??
					((key, lines, widgetOptions) => {
						expect(key).toBe(GRILL_STATUS_WIDGET_KEY);
						calls.push({ lines, placement: widgetOptions?.placement });
					}),
			},
			...(options.branch === undefined
				? {}
				: { sessionManager: { getBranch: () => options.branch! } }),
		};
		return { ctx, calls };
	}

	const grillingBranch = [
		{
			type: "message",
			id: "kickoff",
			message: { role: "user", content: "<structured-grill-question-ui-contract>" },
		},
	];

	test("renders below the editor for an active grill and clears when no grill", () => {
		const active = widgetContext({ branch: grillingBranch });
		refreshGrillStatusWidget(active.ctx);
		expect(active.calls).toEqual([
			{
				lines: ["[grill] · 0 answered · Remaining unknown (estimate not supplied)"],
				placement: "belowEditor",
			},
		]);

		const noGrill = widgetContext({ branch: [] });
		refreshGrillStatusWidget(noGrill.ctx);
		expect(noGrill.calls).toEqual([{ lines: undefined, placement: "belowEditor" }]);
	});

	test("clearGrillStatusWidget always clears", () => {
		const { ctx, calls } = widgetContext({ branch: grillingBranch });
		clearGrillStatusWidget(ctx);
		expect(calls).toEqual([{ lines: undefined, placement: "belowEditor" }]);
	});

	test("skips rendering without UI and swallows widget failures", () => {
		const noUi = widgetContext({ branch: grillingBranch, hasUI: false });
		refreshGrillStatusWidget(noUi.ctx);
		expect(noUi.calls).toEqual([]);

		const throwing = widgetContext({
			branch: grillingBranch,
			setWidget: () => {
				throw new Error("widget runtime unavailable");
			},
		});
		expect(() => refreshGrillStatusWidget(throwing.ctx)).not.toThrow();
	});
});
