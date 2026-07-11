import { formatRemainingEstimate } from "../progress.ts";
import { truncateSingleLine } from "./prompts.ts";
import type { SidequestEventContext, SidequestScanState } from "./protocol.ts";
import { scanGrillBranchFromSessionManager } from "./state.ts";

export const GRILL_STATUS_WIDGET_KEY = "grill-sidequest-status";

const QUESTION_PREVIEW_MAX_LENGTH = 60;
const TOPIC_PREVIEW_MAX_LENGTH = 40;

/** Pure widget-line renderer. `undefined` means the widget should be cleared. */
export function buildGrillStatusWidgetLines(state: SidequestScanState): string[] | undefined {
	if (state.grill !== "active") return undefined;

	if (state.activeQuest !== undefined) {
		const topic = truncateSingleLine(state.activeQuest.topic, TOPIC_PREVIEW_MAX_LENGTH);
		return [
			`▌GRILL ⚑ side quest: ${topic} · paused at Q${state.answeredCount + 1} · back: tree → ⚑ mark, or /pi:grill-return`,
		];
	}

	const parts = [`▌GRILL · Q${state.answeredCount + 1} pending`, `${state.answeredCount} answered`];
	if (state.latestAsk !== undefined) {
		parts.push(
			formatRemainingEstimate(state.latestAsk.estimatedRemaining, "compact"),
			`"${truncateSingleLine(state.latestAsk.question, QUESTION_PREVIEW_MAX_LENGTH)}"`,
		);
	}
	parts.push("sq:<topic> in freeform = side quest");
	return [parts.join(" · ")];
}

/** Re-derive grill state from the current branch and update the below-editor widget. */
export function refreshGrillStatusWidget(ctx: SidequestEventContext): void {
	setGrillStatusWidget(
		ctx,
		buildGrillStatusWidgetLines(scanGrillBranchFromSessionManager(ctx.sessionManager)),
	);
}

export function clearGrillStatusWidget(ctx: SidequestEventContext): void {
	setGrillStatusWidget(ctx, undefined);
}

function setGrillStatusWidget(ctx: SidequestEventContext, lines: string[] | undefined): void {
	if (ctx.hasUI === false) return;
	try {
		ctx.ui.setWidget?.(GRILL_STATUS_WIDGET_KEY, lines, { placement: "belowEditor" });
	} catch {
		// Widget updates are display-only and must not affect grill execution.
	}
}
