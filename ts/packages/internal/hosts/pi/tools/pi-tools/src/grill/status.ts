import type {
	GrillStatusEventContext,
	GrillStatusLifecycleHost,
	GrillStatusState,
} from "./status-protocol.ts";
import { scanGrillBranchFromSessionManager } from "./status-state.ts";

export const GRILL_STATUS_WIDGET_KEY = "grill-status";

/** Pure widget-line renderer. Terminal attempts clear the transient widget. */
export function buildGrillStatusWidgetLines(state: GrillStatusState): string[] | undefined {
	if (state.grill !== "active") return undefined;
	return [
		[
			"[grill rounds]",
			`${state.submittedRoundCount} rounds submitted`,
			`${state.answeredDecisionCount} decisions answered`,
			"recomputing complete frontier",
		].join(" · "),
	];
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

function isGrillStatusLifecycleHost(value: unknown): value is GrillStatusLifecycleHost {
	return isRecord(value) && typeof value.on === "function";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
