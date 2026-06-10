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

/** One open overlay: its close callback and, once available, its handle. */
interface OverlaySession {
	close: () => void;
	handle: OverlayHandle | null;
}

export function registerContextProfilerExtension(pi: ExtensionAPI): void {
	const state = createProfilerState();
	const holder: { current: OverlaySession | null } = { current: null };

	pi.registerCommand(CONTEXT_PROFILER_COMMAND_NAME, {
		description: "Open the context profiler: a diagnostic, non-mutating overlay over this session's context",
		handler: async (_args, ctx) => openProfiler(ctx, state, holder),
	});

	pi.on("before_agent_start", (event, _ctx) => handleBeforeAgentStart(event, state));
	pi.on("context", (event, _ctx) => handleContext(event, state));
	pi.on("session_shutdown", (_event, ctx) => closeProfiler(ctx, holder));
}

export default registerContextProfilerExtension;

function openProfiler(ctx: ExtensionCommandContext, state: ProfilerState, holder: { current: OverlaySession | null }): void {
	if (!ctx.hasUI) {
		ctx.ui.notify("context profiler only renders in interactive TUI mode", "warning");
		return;
	}
	closeProfiler(ctx, holder);
	// before_agent_start only fires on the next turn; pull the current prompt
	// state directly so BASE is populated even right after an extension reload.
	if (state.lastPromptOptions === null) {
		capturePromptState(ctx, state);
	}
	const profile = buildProfile(ctx, state);
	const session: OverlaySession = { close: () => {}, handle: null };
	holder.current = session;
	void ctx.ui
		.custom<void>(
			(tui: TUI, theme: Theme, _keybindings, done) => {
				session.close = () => done(undefined);
				return new ProfilerView({
					tui,
					theme,
					profile,
					onClose: () => session.close(),
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
					session.handle = handle;
					handle.focus();
				},
			},
		)
		.catch((error: unknown) => {
			const message = error instanceof Error ? error.message : String(error);
			ctx.ui.notify(`Context profiler failed: ${message}`, "error");
		})
		.finally(() => {
			if (holder.current === session) {
				holder.current = null;
				ctx.ui.setStatus(STATUS_KEY, undefined);
			}
		});
	ctx.ui.setStatus(STATUS_KEY, "ctx profile");
}

function closeProfiler(ctx: ExtensionContext, holder: { current: OverlaySession | null }): void {
	holder.current?.close();
	holder.current?.handle?.hide();
	holder.current = null;
	ctx.ui.setStatus(STATUS_KEY, undefined);
}
