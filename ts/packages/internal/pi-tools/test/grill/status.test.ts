import { describe, expect, test } from "vitest";

import type { GrillStatusEventContext } from "../../src/grill/status-protocol.ts";
import {
	buildGrillStatusWidgetLines,
	clearGrillStatusWidget,
	GRILL_STATUS_WIDGET_KEY,
	refreshGrillStatusWidget,
	registerGrillStatusLifecycle,
} from "../../src/grill/status.ts";

describe("buildGrillStatusWidgetLines", () => {
	test("no grill or ended grill clears the widget", () => {
		expect(buildGrillStatusWidgetLines({ grill: "none" })).toBeUndefined();
		expect(buildGrillStatusWidgetLines({ grill: "ended", answeredCount: 4 })).toBeUndefined();
	});

	test("active state shows progress, estimate, and pending preview", () => {
		const lines = buildGrillStatusWidgetLines({
			grill: "active",
			answeredCount: 2,
			pendingAsk: {
				question: "How should the cache invalidate entries across worktrees?",
				toolCallId: "call-3",
				estimatedRemaining: { kind: "range", min: 2, max: 4, basis: "two open branches" },
			},
		});

		expect(lines).toEqual([
			'[grill] · 2 answered · Remaining 2–4 (rough: two open branches) · Q3 pending · "How should the cache invalidate entries across worktrees?"',
		]);
	});

	test("active state without a pending call shows an ordinary estimate", () => {
		expect(
			buildGrillStatusWidgetLines({
				grill: "active",
				answeredCount: 10,
				remainingEstimate: { kind: "exact", count: 2, basis: "two decisions" },
			}),
		).toEqual(["[grill] · 10 answered · Remaining 2 (basis: two decisions)"]);
	});

	test("active state without an estimate reports unknown", () => {
		expect(buildGrillStatusWidgetLines({ grill: "active", answeredCount: 0 })).toEqual([
			"[grill] · 0 answered · Remaining unknown (estimate not supplied)",
		]);
	});

	test("long multiline questions are compacted and truncated", () => {
		const lines = buildGrillStatusWidgetLines({
			grill: "active",
			answeredCount: 1,
			pendingAsk: { question: `Should we\n${"really ".repeat(30)}do this?` },
		});
		const line = lines?.[0];
		if (line === undefined) throw new Error("Expected one grill status line");
		expect(line.length).toBeLessThan(180);
		expect(line).not.toContain("\n");
		expect(line).toContain("…");
	});
});

function widgetContext(options: {
	branch?: unknown[];
	hasUI?: boolean;
	setWidget?: GrillStatusEventContext["ui"]["setWidget"];
}): {
	ctx: GrillStatusEventContext;
	calls: Array<{ key: string; lines: string[] | undefined; placement: string | undefined }>;
} {
	const calls: Array<{
		key: string;
		lines: string[] | undefined;
		placement: string | undefined;
	}> = [];
	const ctx: GrillStatusEventContext = {
		hasUI: options.hasUI ?? true,
		ui: {
			setWidget:
				options.setWidget ??
				((key, lines, widgetOptions) => {
					calls.push({ key, lines, placement: widgetOptions?.placement });
				}),
		},
		...(options.branch === undefined
			? {}
			: { sessionManager: { getBranch: () => options.branch! } }),
	};
	return { ctx, calls };
}

const ACTIVE_BRANCH = [
	{
		type: "message",
		id: "kickoff",
		message: { role: "user", content: "<structured-grill-question-ui-contract>" },
	},
];

describe("grill status widget updates", () => {
	test("refresh renders below the editor and clears when inactive", () => {
		const active = widgetContext({ branch: ACTIVE_BRANCH });
		refreshGrillStatusWidget(active.ctx);
		expect(active.calls).toEqual([
			{
				key: GRILL_STATUS_WIDGET_KEY,
				lines: ["[grill] · 0 answered · Remaining unknown (estimate not supplied)"],
				placement: "belowEditor",
			},
		]);

		const inactive = widgetContext({ branch: [] });
		refreshGrillStatusWidget(inactive.ctx);
		expect(inactive.calls).toEqual([
			{ key: GRILL_STATUS_WIDGET_KEY, lines: undefined, placement: "belowEditor" },
		]);
	});

	test("clear always removes the grill-status widget", () => {
		const { ctx, calls } = widgetContext({ branch: ACTIVE_BRANCH });
		clearGrillStatusWidget(ctx);
		expect(calls).toEqual([{ key: "grill-status", lines: undefined, placement: "belowEditor" }]);
	});

	test("skips no-UI updates and swallows widget failures", () => {
		const noUi = widgetContext({ branch: ACTIVE_BRANCH, hasUI: false });
		refreshGrillStatusWidget(noUi.ctx);
		expect(noUi.calls).toEqual([]);

		const throwing = widgetContext({
			branch: ACTIVE_BRANCH,
			setWidget: () => {
				throw new Error("widget runtime unavailable");
			},
		});
		expect(() => refreshGrillStatusWidget(throwing.ctx)).not.toThrow();
		expect(() => clearGrillStatusWidget(throwing.ctx)).not.toThrow();
	});
});

describe("registerGrillStatusLifecycle", () => {
	test("refreshes on turn and session start, then clears on shutdown", () => {
		const handlers = new Map<string, (event: unknown, ctx: GrillStatusEventContext) => void>();
		registerGrillStatusLifecycle({
			on: (event: string, handler: (event: unknown, ctx: GrillStatusEventContext) => void) => {
				handlers.set(event, handler);
			},
		});
		expect([...handlers.keys()]).toEqual(["turn_end", "session_start", "session_shutdown"]);

		const recording = widgetContext({ branch: ACTIVE_BRANCH });
		handlers.get("session_start")?.({}, recording.ctx);
		handlers.get("turn_end")?.({}, recording.ctx);
		handlers.get("session_shutdown")?.({}, recording.ctx);
		expect(recording.calls.map((call) => call.lines)).toEqual([
			["[grill] · 0 answered · Remaining unknown (estimate not supplied)"],
			["[grill] · 0 answered · Remaining unknown (estimate not supplied)"],
			undefined,
		]);
	});

	test("does nothing for hosts without lifecycle events", () => {
		expect(() => registerGrillStatusLifecycle({})).not.toThrow();
	});
});
