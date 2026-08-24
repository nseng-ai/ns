import { describe, expect, test } from "vitest";

import { formatGrillKickoffMarker } from "@nseng-ai/pi-runtime/grill/surfaces";

import type { GrillStatusEventContext } from "../../src/grill/status-protocol.ts";
import {
	buildGrillStatusWidgetLines,
	clearGrillStatusWidget,
	GRILL_STATUS_WIDGET_KEY,
	refreshGrillStatusWidget,
	registerGrillStatusLifecycle,
} from "../../src/grill/status.ts";

describe("buildGrillStatusWidgetLines", () => {
	test("terminal and absent attempts clear the widget", () => {
		expect(buildGrillStatusWidgetLines({ grill: "none" })).toBeUndefined();
		expect(
			buildGrillStatusWidgetLines({
				grill: "confirmed",
				submittedRoundCount: 2,
				answeredDecisionCount: 5,
			}),
		).toBeUndefined();
	});

	test("active state reports between-round frontier progress", () => {
		expect(
			buildGrillStatusWidgetLines({
				grill: "active",
				submittedRoundCount: 2,
				answeredDecisionCount: 5,
			}),
		).toEqual([
			"[grill rounds] · 2 rounds submitted · 5 decisions answered · recomputing complete frontier",
		]);
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
		message: {
			role: "user",
			content: formatGrillKickoffMarker({
				version: 1,
				attemptId: "widget-attempt",
				policy: { kind: "general" },
			}),
		},
	},
];

describe("grill status widget updates", () => {
	test("refresh renders below the editor and clears when inactive", () => {
		const active = widgetContext({ branch: ACTIVE_BRANCH });
		refreshGrillStatusWidget(active.ctx);
		expect(active.calls).toEqual([
			{
				key: GRILL_STATUS_WIDGET_KEY,
				lines: [
					"[grill rounds] · 0 rounds submitted · 0 decisions answered · recomputing complete frontier",
				],
				placement: "belowEditor",
			},
		]);

		const inactive = widgetContext({ branch: [] });
		refreshGrillStatusWidget(inactive.ctx);
		expect(inactive.calls).toEqual([
			{ key: GRILL_STATUS_WIDGET_KEY, lines: undefined, placement: "belowEditor" },
		]);
	});

	test("clear, no-UI, and display failures remain harmless", () => {
		const recording = widgetContext({ branch: ACTIVE_BRANCH });
		clearGrillStatusWidget(recording.ctx);
		expect(recording.calls).toEqual([
			{ key: "grill-status", lines: undefined, placement: "belowEditor" },
		]);
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
			[
				"[grill rounds] · 0 rounds submitted · 0 decisions answered · recomputing complete frontier",
			],
			[
				"[grill rounds] · 0 rounds submitted · 0 decisions answered · recomputing complete frontier",
			],
			undefined,
		]);
	});

	test("does nothing for hosts without lifecycle events", () => {
		expect(() => registerGrillStatusLifecycle({})).not.toThrow();
	});
});
