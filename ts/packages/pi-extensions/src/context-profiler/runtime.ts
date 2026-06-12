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
import { errorMessage } from "./errors.ts";
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
}

export function createProfilerState(): ProfilerState {
	return {
		lastPromptOptions: null,
		lastSystemPrompt: null,
		latestContext: null,
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
 * pinned 0.79.1 extension surface, so it is probed at runtime: when the
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

export interface SegmentationCacheAccess {
	read(): SegmentationCacheEntry | null;
	write(entry: SegmentationCacheEntry): void;
}

export function createSegmentationCacheCell(): SegmentationCacheAccess {
	let cache: SegmentationCacheEntry | null = null;
	return {
		read: () => cache,
		write: (entry) => {
			cache = entry;
		},
	};
}

export interface StartSegmentationOptions {
	gateway: AnalysisModelGateway;
	profile: ProfileSnapshot;
	cache: SegmentationCacheAccess;
	/** Bypass the fingerprint cache and always recompute (the `r` refresh path). */
	force: boolean;
	onUpdate: (segmentation: SegmentationState) => void;
}

interface SegmentationSink {
	commitReady(data: ReadyStateOptions): void;
	emitError(message: string): void;
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
	const { cache, gateway, profile, force, onUpdate } = options;
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
	const sink: SegmentationSink = {
		commitReady(data) {
			if (isDetached) return;
			// New batches synchronously detach previous batches before this factory returns;
			// `.finally()` cleanup is only a later idempotent backstop.
			cache.write({ fingerprint, episodes: [...data.episodes], summary: data.summary, delegations: [...data.delegations] });
			onUpdate(readyState(data));
		},
		emitError(message) {
			if (isDetached) return;
			onUpdate({ type: "error", message });
		},
	};
	const cached = cache.read();
	if (!force && cached !== null && cached.fingerprint === fingerprint) {
		const analysis = initialAnalysisStatuses(cached.episodes);
		const completion = runMissingEpisodeAnalysis({
			gateway,
			profile,
			signal,
			sink,
			episodesInput: cached.episodes,
			summary: cached.summary,
			delegations: cached.delegations,
			analysisInput: analysis,
		});
		return { initial: readyState({ episodes: cached.episodes, summary: cached.summary, delegations: cached.delegations, analysis }), detach, completion };
	}
	const completion = runFreshSegmentation({ gateway, profile, signal, sink });
	return { initial: { type: "loading" }, detach, completion };
}

interface FreshSegmentationOptions {
	gateway: AnalysisModelGateway;
	profile: ProfileSnapshot;
	signal: AbortSignal;
	sink: SegmentationSink;
}

async function runFreshSegmentation(options: FreshSegmentationOptions): Promise<SegmentationBatchOutcome> {
	const { gateway, profile, signal, sink } = options;
	const payload = buildSegmentationPayload(profile);
	let result: Awaited<ReturnType<AnalysisModelGateway["segmentTurns"]>>;
	try {
		result = await gateway.segmentTurns({ json: payload.json }, { signal });
	} catch (error) {
		const message = errorMessage(error);
		sink.emitError(message);
		return { type: "segmentation-error", message };
	}
	if (!result.ok) {
		if (result.error.code !== "aborted") sink.emitError(result.error.message);
		return { type: "segmentation-error", message: result.error.message };
	}
	const episodes = repairEpisodes(result.value.episodes, profile.liveTurns);
	const delegations = repairDelegations(result.value.delegations, profile.liveTurns);
	const summary = result.value.summary;
	const analysis = initialAnalysisStatuses(episodes);
	sink.commitReady({ episodes, summary, delegations, analysis });
	return runMissingEpisodeAnalysis({
		gateway,
		profile,
		signal,
		sink,
		episodesInput: episodes,
		summary,
		delegations,
		analysisInput: analysis,
	});
}

interface MissingEpisodeAnalysisOptions {
	gateway: AnalysisModelGateway;
	profile: ProfileSnapshot;
	signal: AbortSignal;
	sink: SegmentationSink;
	episodesInput: readonly EpisodeAnnotation[];
	summary: string | null;
	delegations: readonly DelegationClaim[];
	analysisInput: readonly EpisodeAnalysisStatus[];
}

async function runMissingEpisodeAnalysis(options: MissingEpisodeAnalysisOptions): Promise<SegmentationBatchOutcome> {
	const { gateway, profile, signal, sink, episodesInput, summary, delegations, analysisInput } = options;
	const episodes = episodesInput.map((episode) => ({ ...episode }));
	const analysis = [...analysisInput];
	const tasks = episodes.map(async (episode, episodeIndex) => {
		if (hasAnalysisVerdicts(episode)) {
			analysis[episodeIndex] = "ready";
			return;
		}
		analysis[episodeIndex] = "loading";
		const payload = buildEpisodeAnalysisPayload({
			profile,
			episodes,
			episodeIndex,
			summary,
			delegations,
		});
		try {
			const result = await gateway.analyzeEpisode({ json: payload.json }, { signal });
			if (!result.ok) {
				if (result.error.code !== "aborted") {
					analysis[episodeIndex] = { type: "error", message: result.error.message };
					sink.commitReady({ episodes, summary, delegations, analysis });
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
			sink.commitReady({ episodes, summary, delegations, analysis });
		} catch (error) {
			analysis[episodeIndex] = { type: "error", message: errorMessage(error) };
			sink.commitReady({ episodes, summary, delegations, analysis });
		}
	});
	await Promise.all(tasks);
	return { type: "ready", episodes, summary, delegations: [...delegations], analysis };
}

export interface StartProfilerWorkOptions {
	store: BundleStore;
	gateway: AnalysisModelGateway;
	state: ProfilerState;
	profile: ProfileSnapshot;
	sessionId: string;
	cache: SegmentationCacheAccess;
	force: boolean;
	onSegmentationUpdate: (segmentation: SegmentationState) => void;
	onPersistenceUpdate: (state: BundlePersistenceState) => void;
	onEpisodesWriteResult?: (result: WriteEpisodesFileResult) => void;
}

export function startProfilerWork(options: StartProfilerWorkOptions): {
	initialSegmentation: SegmentationState;
	initialPersistence: BundlePersistenceState;
	detach: () => void;
} {
	const persist = startBundlePersist({
		store: options.store,
		state: options.state,
		profile: options.profile,
		sessionId: options.sessionId,
		onUpdate: options.onPersistenceUpdate,
	});
	const segmentation = startSegmentationBatch({
		gateway: options.gateway,
		profile: options.profile,
		cache: options.cache,
		force: options.force,
		onUpdate: options.onSegmentationUpdate,
	});
	scheduleEpisodesWrite({
		whenPersisted: persist.whenPersisted,
		completion: segmentation.completion,
		store: options.store,
		analysisModel: options.gateway.analysisModel,
		onResult: options.onEpisodesWriteResult,
	});
	return { initialSegmentation: segmentation.initial, initialPersistence: persist.initial, detach: segmentation.detach };
}

interface ScheduleEpisodesWriteOptions {
	whenPersisted: Promise<PersistedBundle | null>;
	completion: Promise<SegmentationBatchOutcome>;
	store: BundleStore;
	analysisModel: string;
	onResult: ((result: WriteEpisodesFileResult) => void) | undefined;
}

function scheduleEpisodesWrite(options: ScheduleEpisodesWriteOptions): void {
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

function hasAnalysisVerdicts(episode: EpisodeAnnotation): boolean {
	return episode.efficiency !== undefined && episode.relevance !== undefined;
}
