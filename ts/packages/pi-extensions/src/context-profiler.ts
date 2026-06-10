/**
 * Context profiler Pi extension: a diagnostic, non-mutating overlay that
 * explains where the session's context went — base regions (system prompt,
 * context files, skills, tools) plus a flat per-turn accounting with verbatim
 * drill-down. The deterministic layer spends zero LM tokens and never mutates
 * the session it profiles; on top of it, opening or refreshing the overlay
 * fires on-demand, clearly-labeled LM segmentation/analysis calls (fixed
 * cheap model) whose episodes render as an additive annotation layer — LM
 * failure never blocks the deterministic view.
 */

import type { BeforeAgentStartEvent, ContextEvent, ExtensionAPI, ExtensionCommandContext, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
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
import { createCodexAnalysisModelGateway } from "./context-profiler/analysis-model-gateway.ts";
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
	const runtime = new ProfilerRuntimeStore();
	const sessions = new OverlaySessionController();

	pi.registerCommand(CONTEXT_PROFILER_COMMAND_NAME, {
		description: "Open the context profiler: a diagnostic, non-mutating overlay over this session's context",
		handler: async (_args, ctx) => openProfiler({ ctx, runtime, sessions }),
	});

	pi.on("before_agent_start", (event, _ctx) => runtime.handleBeforeAgentStart(event));
	pi.on("context", (event, _ctx) => runtime.handleContext(event));
	pi.on("session_shutdown", (_event, ctx) => closeProfiler(ctx, sessions));
}

export default registerContextProfilerExtension;

interface OpenProfilerOptions {
	ctx: ExtensionCommandContext;
	runtime: ProfilerRuntimeStore;
	sessions: OverlaySessionController;
}

class ProfilerRuntimeStore {
	private state: ProfilerState;

	constructor() {
		this.state = createProfilerState();
	}

	current(): ProfilerState {
		return this.state;
	}

	handleBeforeAgentStart(event: BeforeAgentStartEvent): void {
		this.state = handleBeforeAgentStart(event, this.state);
	}

	handleContext(event: ContextEvent): void {
		this.state = handleContext(event, this.state);
	}

	capturePromptState(ctx: ExtensionContext): ProfilerState {
		this.state = capturePromptState(ctx, this.state);
		return this.state;
	}
}

class OverlaySessionController {
	private currentSession: OverlaySession | null;

	constructor() {
		this.currentSession = null;
	}

	set(session: OverlaySession): void {
		this.currentSession = session;
	}

	isCurrent(session: OverlaySession): boolean {
		return this.currentSession === session;
	}

	clearIfCurrent(session: OverlaySession): void {
		if (this.currentSession === session) this.currentSession = null;
	}

	close(ctx: ExtensionContext): void {
		this.currentSession?.close();
		this.currentSession?.handle?.hide();
		this.currentSession = null;
		ctx.ui.setStatus(STATUS_KEY, undefined);
	}
}

function openProfiler(options: OpenProfilerOptions): void {
	const { ctx, runtime, sessions } = options;
	if (!ctx.hasUI) {
		ctx.ui.notify("context profiler only renders in interactive TUI mode", "warning");
		return;
	}
	closeProfiler(ctx, sessions);
	// before_agent_start only fires on the next turn; pull the current prompt
	// state directly so BASE is populated even right after an extension reload.
	let state = runtime.current();
	if (state.lastPromptOptions === null) {
		state = runtime.capturePromptState(ctx);
	}
	const gateway = createCodexAnalysisModelGateway(ctx.modelRegistry);
	const profile = buildProfile(ctx, state);
	const session: OverlaySession = { close: () => {}, handle: null, view: null, abortSegmentation: null };
	sessions.set(session);
	// Open and `r` refresh are the only LM call sites — the model is never
	// consulted while the overlay is closed.
	const onSegmentationUpdate = (segmentation: SegmentationState): void => {
		if (sessions.isCurrent(session)) session.view?.setSegmentation(segmentation);
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
						const refreshedState = runtime.capturePromptState(ctx);
						const refreshedProfile = buildProfile(ctx, refreshedState);
						const refreshed = startSegmentation({ gateway, profile: refreshedProfile, state: refreshedState, force: true, onUpdate: onSegmentationUpdate });
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
			if (sessions.isCurrent(session)) {
				sessions.clearIfCurrent(session);
				ctx.ui.setStatus(STATUS_KEY, undefined);
			}
		});
	ctx.ui.setStatus(STATUS_KEY, "ctx profile");
}

function closeProfiler(ctx: ExtensionContext, sessions: OverlaySessionController): void {
	// Teardown converges in the ui.custom(...).finally() in openProfiler:
	// close() settles that chain, which aborts any in-flight segmentation
	// (session_shutdown routes here too).
	sessions.close(ctx);
}
