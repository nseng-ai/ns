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
import { createCodexAnalysisModelGateway } from "./context-profiler/analysis-model-gateway.ts";
import type { BundlePersistenceState } from "./context-profiler/bundle.ts";
import { createFsBundleStore } from "./context-profiler/bundle-store.ts";
import { errorMessage } from "./context-profiler/errors.ts";
import { InterrogationController, type InterrogationAttachment } from "./context-profiler/interrogation-controller.ts";
import { createPiInterrogationSessionFactory } from "./context-profiler/interrogation-session.ts";
import type { InterrogationScope } from "./context-profiler/interrogation-prompt.ts";
import type { ProfileSnapshot } from "./context-profiler/model.ts";
import {
	buildProfile,
	captureCurrentState,
	createProfilerState,
	createSegmentationCacheCell,
	handleBeforeAgentStart,
	handleContext,
	startProfilerWork,
	type ProfilerState,
	type SegmentationCacheAccess,
} from "./context-profiler/runtime.ts";
import { bundleStatusBarText } from "./context-profiler/render.ts";
import type { SegmentationState } from "./context-profiler/segmentation.ts";
import { ProfilerView } from "./context-profiler/view.ts";

export const CONTEXT_PROFILER_COMMAND_NAME = "context-profiler";
const STATUS_KEY = "context-profiler";

/** One open overlay: its close callback and, once available, its handle and view. */
interface OverlaySession {
	close: () => void;
	handle: OverlayHandle | null;
	view: ProfilerView | null;
	detachSegmentation: (() => void) | null;
	persistence: BundlePersistenceState;
	interrogation: InterrogationController | null;
}

export function registerContextProfilerExtension(pi: ExtensionAPI): void {
	const runtime = new ProfilerRuntimeStore();
	const segmentationCache = createSegmentationCacheCell();
	const sessions = new OverlaySessionController();

	pi.registerCommand(CONTEXT_PROFILER_COMMAND_NAME, {
		description: "Open the context profiler: a diagnostic, non-mutating overlay over this session's context",
		handler: async (_args, ctx) => openProfiler({ ctx, runtime, segmentationCache, sessions }),
	});

	pi.on("before_agent_start", (event, _ctx) => runtime.handleBeforeAgentStart(event));
	pi.on("context", (event, _ctx) => runtime.handleContext(event));
	pi.on("session_shutdown", (_event, ctx) => closeProfiler(ctx, sessions));
}

export default registerContextProfilerExtension;

interface OpenProfilerOptions {
	ctx: ExtensionCommandContext;
	runtime: ProfilerRuntimeStore;
	segmentationCache: SegmentationCacheAccess;
	sessions: OverlaySessionController;
}

class ProfilerRuntimeStore {
	private state: ProfilerState;

	constructor() {
		this.state = createProfilerState();
	}

	handleBeforeAgentStart(event: BeforeAgentStartEvent): void {
		this.state = handleBeforeAgentStart(event, this.state);
	}

	handleContext(event: ContextEvent): void {
		this.state = handleContext(event, this.state);
	}

	captureCurrentState(ctx: ExtensionContext): ProfilerState {
		this.state = captureCurrentState(ctx, this.state);
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
		this.currentSession?.detachSegmentation?.();
		this.currentSession?.close();
		this.currentSession?.handle?.hide();
		this.currentSession = null;
		ctx.ui.setStatus(STATUS_KEY, undefined);
	}
}

