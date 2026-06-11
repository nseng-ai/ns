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
import { buildBundleSnapshot, buildEpisodesFileJson, type BundlePersistenceState, type PersistedBundle } from "./bundle.ts";
import type { BundleStore, WriteEpisodesFileResult } from "./bundle-store.ts";
import {
	buildBaseRegions,
	buildLiveRegions,
	capTurns,
	deriveLiveTurns,
	type CapturedContext,
	type DelegationClaim,
	type EpisodeAnnotation,
	type ProfileSnapshot,
} from "./model.ts";
import {
	buildSegmentationPayload,
	computeSegmentationFingerprint,
	MIN_TURNS_FOR_SEGMENTATION,
	repairDelegations,
	repairEpisodes,
	type EpisodeAnalysisStatus,
	type SegmentationBatchOutcome,
	type SegmentationState,
} from "./segmentation.ts";
import { errorMessage } from "./errors.ts";

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
	latestContext: CapturedContext | null;
	segmentationCache: SegmentationCacheEntry | null;
}

export function createProfilerState(): ProfilerState {
	return {
		lastPromptOptions: null,
		lastSystemPrompt: null,
		latestContext: null,
		segmentationCache: null,
	};
}

export function handleBeforeAgentStart(event: BeforeAgentStartEvent, state: ProfilerState): ProfilerState {
	return {
		...state,
		lastPromptOptions: event.systemPromptOptions,
		lastSystemPrompt: event.systemPrompt,
	};
}

export function handleContext(event: ContextEvent, state: ProfilerState): ProfilerState {
	return {
		...state,
		latestContext: { messages: [...event.messages], source: "context-event" },
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
	if (promptState.latestContext !== null) return promptState;
	const sessionContext = buildSessionContext(ctx.sessionManager.getEntries(), ctx.sessionManager.getLeafId());
	return {
		...promptState,
		latestContext: { messages: [...sessionContext.messages], source: "session-context" },
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
		context: state.latestContext,
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
		messages: options.state.latestContext?.messages ?? null,
		systemPrompt: options.state.lastSystemPrompt,
		promptOptions: options.state.lastPromptOptions,
		sessionId: options.sessionId,
		cwd: options.profile.cwd,
		model: options.profile.model,
		usage: options.profile.usage,
		liveSource: options.profile.liveSource,
	});
	if (!snapshot.ok) {
		const skipped: BundlePersistenceState = snapshot.error.code === "empty-context"
			? { type: "skipped", reason: "empty-context" }
			: { type: "failed", message: snapshot.error.message };
		return { initial: skipped, whenPersisted: Promise.resolve(null) };
	}
	const whenPersisted = options.store.persistBundle(snapshot.value).then((result): PersistedBundle | null => {
		if (!result.ok) {
			options.onUpdate({ type: "failed", message: result.error.message });
			return null;
		}
		options.onUpdate({ type: "persisted", ...result.value });
		return result.value;
	}, (error: unknown) => {
		options.onUpdate({ type: "failed", message: errorMessage(error) });
		return null;
	});
	return { initial: { type: "pending" }, whenPersisted };
}

export interface StartSegmentationOptions {
	gateway: AnalysisModelGateway;
	profile: ProfileSnapshot;
	state: ProfilerState;
	/** Bypass the fingerprint cache and always recompute (the `r` refresh path). */
	force: boolean;
	onUpdate: (segmentation: SegmentationState) => void;
}

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
	let isDetached = false;
	const detach = (): void => {
		isDetached = true;
	};
	if (profile.liveTurns.length < MIN_TURNS_FOR_SEGMENTATION) {
		return { initial: { type: "idle" }, detach, completion: Promise.resolve({ type: "skipped", reason: "too-few-turns" }) };
	}
	const fingerprint = computeSegmentationFingerprint(profile);
	// Detach-only model: keep LM calls running for episodes.json; gateways still require a signal.
	const signal = new AbortController().signal;
	const emitReady = (ready: ReadyStateOptions): void => {
		if (isDetached) return;
		onUpdate(readyState(ready));
	};
	const emitError = (message: string): void => {
		if (isDetached) return;
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
			signal,
			canWriteCache: () => !isDetached,
			onUpdate: emitReady,
		});
		return { initial: readyState({ episodes: cached.episodes, summary: cached.summary, delegations: cached.delegations, analysis }), detach, completion };
	}
	const completion = runFreshSegmentation({
		gateway,
		profile,
		state,
		fingerprint,
		signal,
		canWriteCache: () => !isDetached,
		onReady: emitReady,
		onError: emitError,
	});
	return { initial: { type: "loading" }, detach, completion };
}

interface RunFreshSegmentationOptions {
	gateway: AnalysisModelGateway;
	profile: ProfileSnapshot;
	state: ProfilerState;
	fingerprint: string;
	signal: AbortSignal;
	canWriteCache: () => boolean;
	onReady: (ready: ReadyStateOptions) => void;
	onError: (message: string) => void;
}

async function runFreshSegmentation(options: RunFreshSegmentationOptions): Promise<SegmentationBatchOutcome> {
	const payload = buildSegmentationPayload(options.profile);
	let result: Awaited<ReturnType<AnalysisModelGateway["segmentTurns"]>>;
	try {
		result = await options.gateway.segmentTurns({ json: payload.json }, { signal: options.signal });
	} catch (error) {
		const message = errorMessage(error);
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
		rememberSegmentationCache(options.state, { fingerprint: options.fingerprint, episodes, summary, delegations });
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
		signal: options.signal,
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
	signal: AbortSignal;
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
			const result = await options.gateway.analyzeEpisode({ json: payload.json }, { signal: options.signal });
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
			analysis[episodeIndex] = { type: "error", message: errorMessage(error) };
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
	rememberSegmentationCache(options.state, { ...currentCache, episodes: [...episodes] });
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
		const json = buildEpisodesFileJson({ outcome, contentHash: bundle.manifest.contentHash, analysisModel: options.analysisModel });
		const result = await options.store.writeEpisodesFile({ bundleDir: bundle.dir, json });
		options.onResult?.(result);
	}).catch((error: unknown) => {
		options.onResult?.({ ok: false, error: { code: "io-error", message: errorMessage(error) } });
	});
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

function rememberSegmentationCache(state: ProfilerState, entry: SegmentationCacheEntry): void {
	state.segmentationCache = entry;
}

function hasAnalysisVerdicts(episode: EpisodeAnnotation): boolean {
	return episode.efficiency !== undefined && episode.relevance !== undefined;
}
