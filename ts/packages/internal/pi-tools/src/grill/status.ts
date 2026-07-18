import { truncateTextHead } from "@nseng-ai/foundation/text-truncation";

import { formatRemainingEstimate } from "./progress.ts";
import type {
	GrillStatusEventContext,
	GrillStatusLifecycleHost,
	GrillStatusState,
} from "./status-protocol.ts";
import { scanGrillBranchFromSessionManager } from "./status-state.ts";

export const GRILL_STATUS_WIDGET_KEY = "grill-status";

const QUESTION_PREVIEW_MAX_CHARS = 60;

/** Pure widget-line renderer. `undefined` means the widget should be cleared. */
export function buildGrillStatusWidgetLines(state: GrillStatusState): string[] | undefined {
	if (state.grill !== "active") return undefined;

	const parts = [
		"[grill]",
		`${state.answeredCount} answered`,
		formatRemainingEstimate(
			state.remainingEstimate ?? state.pendingAsk?.estimatedRemaining,
			"compact",
		),
	];
	if (state.pendingAsk !== undefined) {
		parts.push(
			`Q${state.answeredCount + 1} pending`,
			`"${truncateSingleLine(state.pendingAsk.question, QUESTION_PREVIEW_MAX_CHARS)}"`,
		);
	}
	return [parts.join(" · ")];
}

/** Register the history-derived status widget lifecycle when the host exposes Pi events. */
export function registerGrillStatusLifecycle(host: unknown): void {
	if (!isGrillStatusLifecycleHost(host)) return;
	host.on("turn_end", (_event, ctx) => refreshGrillStatusWidget(ctx));
	host.on("session_start", (_event, ctx) => refreshGrillStatusWidget(ctx));
	host.on("session_shutdown", (_event, ctx) => clearGrillStatusWidget(ctx));
}

/** Re-derive grill state from the current branch and update the below-editor widget. */
export function refreshGrillStatusWidget(ctx: GrillStatusEventContext): void {
	setGrillStatusWidget(
		ctx,
		buildGrillStatusWidgetLines(scanGrillBranchFromSessionManager(ctx.sessionManager)),
	);
}

export function clearGrillStatusWidget(ctx: GrillStatusEventContext): void {
	setGrillStatusWidget(ctx, undefined);
}

function setGrillStatusWidget(ctx: GrillStatusEventContext, lines: string[] | undefined): void {
	if (ctx.hasUI === false) return;
	try {
		ctx.ui.setWidget?.(GRILL_STATUS_WIDGET_KEY, lines, { placement: "belowEditor" });
	} catch {
		// Widget updates are display-only and must not affect grill execution.
	}
}

function truncateSingleLine(value: string, maxChars: number): string {
	return truncateTextHead({
		value: value.replace(/\s+/g, " ").trim(),
		maxChars,
		buildMarker: () => "…",
	});
}

function isGrillStatusLifecycleHost(value: unknown): value is GrillStatusLifecycleHost {
	return isRecord(value) && typeof value.on === "function";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
