import { formatErrorMessage, optionalEntry } from "@nseng-ai/foundation/primitives";

import {
	assumeThinkingWhileRunning,
	entryId,
	entrySessionFile,
	isRunningTaskDetailEntry,
	loadFleetEntryDetail,
	placeholderDetail,
	type FleetDetailContext,
	type FleetEntrySessionParseCache,
	type FleetNavigatorEntry,
	type SubagentFleetTaskDetail,
} from "./detail.ts";

/**
 * The observation surface an entry detail is loaded for. List previews and
 * full detail are mutually exclusive per entry and never share committed
 * detail or parse-cache state across a surface transition.
 */
export type FleetEntrySurface = "preview" | "detail";

/**
 * Per-entry loader state keyed by stable entry id in the navigator. All
 * committed data belongs to the currently active surface lifetime; activating
 * a lifetime clears it.
 */
export interface EntryDetailState {
	/** Whether the entry remains expanded in list mode. */
	isExpanded: boolean;
	/** The active observation surface; undefined while dormant. */
	activeSurface?: FleetEntrySurface;
	/**
	 * Monotonic lifetime generation assigned from a navigator-wide counter, so
	 * it cannot collide after this state is deleted and recreated. Every
	 * lifecycle reset (collapse, re-expand, surface transition, session
	 * identity change, deactivation) replaces it, and a settled load may commit
	 * only when its captured generation still matches exactly.
	 */
	generation: number;
	/** Session identity the current lifetime's state belongs to. */
	sessionIdentityKey?: string;
	/** Detail committed for the active surface lifetime. */
	committedDetail?: SubagentFleetTaskDetail;
	/** Within-lifetime parse cache, valid only for its session identity. */
	cache?: EntryDetailParseCacheState;
	/** Detail-surface quiet-time observation for the active lifetime. */
	observation?: EntryDetailQuietObservation;
	/**
	 * Generations with an active in-flight request. Tracking per generation
	 * lets a fresh lifetime start its own read while an obsolete request is
	 * still unresolved, and an obsolete `finally` can only clear its own
	 * generation's marker.
	 */
	inFlightGenerations: Set<number>;
	/** One coalesced follow-up read queued for the current generation. */
	queuedGeneration?: number;
}

export interface EntryDetailParseCacheState {
	sessionIdentityKey: string;
	cache: FleetEntrySessionParseCache;
}

/** Quiet-time observation owned by the full-detail surface only. */
export interface EntryDetailQuietObservation {
	sessionIdentityKey: string;
	contentSignature: string;
	lastObservedChangeMs: number;
}

export interface LoadEntryDetailOperationInput {
	entry: FleetNavigatorEntry;
	surface: FleetEntrySurface;
	context: FleetDetailContext;
	/** Session identity the caller validated `previousCache`/`previousObservation` against. */
	sessionIdentityKey: string;
	previousCache?: FleetEntrySessionParseCache;
	previousObservation?: EntryDetailQuietObservation;
	nowMs: number;
}

export type LoadEntryDetailOperationResult =
	| {
			status: "loaded";
			detail: SubagentFleetTaskDetail;
			parseCache?: FleetEntrySessionParseCache;
			observation?: EntryDetailQuietObservation;
	  }
	| { status: "failed"; detail: SubagentFleetTaskDetail };

/**
 * The one load/decorate operation shared by both surfaces: reads the session
 * through `loadFleetEntryDetail()` with the lifetime's prior parse cache,
 * converts thrown failures into a placeholder detail, decorates running
 * entries with an assumed-thinking current action, and applies quiet-time
 * observation only for the detail surface. The preview surface deliberately
 * shows current activity without claiming a quiet-time observation.
 */
export async function loadAndDecorateEntryDetail(
	input: LoadEntryDetailOperationInput,
): Promise<LoadEntryDetailOperationResult> {
	try {
		const loaded = await loadFleetEntryDetail({
			entry: input.entry,
			context: input.context,
			...optionalEntry("previous", input.previousCache),
		});
		if (!isRunningTaskDetailEntry(input.entry)) {
			return {
				status: "loaded",
				detail: loaded.detail,
				...optionalEntry("parseCache", loaded.sessionParseCache),
			};
		}
		const currentAction = assumeThinkingWhileRunning(loaded.detail.timeline.currentAction);
		if (input.surface === "preview") {
			return {
				status: "loaded",
				detail: { ...loaded.detail, liveActivity: { currentAction } },
				...optionalEntry("parseCache", loaded.sessionParseCache),
			};
		}
		const observed = observeQuietTime(input, loaded.sessionContentSignature);
		return {
			status: "loaded",
			detail: {
				...loaded.detail,
				liveActivity: { currentAction, ...optionalEntry("quietMs", observed.quietMs) },
			},
			...optionalEntry("parseCache", loaded.sessionParseCache),
			...optionalEntry("observation", observed.observation),
		};
	} catch (error) {
		return {
			status: "failed",
			detail: placeholderDetail(input.entry, `Could not load detail: ${formatErrorMessage(error)}`),
		};
	}
}

/** Stable identity for parse-cache and observation reuse within a lifetime. */
export function entrySessionIdentityKey(entry: FleetNavigatorEntry): string {
	return `${entryId(entry) ?? "unknown"}:${entrySessionFile(entry) ?? "no-session-file"}`;
}

function observeQuietTime(
	input: LoadEntryDetailOperationInput,
	contentSignature: string | undefined,
): { quietMs?: number; observation?: EntryDetailQuietObservation } {
	if (entrySessionFile(input.entry) === undefined || contentSignature === undefined) {
		// No observable content: keep the prior observation without claiming a
		// quiet duration.
		return { ...optionalEntry("observation", input.previousObservation) };
	}
	const previous = input.previousObservation;
	if (
		previous?.sessionIdentityKey !== input.sessionIdentityKey ||
		previous.contentSignature !== contentSignature
	) {
		return {
			quietMs: 0,
			observation: {
				sessionIdentityKey: input.sessionIdentityKey,
				contentSignature,
				lastObservedChangeMs: input.nowMs,
			},
		};
	}
	return {
		quietMs: Math.max(0, input.nowMs - previous.lastObservedChangeMs),
		observation: previous,
	};
}
