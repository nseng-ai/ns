/**
 * Context profiler Pi extension: a diagnostic, non-mutating overlay that
 * explains where the session's context went — base regions (system prompt,
 * context files, skills, tools) plus a flat per-turn accounting with verbatim
 * drill-down. The deterministic layer spends zero LM tokens and never mutates
 * the session it profiles; on top of it, opening or refreshing the overlay
 * fires one on-demand, clearly-labeled LM segmentation call (fixed cheap
 * model) whose episodes render as an additive annotation layer — LM failure
 * never blocks the deterministic view.
 */

import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import type { OverlayHandle, TUI } from "@earendil-works/pi-tui";
import {
	buildProfile,
	capturePromptState,
	createProfilerState,
	handleBeforeAgentStart,
	handleContext,
	startSegmentation,
	type ProfilerState,
} from "./context-profiler/runtime.ts";
import { createCodexSegmentationGateway } from "./context-profiler/segmentation-gateway.ts";
import type { SegmentationState } from "./context-profiler/segmentation.ts";
import { ProfilerView } from "./context-profiler/view.ts";

export const CONTEXT_PROFILER_COMMAND_NAME = "context-profiler";
const STATUS_KEY = "context-profiler";

/** One open overlay: its close callback and, once available, its handle and view. */
interface OverlaySession {
	close: () => void;
	handle: OverlayHandle | null;
	view: ProfilerView | null;
	abortSegmentation: (() => void) | null;
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
	const gateway = createCodexSegmentationGateway(ctx.modelRegistry);
	const profile = buildProfile(ctx, state);
	const session: OverlaySession = { close: () => {}, handle: null, view: null, abortSegmentation: null };
	holder.current = session;
	// Open and `r` refresh are the only segmentTurns call sites — the LM is
	// never consulted while the overlay is closed.
	const onSegmentationUpdate = (segmentation: SegmentationState): void => {
		if (holder.current === session) session.view?.setSegmentation(segmentation);
	};
	void ctx.ui
		.custom<void>(
			(tui: TUI, theme: Theme, _keybindings, done) => {
				session.close = () => done(undefined);
				// Computed inside the factory, right before the view exists: the
				// initial state feeds the constructor, and session.view is set
				// before any async onUpdate can fire.
				const segmentation = startSegmentation({ gateway, profile, state, force: false, onUpdate: onSegmentationUpdate });
				session.abortSegmentation = segmentation.abort;
				const view = new ProfilerView({
					tui,
					theme,
					profile,
					segmentation: segmentation.initial,
					onClose: () => session.close(),
					onRefresh: () => {
						// The open snapshot is frozen; r re-captures, rebuilds, and
						// always recomputes segmentation (force bypasses the cache).
						session.abortSegmentation?.();
						capturePromptState(ctx, state);
						const refreshedProfile = buildProfile(ctx, state);
						const refreshed = startSegmentation({ gateway, profile: refreshedProfile, state, force: true, onUpdate: onSegmentationUpdate });
						session.abortSegmentation = refreshed.abort;
						return { profile: refreshedProfile, segmentation: refreshed.initial };
					},
				});
				session.view = view;
				return view;
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
			// Single cancellation authority: every close path (q/Esc → done(),
			// closeProfiler → close() → done(), factory errors → .catch) settles
			// this chain, so aborting here guarantees no in-flight LM call from a
			// closed session can write the cache or reach the view.
			session.abortSegmentation?.();
			if (holder.current === session) {
				holder.current = null;
				ctx.ui.setStatus(STATUS_KEY, undefined);
			}
		});
	ctx.ui.setStatus(STATUS_KEY, "ctx profile");
}

function closeProfiler(ctx: ExtensionContext, holder: { current: OverlaySession | null }): void {
	// Teardown converges in the ui.custom(...).finally() in openProfiler:
	// close() settles that chain, which aborts any in-flight segmentation
	// (session_shutdown routes here too).
	holder.current?.close();
	holder.current?.handle?.hide();
	holder.current = null;
	ctx.ui.setStatus(STATUS_KEY, undefined);
}