function openProfiler(options: OpenProfilerOptions): void {
	const { ctx, runtime, segmentationCache, sessions } = options;
	if (!ctx.hasUI) {
		ctx.ui.notify("context profiler only renders in interactive TUI mode", "warning");
		return;
	}
	closeProfiler(ctx, sessions);
	// before_agent_start and context events only fire on model turns; pull the
	// current prompt and session-context state directly so the profiler works
	// immediately after an extension reload.
	const state = runtime.captureCurrentState(ctx);
	const gateway = createCodexAnalysisModelGateway(ctx.modelRegistry);
	const profile = buildProfile(ctx, state);
	const bundleStore = createFsBundleStore({ sessionDir: ctx.sessionManager.getSessionDir(), sessionId: ctx.sessionManager.getSessionId() });
	const session: OverlaySession = {
		close: () => {},
		handle: null,
		view: null,
		detachSegmentation: null,
		persistence: { type: "pending" },
		interrogation: null,
	};
	sessions.set(session);
	const onSegmentationUpdate = (segmentation: SegmentationState): void => {
		if (sessions.isCurrent(session)) session.view?.setSegmentation(segmentation);
	};
	const onPersistenceUpdate = (persistence: BundlePersistenceState): void => {
		session.persistence = persistence;
		if (!sessions.isCurrent(session)) return;
		session.view?.setPersistence(persistence);
		ctx.ui.setStatus(STATUS_KEY, bundleStatusBarText(persistence));
	};
	const startWork = (workState: ProfilerState, workProfile: ProfileSnapshot, force: boolean): SegmentationState => {
		session.detachSegmentation?.();
		const work = startProfilerWork({
			store: bundleStore,
			gateway,
			state: workState,
			profile: workProfile,
			sessionId: ctx.sessionManager.getSessionId(),
			cache: segmentationCache,
			force,
			onSegmentationUpdate,
			onPersistenceUpdate,
			onEpisodesWriteResult: (result) => {
				if (result.ok || !sessions.isCurrent(session)) return;
				ctx.ui.notify(`Context profiler could not write episodes.json: ${result.error.message}`, "warning");
			},
		});
		session.detachSegmentation = work.detach;
		onPersistenceUpdate(work.initialPersistence);
		return work.initialSegmentation;
	};
	void ctx.ui
		.custom<void>(
			(tui: TUI, theme: Theme, _keybindings, done) => {
				session.close = () => done(undefined);
				const initialSegmentation = startWork(state, profile, false);
				const view = new ProfilerView({
					tui,
					theme,
					profile,
					segmentation: initialSegmentation,
					persistence: session.persistence,
					onClose: () => session.close(),
					onOpenInterrogation: (scope) => openInterrogation({ ctx, session, scope }),
					onRefresh: () => {
						const refreshedState = runtime.captureCurrentState(ctx);
						const refreshedProfile = buildProfile(ctx, refreshedState);
						const refreshedSegmentation = startWork(refreshedState, refreshedProfile, true);
						return { profile: refreshedProfile, segmentation: refreshedSegmentation, persistence: session.persistence };
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
			ctx.ui.notify(`Context profiler failed: ${errorMessage(error)}`, "error");
		})
		.finally(() => {
			// Single teardown authority: every close path settles this chain, while
			// OverlaySessionController.close() only performs synchronous detach/hide.
			session.detachSegmentation?.();
			session.interrogation?.dispose();
			if (sessions.isCurrent(session)) {
				sessions.clearIfCurrent(session);
				ctx.ui.setStatus(STATUS_KEY, undefined);
			}
		});
	ctx.ui.setStatus(STATUS_KEY, bundleStatusBarText(session.persistence));
}

function openInterrogation(options: {
	ctx: ExtensionCommandContext;
	session: OverlaySession;
	scope: InterrogationScope;
}): InterrogationAttachment {
	const { ctx, session } = options;
	if (session.persistence.type !== "persisted") return { type: "degraded", reason: bundleUnavailableReason(session.persistence) };
	if (ctx.model === undefined) return { type: "degraded", reason: "The host session has no selected model, so the interrogation agent cannot start." };
	if (session.interrogation === null || session.interrogation.bundleOrdinal !== session.persistence.ordinal) {
		session.interrogation?.dispose();
		session.interrogation = new InterrogationController({
			bundle: session.persistence,
			model: ctx.model,
			modelRegistry: ctx.modelRegistry,
			factory: createPiInterrogationSessionFactory(),
			onTranscriptChange: () => session.view?.notifyInterrogationChanged(),
		});
	}
	return { type: "ready", port: session.interrogation };
}

function bundleUnavailableReason(state: Exclude<BundlePersistenceState, { type: "persisted" }>): string {
	switch (state.type) {
		case "pending":
			return "The context bundle is still being written. Wait a moment, then press Esc and p again.";
		case "skipped":
			return "Interrogation needs a context bundle, but this session has no conversation yet. Send a prompt, then press r to refresh.";
		case "failed":
			return `The context bundle could not be written: ${state.message}. Interrogation is disabled because it can only read bundles from disk.`;
	}
}

function closeProfiler(ctx: ExtensionContext, sessions: OverlaySessionController): void {
	// close() synchronously detaches segmentation before settling the overlay;
	// resource disposal remains centralized in ui.custom(...).finally().
	sessions.close(ctx);
}
