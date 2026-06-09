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
import {
	buildBaseRegions,
	buildLiveRegions,
	capTurns,
	deriveLiveTurns,
	type EpisodeAnnotation,
	type ProfileSnapshot,
} from "./model.ts";

export interface ProfilerState {
	lastPromptOptions: BuildSystemPromptOptions | null;
	lastSystemPrompt: string | null;
	latestContextMessages: readonly unknown[] | null;
}

export function createProfilerState(): ProfilerState {
	return {
		lastPromptOptions: null,
		lastSystemPrompt: null,
		latestContextMessages: null,
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
export function buildProfile(ctx: ExtensionCommandContext, state: ProfilerState, episodes?: readonly EpisodeAnnotation[]): ProfileSnapshot {
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
		liveRegions: buildLiveRegions(capped.turns, episodes),
		liveSource: live.source,
		cap: capped.cap,
		openedAt: new Date().toLocaleTimeString(),
	};
}
