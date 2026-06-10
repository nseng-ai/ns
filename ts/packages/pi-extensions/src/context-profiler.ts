/**
 * Context profiler Pi extension: a diagnostic, non-mutating overlay that
 * explains where the session's context went — base regions (system prompt,
 * context files, skills, tools) plus a flat per-turn accounting with verbatim
 * drill-down. Deterministic only: it spends zero LM tokens and never mutates
 * the session it profiles.
 */

import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import type { OverlayHandle, TUI } from "@earendil-works/pi-tui";
import { buildProfile, capturePromptState, createProfilerState, handleBeforeAgentStart, handleContext, type ProfilerState } from "./context-profiler/runtime.ts";
import { ProfilerView } from "./context-profiler/view.ts";

export const CONTEXT_PROFILER_COMMAND_NAME = "context-profiler";
const STATUS_KEY = "context-profiler";

interface ActiveOverlay {
	close: (() => void) | null;
	handle: OverlayHandle | null;
}

export function registerContextProfilerExtension(pi: ExtensionAPI): void {
	const state = createProfilerState();
	const active: ActiveOverlay = { close: null, handle: null };

	pi.registerCommand(CONTEXT_PROFILER_COMMAND_NAME, {
		description: "Open the context profiler: a diagnostic, non-mutating overlay over this session's context",
		handler: async (_args, ctx) => openProfiler(ctx, state, active),
	});

	pi.on("before_agent_start", (event, _ctx) => handleBeforeAgentStart(event, state));
	pi.on("context", (event, _ctx) => handleContext(event, state));
	pi.on("session_shutdown", (_event, ctx) => closeProfiler(ctx, active, { clearStatus: true }));
}

export default registerContextProfilerExtension;

function openProfiler(ctx: ExtensionCommandContext, state: ProfilerState, active: ActiveOverlay): void {
	if (!ctx.hasUI) {
		ctx.ui.notify("context profiler only renders in interactive TUI mode", "warning");
		return;
	}
	closeProfiler(ctx, active, { clearStatus: false });
	// before_agent_start only fires on the next turn; pull the current prompt
	// state directly so BASE is populated even right after an extension reload.
	if (state.lastPromptOptions === null) {
		capturePromptState(ctx, state);
	}
	const profile = buildProfile(ctx, state);
	let closeFromCommand: (() => void) | null = null;
	void ctx.ui
		.custom<void>(
			(tui: TUI, theme: Theme, _keybindings, done) => {
				closeFromCommand = () => done(undefined);
				active.close = closeFromCommand;
				return new ProfilerView({
					tui,
					theme,
					profile,
					onClose: () => closeFromCommand?.(),
					onRefresh: () => {
						// The open snapshot is frozen; r re-captures and rebuilds.
						capturePromptState(ctx, state);
						return buildProfile(ctx, state);
					},
				});
			},
			{
				overlay: true,
				overlayOptions: {
					anchor: "center",
					width: "100%",
					maxHeight: "100%",
				},
				onHandle: (handle) => {
					active.handle = handle;
					handle.focus();
				},
			},
		)
		.catch((error: unknown) => {
			const message = error instanceof Error ? error.message : String(error);
			ctx.ui.notify(`Context profiler failed: ${message}`, "error");
		})
		.finally(() => {
			if (active.close === closeFromCommand) {
				active.close = null;
				active.handle = null;
				ctx.ui.setStatus(STATUS_KEY, undefined);
			}
		});
	ctx.ui.setStatus(STATUS_KEY, "ctx profile");
}

function closeProfiler(ctx: ExtensionContext, active: ActiveOverlay, options: { clearStatus: boolean }): void {
	active.close?.();
	active.handle?.hide();
	active.close = null;
	active.handle = null;
	if (options.clearStatus) ctx.ui.setStatus(STATUS_KEY, undefined);
}
