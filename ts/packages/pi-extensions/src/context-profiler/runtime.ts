/**
 * Live-update state for the context profiler: what the extension has captured
 * from session events, and how a frozen ProfileSnapshot is assembled from it.
 *
 * Authoritative-source rule: the `context` event carries the exact messages
 * sent to the provider and is authoritative whenever one has been received
 * this session. The session-branch fallback is used only before the first
 * `context` event arrives (e.g. the profiler is opened before any prompt is
 * sent). The snapshot records which source was used (`liveSource`), surfaced
 * in the view's `?` help layer rather than always-on chrome.
 */

import type {
	BeforeAgentStartEvent,
	BuildSystemPromptOptions,
	ContextEvent,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { buildEpisodeAnalysisPayload } from "./analysis.ts";
import type { AnalysisModelGateway } from "./analysis-model-gateway.ts";
import {
	buildBaseRegions,
	buildLiveRegions,
	capTurns,
	deriveLiveTurns,
	type EpisodeAnnotation,
	type ProfileSnapshot,
} from "./model.ts";
import {
	buildSegmentationPayload,
	computeSegmentationFingerprint,
	MIN_TURNS_FOR_SEGMENTATION,
	repairEpisodes,
	type EpisodeAnalysisStatus,
	type SegmentationState,
} from "./segmentation.ts";

/** Last successful segmentation, reused while the snapshot fingerprint holds. */
export interface SegmentationCacheEntry {
	fingerprint: string;
	episodes: EpisodeAnnotation[];
	summary: string | null;
}

export interface ProfilerState {
	lastPromptOptions: BuildSystemPromptOptions | null;
	lastSystemPrompt: string | null;
	latestContextMessages: readonly unknown[] | null;
	segmentationCache: SegmentationCacheEntry | null;
}

export function createProfilerState(): ProfilerState {
	return {
		lastPromptOptions: null,
		lastSystemPrompt: null,
		latestContextMessages: null,
		segmentationCache: null,
	};
}

export function handleBeforeAgentStart(event: BeforeAgentStartEvent, state: ProfilerState): void {
	state.lastPromptOptions = event.systemPromptOptions;
	state.lastSystemPrompt = event.systemPrompt;
}

export function handleContext(event: ContextEvent, state: ProfilerState): void {
	state.latestContextMessages = [...event.messages];
}

/**
 * Re-capture the prompt state directly from the context. `before_agent_start`
 * only fires on the next turn, so opening or refreshing the profiler pulls
 * what it can immediately. `getSystemPromptOptions()` is not part of the
 * pinned 0.78.0 extension surface, so it is probed at runtime: when the
 * running Pi provides it, options re-capture works; otherwise the last
 * `before_agent_start` capture stands and only the assembled prompt refreshes.
 */
export function capturePromptState(ctx: ExtensionContext, state: ProfilerState): void {
	state.lastSystemPrompt = ctx.getSystemPrompt();
	const options = probeSystemPromptOptions(ctx);
	if (options !== null) state.lastPromptOptions = options;
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

export interface StartSegmentationOptions {
	gateway: AnalysisModelGateway;
	profile: ProfileSnapshot;
	state: ProfilerState;
	/** Bypass the fingerprint cache and always recompute (the `r` refresh path). */
	force: boolean;
	onUpdate: (segmentation: SegmentationState) => void;
}

/**
 * On-demand segmentation + per-episode analysis controller. Resolves
 * synchronously to idle (too few turns), a fully-cached ready state, or a
 * cached ready state whose missing verdicts are being analyzed. Fresh
 * segmentation returns loading first, then emits ready when symbols exist.
 * Aborted calls never reach onUpdate, and errors are surfaced but never block
 * deterministic rows. Analysis failures are not cached, so reopen retries.
 */
export function startSegmentation(options: StartSegmentationOptions): { initial: SegmentationState; abort: () => void } {
	const { gateway, profile, state, force, onUpdate } = options;
	if (profile.liveTurns.length < MIN_TURNS_FOR_SEGMENTATION) {
		return { initial: { type: "idle" }, abort: () => {} };
	}
	const fingerprint = computeSegmentationFingerprint(profile);
	const cached = state.segmentationCache;
	const controller = new AbortController();
	if (!force && cached !== null && cached.fingerprint === fingerprint) {
		const initial = readyState(cached.episodes, cached.summary, initialAnalysisStatuses(cached.episodes));
		startMissingEpisodeAnalysis({ gateway, profile, state, fingerprint, controller, onUpdate });
		return { initial, abort: () => controller.abort() };
	}
	const payload = buildSegmentationPayload(profile);
	// Rejection handling is scoped to the gateway promise via the two-argument
	// .then form: gateway failures are values, so a rejection is a programmer
	// error in the gateway; surface it as an error state to keep the overlay
	// functional. A throw from inside the fulfillment handler is also a
	// programmer error, but it must NOT be converted into an error update —
	// onUpdate(ready) may already have fired and the cache been written, so a
	// contradictory error update would corrupt view state. It surfaces as an
	// unhandled rejection instead.
	void gateway.segmentTurns({ json: payload.json }, { signal: controller.signal }).then(
		(result) => {
			if (controller.signal.aborted) return;
			if (!result.ok) {
				if (result.error.code === "aborted") return;
				onUpdate({ type: "error", message: result.error.message });
				return;
			}
			const episodes = repairEpisodes(result.value.episodes, profile.liveTurns);
			state.segmentationCache = { fingerprint, episodes, summary: result.value.summary };
			const analysis = initialAnalysisStatuses(episodes);
			onUpdate(readyState(episodes, result.value.summary, analysis));
			startMissingEpisodeAnalysis({ gateway, profile, state, fingerprint, controller, onUpdate, statuses: analysis });
		},
		(error: unknown) => {
			if (controller.signal.aborted) return;
			onUpdate({ type: "error", message: error instanceof Error ? error.message : String(error) });
		},
	);
	return { initial: { type: "loading" }, abort: () => controller.abort() };
}

interface StartEpisodeAnalysisOptions {
	gateway: AnalysisModelGateway;
	profile: ProfileSnapshot;
	state: ProfilerState;
	fingerprint: string;
	controller: AbortController;
	onUpdate: (segmentation: SegmentationState) => void;
	statuses?: EpisodeAnalysisStatus[];
}

function startMissingEpisodeAnalysis(options: StartEpisodeAnalysisOptions): void {
	const cache = options.state.segmentationCache;
	if (cache === null || cache.fingerprint !== options.fingerprint) return;
	const statuses = options.statuses ?? initialAnalysisStatuses(cache.episodes);
	cache.episodes.forEach((episode, episodeIndex) => {
		if (hasAnalysisVerdicts(episode)) return;
		statuses[episodeIndex] = "loading";
		const payload = buildEpisodeAnalysisPayload({ profile: options.profile, episodes: cache.episodes, episodeIndex, summary: cache.summary });
		void options.gateway.analyzeEpisode({ json: payload.json }, { signal: options.controller.signal }).then(
			(result) => {
				if (options.controller.signal.aborted) return;
				const currentCache = options.state.segmentationCache;
				if (currentCache === null || currentCache.fingerprint !== options.fingerprint) return;
				if (!result.ok) {
					if (result.error.code === "aborted") return;
					statuses[episodeIndex] = { type: "error", message: result.error.message };
					options.onUpdate(readyState(currentCache.episodes, currentCache.summary, statuses));
					return;
				}
				currentCache.episodes = currentCache.episodes.map((candidate, index) => index === episodeIndex
					? { ...candidate, efficiency: result.value.efficiency, relevance: result.value.relevance }
					: candidate);
				statuses[episodeIndex] = "ready";
				options.onUpdate(readyState(currentCache.episodes, currentCache.summary, statuses));
			},
			(error: unknown) => {
				if (options.controller.signal.aborted) return;
				const currentCache = options.state.segmentationCache;
				if (currentCache === null || currentCache.fingerprint !== options.fingerprint) return;
				statuses[episodeIndex] = { type: "error", message: error instanceof Error ? error.message : String(error) };
				options.onUpdate(readyState(currentCache.episodes, currentCache.summary, statuses));
			},
		);
	});
}

function readyState(episodes: readonly EpisodeAnnotation[], summary: string | null, analysis: readonly EpisodeAnalysisStatus[]): SegmentationState {
	return { type: "ready", episodes: [...episodes], summary, analysis: [...analysis] };
}

function initialAnalysisStatuses(episodes: readonly EpisodeAnnotation[]): EpisodeAnalysisStatus[] {
	return episodes.map((episode): EpisodeAnalysisStatus => hasAnalysisVerdicts(episode) ? "ready" : "loading");
}

function hasAnalysisVerdicts(episode: EpisodeAnnotation): boolean {
	return episode.efficiency !== undefined && episode.relevance !== undefined;
}
