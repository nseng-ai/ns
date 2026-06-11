/**
 * Live-update state for the context profiler: what the extension has captured
 * from session events, and how a frozen ProfileSnapshot is assembled from it.
 *
 * Source rule: the `context` event carries the exact messages sent to a
 * provider request while this extension instance is loaded. When the extension
 * has just reloaded, the profiler reconstructs the active session context from
 * the session tree so the overlay and interrogation can start immediately
 * without requiring a throwaway host prompt. The snapshot records which source
 * was used (`liveSource`), surfaced in the view's `?` help layer rather than
 * always-on chrome.
 */

import {
	buildSessionContext,
	type BeforeAgentStartEvent,
	type BuildSystemPromptOptions,
	type ContextEvent,
	type ExtensionCommandContext,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { buildEpisodeAnalysisPayload } from "./analysis.ts";
import type { AnalysisModelGateway } from "./analysis-model-gateway.ts";
import { buildBundleSnapshot, buildEpisodesFileJson, type BundlePersistenceState, type EpisodesFileOutcome } from "./bundle.ts";
import type { BundleStore, PersistedBundle, WriteEpisodesFileResult } from "./bundle-store.ts";
import {
	buildBaseRegions,
	buildLiveRegions,
	capTurns,
	deriveLiveTurns,
	type DelegationClaim,
	type EpisodeAnnotation,
	type LiveSource,
	type ProfileSnapshot,
} from "./model.ts";
import {
	buildSegmentationPayload,
	computeSegmentationFingerprint,
	MIN_TURNS_FOR_SEGMENTATION,
	repairDelegations,
	repairEpisodes,
	type EpisodeAnalysisStatus,
	type SegmentationState,
} from "./segmentation.ts";

/** Last successful segmentation, reused while the snapshot fingerprint holds. */
export interface SegmentationCacheEntry {
	fingerprint: string;
	episodes: EpisodeAnnotation[];
	summary: string | null;
	delegations: DelegationClaim[];
}

export interface ProfilerState {
	lastPromptOptions: BuildSystemPromptOptions | null;
	lastSystemPrompt: string | null;
	latestContextMessages: readonly unknown[] | null;
	latestContextSource: LiveSource | null;
	contextEventCount: number;
	lastContextEventAt: string | null;
	beforeAgentStartEventCount: number;
	lastBeforeAgentStartEventAt: string | null;
	segmentationCache: SegmentationCacheEntry | null;
}

export function createProfilerState(): ProfilerState {
	return {
		lastPromptOptions: null,
		lastSystemPrompt: null,
		latestContextMessages: null,
		latestContextSource: null,
		contextEventCount: 0,
		lastContextEventAt: null,
		beforeAgentStartEventCount: 0,
		lastBeforeAgentStartEventAt: null,
		segmentationCache: null,
	};
}

export function handleBeforeAgentStart(event: BeforeAgentStartEvent, state: ProfilerState): ProfilerState {
	return {
		...state,
		lastPromptOptions: event.systemPromptOptions,
		lastSystemPrompt: event.systemPrompt,
		beforeAgentStartEventCount: state.beforeAgentStartEventCount + 1,
		lastBeforeAgentStartEventAt: new Date().toLocaleTimeString(),
	};
}

export function handleContext(event: ContextEvent, state: ProfilerState): ProfilerState {
	return {
		...state,
		latestContextMessages: [...event.messages],
		latestContextSource: "context-event",
		contextEventCount: state.contextEventCount + 1,
		lastContextEventAt: new Date().toLocaleTimeString(),
	};
}

/**
 * Re-capture the prompt state directly from the context. `before_agent_start`
 * only fires on the next turn, so opening or refreshing the profiler pulls
 * what it can immediately. `getSystemPromptOptions()` is not part of the
 * pinned 0.78.0 extension surface, so it is probed at runtime: when the
 * running Pi provides it, options re-capture works; otherwise the last
 * `before_agent_start` capture stands and only the assembled prompt refreshes.
 */
export function capturePromptState(ctx: ExtensionContext, state: ProfilerState): ProfilerState {
	const options = probeSystemPromptOptions(ctx);
	return {
		...state,
		lastPromptOptions: options ?? state.lastPromptOptions,
		lastSystemPrompt: ctx.getSystemPrompt(),
	};
}

export function captureCurrentState(ctx: ExtensionContext, state: ProfilerState): ProfilerState {
	const promptState = capturePromptState(ctx, state);
	if (promptState.latestContextMessages !== null) return promptState;
	const sessionContext = buildSessionContext(ctx.sessionManager.getEntries(), ctx.sessionManager.getLeafId());
	return {
		...promptState,
		latestContextMessages: [...sessionContext.messages],
		latestContextSource: "session-context",
	};
}

function probeSystemPromptOptions(ctx: ExtensionContext): BuildSystemPromptOptions | null {
	const candidate = (ctx as { getSystemPromptOptions?: unknown }).getSystemPromptOptions;
	if (typeof candidate !== "function") return null;
	return candidate.call(ctx) as BuildSystemPromptOptions;
}

/**
 * Assemble a frozen snapshot from the current state. Live events received
 * while an overlay is open update `state` for the *next* build; they never
 * mutate a snapshot already on screen.
 */
export function buildProfile(ctx: ExtensionCommandContext, state: ProfilerState): ProfileSnapshot {
	const live = deriveLiveTurns({
		contextMessages: state.latestContextMessages,
		contextSource: state.latestContextSource,
		branchEntries: ctx.sessionManager.getBranch(),
	});
	const capped = capTurns(live.turns);
	return {
		cwd: ctx.cwd,
		model: ctx.model === undefined ? "model unknown" : `${ctx.model.provider}/${ctx.model.id}`,
		usage: ctx.getContextUsage(),
		baseRegions: buildBaseRegions(state.lastPromptOptions, state.lastSystemPrompt),
		liveTurns: capped.turns,
		liveRegions: buildLiveRegions(capped.turns),
		liveSource: live.source,
		cap: capped.cap,
		openedAt: new Date().toLocaleTimeString(),
	};
}

export interface StartBundlePersistOptions {
	store: BundleStore;
	state: ProfilerState;
	profile: ProfileSnapshot;
	sessionId: string;
	onUpdate: (state: BundlePersistenceState) => void;
}

export function startBundlePersist(options: StartBundlePersistOptions): {
	initial: BundlePersistenceState;
	whenPersisted: Promise<PersistedBundle | null>;
} {
	const snapshot = buildBundleSnapshot({
		messages: options.state.latestContextMessages,
		systemPrompt: options.state.lastSystemPrompt,
		promptOptions: options.state.lastPromptOptions,
		sessionId: options.sessionId,
		cwd: options.profile.cwd,
		model: options.profile.model,
		usage: options.profile.usage,
		liveSource: options.profile.liveSource,
	});
	if (!snapshot.ok) {
		const skipped: BundlePersistenceState = snapshot.error.code === "no-provider-context"
			? { type: "skipped", reason: "no-provider-context", message: noProviderContextMessage(options.state, options.profile) }
			: { type: "failed", message: snapshot.error.message };
		return { initial: skipped, whenPersisted: Promise.resolve(null) };
	}
	const whenPersisted = options.store.persistBundle(snapshot.value).then((result): PersistedBundle | null => {
		if (!result.ok) {
			options.onUpdate({ type: "failed", message: result.error.message });
			return null;
		}
		const persisted = persistenceStateFromBundle(result.value);
		options.onUpdate(persisted);
		return result.value;
	}, (error: unknown) => {
		options.onUpdate({ type: "failed", message: error instanceof Error ? error.message : String(error) });
		return null;
	});
	return { initial: { type: "pending" }, whenPersisted };
}

function noProviderContextMessage(state: ProfilerState, profile: ProfileSnapshot): string {
	const lastContext = state.lastContextEventAt ?? "never";
	const lastBeforeAgentStart = state.lastBeforeAgentStartEventAt ?? "never";
	return `No context messages are available for this snapshot. The profiler can still show ${profile.liveTurns.length.toLocaleString()} ${profile.liveSource} turn(s), but interrogation requires a bundle built from provider or reconstructed session context. Press r or reopen /context-profiler to retry. Debug: contextEvents=${state.contextEventCount.toLocaleString()} (last=${lastContext}); beforeAgentStartEvents=${state.beforeAgentStartEventCount.toLocaleString()} (last=${lastBeforeAgentStart}); latestContextMessages=null; liveSource=${profile.liveSource}.`;
}

function persistenceStateFromBundle(bundle: PersistedBundle): BundlePersistenceState {
	return {
		type: "persisted",
		ordinal: bundle.ordinal,
		dir: bundle.dir,
		contentHash: bundle.contentHash,
		byteSize: bundle.byteSize,
		sessionTotalBytes: bundle.sessionTotalBytes,
		reused: bundle.reused,
		sessionId: bundle.sessionId,
		model: bundle.model,
		turnCount: bundle.turnCount,
		capturedAt: bundle.capturedAt,
	};
}

export interface StartSegmentationOptions {
	gateway: AnalysisModelGateway;
	profile: ProfileSnapshot;
	state: ProfilerState;
	/** Bypass the fingerprint cache and always recompute (the `r` refresh path). */
	force: boolean;
	onUpdate: (segmentation: SegmentationState) => void;
}

export type SegmentationBatchOutcome =
	| { type: "ready"; episodes: EpisodeAnnotation[]; summary: string | null; delegations: DelegationClaim[]; analysis: EpisodeAnalysisStatus[] }
	| { type: "segmentation-error"; message: string }
	| { type: "skipped"; reason: "too-few-turns" };

/**
 * Startup segmentation + per-episode analysis controller. Detaching gates view
 * and cache mutation only; the LM calls continue to terminal state so their
 * bundle can receive episodes.json.
 */
export function startSegmentationBatch(options: StartSegmentationOptions): {
	initial: SegmentationState;
	detach: () => void;
	completion: Promise<SegmentationBatchOutcome>;
} {
	const { gateway, profile, state, force, onUpdate } = options;
	let detached = false;
	const detach = (): void => {
		detached = true;
	};
	if (profile.liveTurns.length < MIN_TURNS_FOR_SEGMENTATION) {
		return { initial: { type: "idle" }, detach, completion: Promise.resolve({ type: "skipped", reason: "too-few-turns" }) };
	}
	const fingerprint = computeSegmentationFingerprint(profile);
	const controller = new AbortController();
	const emitReady = (ready: ReadyStateOptions): void => {
		if (detached) return;
		onUpdate(readyState(ready));
	};
	const emitError = (message: string): void => {
		if (detached) return;
		onUpdate({ type: "error", message });
	};
	const cached = state.segmentationCache;
	if (!force && cached !== null && cached.fingerprint === fingerprint) {
		const analysis = initialAnalysisStatuses(cached.episodes);
		const completion = runMissingEpisodeAnalysis({
			gateway,
			profile,
			state,
			fingerprint,
			episodes: cached.episodes,
			summary: cached.summary,
			delegations: cached.delegations,
			analysis,
			controller,
			canWriteCache: () => !detached,
			onUpdate: emitReady,
		});
		return { initial: readyState({ episodes: cached.episodes, summary: cached.summary, delegations: cached.delegations, analysis }), detach, completion };
	}
	const completion = runFreshSegmentation({
		gateway,
		profile,
		state,
		fingerprint,
		controller,
		canWriteCache: () => !detached,
		onReady: emitReady,
		onError: emitError,
	});
	return { initial: { type: "loading" }, detach, completion };
}

/** Backward-compatible wrapper for older tests/callers; abort now means detach. */
export function startSegmentation(options: StartSegmentationOptions): { initial: SegmentationState; abort: () => void } {
	const batch = startSegmentationBatch(options);
	return { initial: batch.initial, abort: batch.detach };
}

interface RunFreshSegmentationOptions {
	gateway: AnalysisModelGateway;
	profile: ProfileSnapshot;
	state: ProfilerState;
	fingerprint: string;
	controller: AbortController;
	canWriteCache: () => boolean;
	onReady: (ready: ReadyStateOptions) => void;
	onError: (message: string) => void;
}

async function runFreshSegmentation(options: RunFreshSegmentationOptions): Promise<SegmentationBatchOutcome> {
	const payload = buildSegmentationPayload(options.profile);
	let result: Awaited<ReturnType<AnalysisModelGateway["segmentTurns"]>>;
	try {
		result = await options.gateway.segmentTurns({ json: payload.json }, { signal: options.controller.signal });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		options.onError(message);
		return { type: "segmentation-error", message };
	}
	if (!result.ok) {
		if (result.error.code !== "aborted") options.onError(result.error.message);
		return { type: "segmentation-error", message: result.error.message };
	}
	const episodes = repairEpisodes(result.value.episodes, options.profile.liveTurns);
	const delegations = repairDelegations(result.value.delegations, options.profile.liveTurns);
	const summary = result.value.summary;
	const analysis = initialAnalysisStatuses(episodes);
	if (options.canWriteCache()) {
		options.state.segmentationCache = { fingerprint: options.fingerprint, episodes, summary, delegations };
		options.onReady({ episodes, summary, delegations, analysis });
	}
	return runMissingEpisodeAnalysis({
		gateway: options.gateway,
		profile: options.profile,
		state: options.state,
		fingerprint: options.fingerprint,
		episodes,
		summary,
		delegations,
		analysis,
		controller: options.controller,
		canWriteCache: options.canWriteCache,
		onUpdate: options.onReady,
	});
}

interface RunEpisodeAnalysisOptions {
	gateway: AnalysisModelGateway;
	profile: ProfileSnapshot;
	state: ProfilerState;
	fingerprint: string;
	episodes: readonly EpisodeAnnotation[];
	summary: string | null;
	delegations: readonly DelegationClaim[];
	analysis: EpisodeAnalysisStatus[];
	controller: AbortController;
	canWriteCache: () => boolean;
	onUpdate: (ready: ReadyStateOptions) => void;
}

async function runMissingEpisodeAnalysis(options: RunEpisodeAnalysisOptions): Promise<SegmentationBatchOutcome> {
	const episodes = options.episodes.map((episode) => ({ ...episode }));
	const analysis = [...options.analysis];
	const tasks = episodes.map(async (episode, episodeIndex) => {
		if (hasAnalysisVerdicts(episode)) {
			analysis[episodeIndex] = "ready";
			return;
		}
		analysis[episodeIndex] = "loading";
		const payload = buildEpisodeAnalysisPayload({
			profile: options.profile,
			episodes,
			episodeIndex,
			summary: options.summary,
			delegations: options.delegations,
		});
		try {
			const result = await options.gateway.analyzeEpisode({ json: payload.json }, { signal: options.controller.signal });
			if (!result.ok) {
				if (result.error.code !== "aborted") {
					analysis[episodeIndex] = { type: "error", message: result.error.message };
					emitAnalysisUpdate(options, episodes, analysis);
				}
				return;
			}
			episodes[episodeIndex] = {
				...episode,
				efficiency: result.value.efficiency,
				relevance: result.value.relevance,
				...(result.value.summary === null ? {} : { analysisSummary: result.value.summary }),
			};
			analysis[episodeIndex] = "ready";
			emitAnalysisUpdate(options, episodes, analysis);
		} catch (error) {
			analysis[episodeIndex] = { type: "error", message: error instanceof Error ? error.message : String(error) };
			emitAnalysisUpdate(options, episodes, analysis);
		}
	});
	await Promise.all(tasks);
	return { type: "ready", episodes, summary: options.summary, delegations: [...options.delegations], analysis };
}

function emitAnalysisUpdate(options: RunEpisodeAnalysisOptions, episodes: readonly EpisodeAnnotation[], analysis: readonly EpisodeAnalysisStatus[]): void {
	if (!options.canWriteCache()) return;
	const currentCache = options.state.segmentationCache;
	if (currentCache === null || currentCache.fingerprint !== options.fingerprint) return;
	options.state.segmentationCache = { ...currentCache, episodes: [...episodes] };
	options.onUpdate({ episodes, summary: options.summary, delegations: options.delegations, analysis });
}

export interface JoinEpisodesWriteOptions {
	whenPersisted: Promise<PersistedBundle | null>;
	completion: Promise<SegmentationBatchOutcome>;
	store: BundleStore;
	analysisModel: string;
	onResult?: (result: WriteEpisodesFileResult) => void;
}

export function joinEpisodesWrite(options: JoinEpisodesWriteOptions): void {
	void Promise.all([options.whenPersisted, options.completion]).then(async ([bundle, outcome]) => {
		if (bundle === null) return;
		const json = buildEpisodesFileJson({ outcome: episodesFileOutcome(outcome), contentHash: bundle.contentHash, analysisModel: options.analysisModel });
		const result = await options.store.writeEpisodesFile({ bundleDir: bundle.dir, json });
		options.onResult?.(result);
	}).catch((error: unknown) => {
		options.onResult?.({ ok: false, error: { code: "io-error", message: error instanceof Error ? error.message : String(error) } });
	});
}

function episodesFileOutcome(outcome: SegmentationBatchOutcome): EpisodesFileOutcome {
	switch (outcome.type) {
		case "ready":
			return outcome;
		case "segmentation-error":
			return outcome;
		case "skipped":
			return outcome;
	}
}

interface ReadyStateOptions {
	episodes: readonly EpisodeAnnotation[];
	summary: string | null;
	delegations: readonly DelegationClaim[];
	analysis: readonly EpisodeAnalysisStatus[];
}

function readyState(options: ReadyStateOptions): SegmentationState {
	return {
		type: "ready",
		episodes: [...options.episodes],
		summary: options.summary,
		delegations: [...options.delegations],
		analysis: [...options.analysis],
	};
}

function initialAnalysisStatuses(episodes: readonly EpisodeAnnotation[]): EpisodeAnalysisStatus[] {
	return episodes.map((episode): EpisodeAnalysisStatus => hasAnalysisVerdicts(episode) ? "ready" : "loading");
}

function hasAnalysisVerdicts(episode: EpisodeAnnotation): boolean {
	return episode.efficiency !== undefined && episode.relevance !== undefined;
}
