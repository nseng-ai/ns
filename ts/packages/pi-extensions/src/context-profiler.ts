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
import { ANALYSIS_MODEL_ID, ANALYSIS_MODEL_PROVIDER, createCodexAnalysisModelGateway } from "./context-profiler/analysis-model-gateway.ts";
import type { BundlePersistenceState } from "./context-profiler/bundle.ts";
import { createFsBundleStore, type BundleStore, type PersistedBundle } from "./context-profiler/bundle-store.ts";
import { InterrogationController } from "./context-profiler/interrogation-controller.ts";
import { createPiInterrogationSessionFactory } from "./context-profiler/interrogation-session.ts";
import type { InterrogationScope } from "./context-profiler/interrogation-prompt.ts";
import {
	buildProfile,
	captureCurrentState,
	createProfilerState,
	handleBeforeAgentStart,
	handleContext,
	joinEpisodesWrite,
	startBundlePersist,
	startSegmentationBatch,
	type ProfilerState,
	type SegmentationBatchOutcome,
} from "./context-profiler/runtime.ts";
import { bundleStatusBarText } from "./context-profiler/render.ts";
import type { SegmentationState } from "./context-profiler/segmentation.ts";
import { ProfilerView, type InterrogationViewPort } from "./context-profiler/view.ts";

export const CONTEXT_PROFILER_COMMAND_NAME = "context-profiler";
const STATUS_KEY = "context-profiler";

/** One open overlay: its close callback and, once available, its handle and view. */
interface OverlaySession {
	close: () => void;
	handle: OverlayHandle | null;
	view: ProfilerView | null;
	detachSegmentation: (() => void) | null;
	bundleStore: BundleStore | null;
	persistence: BundlePersistenceState;
	whenPersisted: Promise<PersistedBundle | null> | null;
	segmentationCompletion: Promise<SegmentationBatchOutcome> | null;
	interrogation: InterrogationController | null;
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
		this.currentSession?.interrogation?.dispose();
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
	// before_agent_start and context events only fire on model turns; pull the
	// current prompt and session-context state directly so the profiler works
	// immediately after an extension reload.
	const state = runtime.captureCurrentState(ctx);
	const gateway = createCodexAnalysisModelGateway(ctx.modelRegistry);
	const profile = buildProfile(ctx, state);
	const session: OverlaySession = {
		close: () => {},
		handle: null,
		view: null,
		detachSegmentation: null,
		bundleStore: createFsBundleStore({ sessionDir: ctx.sessionManager.getSessionDir(), sessionId: ctx.sessionManager.getSessionId() }),
		persistence: { type: "pending" },
		whenPersisted: null,
		segmentationCompletion: null,
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
	const startWork = (workState: ProfilerState, workProfile: ReturnType<typeof buildProfile>, force: boolean): SegmentationState => {
		session.detachSegmentation?.();
		const store = session.bundleStore;
		if (store === null) throw new Error("bundle store missing");
		const persist = startBundlePersist({ store, state: workState, profile: workProfile, sessionId: ctx.sessionManager.getSessionId(), onUpdate: onPersistenceUpdate });
		session.persistence = persist.initial;
		session.whenPersisted = persist.whenPersisted;
		onPersistenceUpdate(persist.initial);
		const segmentation = startSegmentationBatch({ gateway, profile: workProfile, state: workState, force, onUpdate: onSegmentationUpdate });
		session.detachSegmentation = segmentation.detach;
		session.segmentationCompletion = segmentation.completion;
		joinEpisodesWrite({
			whenPersisted: persist.whenPersisted,
			completion: segmentation.completion,
			store,
			analysisModel: `${ANALYSIS_MODEL_PROVIDER}/${ANALYSIS_MODEL_ID}`,
			onResult: (result) => {
				if (result.ok || !sessions.isCurrent(session)) return;
				ctx.ui.notify(`Context profiler could not write episodes.json: ${result.error.message}`, "warning");
			},
		});
		return segmentation.initial;
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
						session.interrogation?.dispose();
						session.interrogation = null;
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
			const message = error instanceof Error ? error.message : String(error);
			ctx.ui.notify(`Context profiler failed: ${message}`, "error");
		})
		.finally(() => {
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
}): { ok: true; port: InterrogationViewPort } | { ok: false; reason: string } {
	const { ctx, session } = options;
	if (session.persistence.type !== "persisted") return { ok: false, reason: bundleUnavailableReason(session.persistence) };
	if (ctx.model === undefined) return { ok: false, reason: "The host session has no selected model, so the interrogation agent cannot start." };
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
	const controller = session.interrogation;
	return {
		ok: true,
		port: {
			getState: () => controller.state,
			bundleOrdinal: controller.bundleOrdinal,
			ask: (question, scope) => {
				void controller.ask(question, scope);
			},
			abortTurn: () => {
				void controller.abortTurn();
			},
		},
	};
}

function bundleUnavailableReason(state: BundlePersistenceState): string {
	switch (state.type) {
		case "pending":
			return "The context bundle is still being written. Wait a moment, then press Esc and p again.";
		case "skipped":
			return `Interrogation needs a context bundle, but this snapshot could not be bundled: ${state.message}`;
		case "failed":
			return `The context bundle could not be written: ${state.message}. Interrogation is disabled because it can only read bundles from disk.`;
		case "persisted":
			return "The context bundle is unavailable, so interrogation cannot start.";
	}
}

function closeProfiler(ctx: ExtensionContext, sessions: OverlaySessionController): void {
	// Teardown converges in the ui.custom(...).finally() in openProfiler:
	// close() settles that chain, which detaches in-flight segmentation view updates
	// (session_shutdown routes here too).
	sessions.close(ctx);
}
