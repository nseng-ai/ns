/**
 * Pure LM episode segmentation logic for the context profiler: prompt,
 * response parsing/repair, snapshot fingerprinting, and payload assembly.
 * No TUI or extension-runtime imports — the gateway and controller live
 * elsewhere; everything here is data in, data out.
 *
 * Complete-input policy (explicit, not inherited by accident):
 * 1. Every item in profile.liveTurns is serialized exactly once.
 * 2. Per-turn text remains the existing ≤120-char excerpt, never verbatim
 *    message content.
 * 3. Gateway or provider rejection is the visible graceful-degradation path;
 *    this layer does not silently elide turns.
 */

import { z } from "zod";
import {
	EPISODE_KIND_VALUES,
	EPISODE_OUTCOME_VALUES,
	MAX_DELEGATIONS,
	type DelegationClaim,
	type EpisodeAnnotation,
	type LiveTurn,
	type ProfileSnapshot,
} from "./model.ts";
import { parseLmJson } from "@nseng-ai/pi/models/lm-json";

/** Fixed analysis model — never the session's main model. */
export const SEGMENTATION_PROVIDER = "openai-codex";
export const SEGMENTATION_MODEL = "gpt-5.6-luna";
export const MAX_EPISODES = 12;
export const MIN_TURNS_FOR_SEGMENTATION = 3;

const LABEL_MAX_CHARS = 80;
const DELEGATION_LABEL_MAX_CHARS = 60;
const SUMMARY_MAX_CHARS = 220;

export type EpisodeAnalysisStatus = "loading" | "ready" | { type: "error"; message: string };

export type SegmentationBatchOutcome =
	| {
			type: "ready";
			episodes: readonly EpisodeAnnotation[];
			summary: string | null;
			delegations: readonly DelegationClaim[];
			analysis: readonly EpisodeAnalysisStatus[];
	  }
	| { type: "segmentation-error"; message: string }
	| { type: "skipped"; reason: "too-few-turns" };

export type SegmentationState =
	| { type: "idle" }
	| { type: "loading" }
	| {
			type: "ready";
			episodes: EpisodeAnnotation[];
			summary: string | null;
			delegations: DelegationClaim[];
			analysis: EpisodeAnalysisStatus[];
	  }
	| { type: "error"; message: string };

export const SEGMENTATION_SYSTEM_PROMPT = `You symbolize a deterministic Pi context profiler.
Return JSON only with this exact shape: {"episodes":[{"startTurn":1,"label":"short neutral label","kind":"explore|edit|debug|test|review|chat","outcome":"active|completed|abandoned|errored"}],"summary":"exactly one descriptive sentence","delegations":[{"turn":17,"label":"short description of the delegated task","confidence":"high|low"}]}
Rules:
- Qualitative only: do not compute or return token counts, percentages, end turns, or sizes.
- Identify episodes only by startTurn from the provided turn list.
- Always include the first provided turn as an episode start.
- Return at most ${MAX_EPISODES} episodes; prefer few coherent episodes.
- Labels and summary are neutral and descriptive, never advisory or prescriptive.
- outcome:"active" is only for the final ongoing episode.
- A delegation is a turn where the assistant hands a self-contained prompt/task to another agent-like tool and later receives its report; judge by call/result semantics, not tool name.
- Tag the turn containing the delegating tool call; return delegations:[] when none; prefer precision over recall; use confidence:"low" when unsure.
- Output the JSON object only; no Markdown, prose, or code fences.`;

/**
 * Envelope: episodes array is required. Optional delegation claims are parsed
 * leniently; invalid entries are dropped, and unknown kind/outcome values fall
 * back instead of failing the response.
 */
const segmentationEnvelopeSchema = z.object({
	episodes: z.array(z.unknown()),
	summary: z.unknown().optional(),
	delegations: z.array(z.unknown()).catch([]),
});

const startTurnSchema = z
	.union([z.number(), z.string().transform((raw) => Number.parseInt(raw, 10))])
	.refine((value) => Number.isFinite(value), { message: "startTurn is not a finite number" });

const lmEpisodeStartSchema = z.object({
	startTurn: startTurnSchema,
	label: z
		.string()
		.catch("uncategorized")
		.transform((label) => normalizeLabel(label)),
	kind: z.enum(EPISODE_KIND_VALUES).catch("uncategorized"),
	outcome: z.enum(EPISODE_OUTCOME_VALUES).catch("unknown"),
});

const lmDelegationClaimSchema = z.object({
	turn: startTurnSchema,
	label: z
		.string()
		.catch("delegation")
		.transform((label) => normalizeDelegationLabel(label)),
	confidence: z.enum(["high", "low"]).catch("low"),
});

/** One LM-claimed episode start, validated but not yet repaired to real turns. */
export type LmEpisodeStart = z.infer<typeof lmEpisodeStartSchema>;

export type LmDelegationClaim = z.infer<typeof lmDelegationClaimSchema>;

export interface LmSegmentation {
	episodes: LmEpisodeStart[];
	summary: string | null;
	delegations: LmDelegationClaim[];
}

export type SegmentationParseResult =
	| { ok: true; value: LmSegmentation }
	| { ok: false; error: string };

interface SnappedTurnValue<TValue> {
	turn: number;
	value: TValue;
}

interface DedupeAndCapBySnappedTurnOptions<TInput, TValue> {
	readonly items: readonly TInput[];
	readonly turns: readonly LiveTurn[];
	readonly max: number;
	readonly turnOf: (item: TInput) => number;
	readonly project: (item: TInput, turn: number) => TValue;
}

export function parseSegmentationResponseText(text: string): SegmentationParseResult {
	const envelope = parseLmJson(text, segmentationEnvelopeSchema, {
		invalidShapeError: "response JSON has no episodes array",
	});
	if (!envelope.ok) return envelope;
	const episodes = envelope.value.episodes
		.flatMap((candidate): LmEpisodeStart[] => {
			const episode = lmEpisodeStartSchema.safeParse(candidate);
			return episode.success ? [episode.data] : [];
		})
		.slice(0, MAX_EPISODES);
	const delegations = envelope.value.delegations
		.flatMap((candidate): LmDelegationClaim[] => {
			const delegation = lmDelegationClaimSchema.safeParse(candidate);
			return delegation.success ? [delegation.data] : [];
		})
		.slice(0, MAX_DELEGATIONS);
	const summary =
		typeof envelope.value.summary === "string" ? normalizeSummary(envelope.value.summary) : null;
	return { ok: true, value: { episodes, summary, delegations } };
}

function normalizeLabel(label: string): string {
	const collapsed = collapseWhitespace(label);
	if (collapsed.length === 0) return "uncategorized";
	return truncateChars(collapsed, LABEL_MAX_CHARS);
}

function normalizeDelegationLabel(label: string): string {
	const collapsed = collapseWhitespace(label);
	if (collapsed.length === 0) return "delegation";
	return truncateChars(collapsed, DELEGATION_LABEL_MAX_CHARS);
}

function normalizeSummary(summary: string): string | null {
	const collapsed = collapseWhitespace(summary);
	if (collapsed.length === 0) return null;
	return truncateChars(collapsed, SUMMARY_MAX_CHARS);
}

function collapseWhitespace(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function truncateChars(text: string, max: number): string {
	if (text.length <= max) return text;
	return `${text.slice(0, max - 1)}…`;
}

/**
 * Repair LM episode starts against the complete contiguous turn list: the LM
 * claims where episodes start, while code owns the indices. Starts are clamped
 * to the list's range, snapped forward to a captured turn, deduped, sorted, and
 * capped after forcing the first turn to be a start. Each start produces one
 * contiguous annotation whose end derives from the next start. Finally,
 * "active" is demoted to "unknown" on every non-final annotation.
 */
export function repairEpisodes(
	starts: readonly LmEpisodeStart[],
	turns: readonly LiveTurn[],
): EpisodeAnnotation[] {
	const firstTurn = turns[0];
	if (firstTurn === undefined) return [];

	const fallbackStart: LmEpisodeStart = {
		startTurn: firstTurn.index,
		label: "uncategorized",
		kind: "uncategorized",
		outcome: "unknown",
	};
	const sortedStarts = dedupeAndCapBySnappedTurn({
		items: [...starts, fallbackStart],
		turns,
		max: MAX_EPISODES,
		turnOf: (start) => start.startTurn,
		project: (start, turn): LmEpisodeStart => ({ ...start, startTurn: turn }),
	})
		.map(({ turn, value }) => ({
			start: value,
			position: turns.findIndex((candidate) => candidate.index === turn),
		}))
		// Guard only: snapStartTurn returns indices present in turns.
		.filter((entry) => entry.position !== -1);
	const episodes = sortedStarts.map(({ start }, episodeNumber): EpisodeAnnotation => {
		const endPosition = (sortedStarts[episodeNumber + 1]?.position ?? turns.length) - 1;
		return {
			label: start.label,
			kind: start.kind,
			outcome: start.outcome,
			turnRange: {
				start: start.startTurn,
				end: turns[endPosition]?.index ?? start.startTurn,
			},
		};
	});
	return episodes.map((episode, position): EpisodeAnnotation => {
		const isFinal = position === episodes.length - 1;
		return episode.outcome === "active" && !isFinal ? { ...episode, outcome: "unknown" } : episode;
	});
}

/** Clamp to the list's range, then snap forward to the next captured turn index. */
function snapStartTurn(startTurn: number, turns: readonly LiveTurn[]): number {
	const first = turns[0]?.index ?? 1;
	const last = turns[turns.length - 1]?.index ?? first;
	const clamped = Math.max(first, Math.min(last, Math.round(startTurn)));
	for (const turn of turns) {
		if (turn.index >= clamped) return turn.index;
	}
	return last;
}

export function repairDelegations(
	claims: readonly LmDelegationClaim[],
	turns: readonly LiveTurn[],
): DelegationClaim[] {
	if (turns.length === 0) return [];
	return dedupeAndCapBySnappedTurn({
		items: claims,
		turns,
		max: MAX_DELEGATIONS,
		turnOf: (claim) => claim.turn,
		project: (claim, turn): DelegationClaim => ({
			turn,
			label: claim.label,
			confidence: claim.confidence,
		}),
	}).map((entry) => entry.value);
}

function dedupeAndCapBySnappedTurn<TInput, TValue>(
	options: DedupeAndCapBySnappedTurnOptions<TInput, TValue>,
): SnappedTurnValue<TValue>[] {
	const valuesByTurn = new Map<number, TValue>();
	for (const item of options.items) {
		const turn = snapStartTurn(options.turnOf(item), options.turns);
		if (!valuesByTurn.has(turn)) valuesByTurn.set(turn, options.project(item, turn));
	}
	return [...valuesByTurn.entries()]
		.sort(([left], [right]) => left - right)
		.slice(0, options.max)
		.map(([turn, value]) => ({ turn, value }));
}

/**
 * Cache key for a segmentation result: live source, full turn count, and the
 * identity of the last turn. Reopening over an unchanged conversation reuses
 * the cached result; any new turn (or a different live source) misses.
 *
 * Deliberately NOT part of the key: middle-turn content. A conversation with
 * the same turn count and same last turn but altered middle content would
 * serve the cached episodes as "ready" even though buildSegmentationPayload
 * serializes every complete turn. This is a cheap heuristic, accepted on
 * purpose: in this harness realistic drift always changes the turn count or
 * the last turn, and the `r` force-refresh keybinding is the escape hatch
 * when it does not.
 */
export function computeSegmentationFingerprint(profile: ProfileSnapshot): string {
	const last = profile.liveTurns[profile.liveTurns.length - 1];
	return JSON.stringify({
		liveSource: profile.liveSource,
		turnCount: profile.liveTurns.length,
		lastTurn:
			last === undefined ? null : { index: last.index, role: last.role, excerpt: last.excerpt },
	});
}

export interface SegmentationPayload {
	/** Serialized request body sent verbatim as the LM user message. */
	json: string;
}

export function buildSegmentationPayload(profile: ProfileSnapshot): SegmentationPayload {
	return { json: serializeSegmentationRequest(profile) };
}

function serializeSegmentationRequest(profile: ProfileSnapshot): string {
	return JSON.stringify(
		{
			cwd: profile.cwd,
			model: profile.model,
			usage: profile.usage ?? null,
			turnCount: profile.liveTurns.length,
			turns: profile.liveTurns.map((turn) => ({
				turn: turn.index,
				role: turn.role,
				tokens: turn.tokens.value,
				tools: turn.toolNames,
				excerpt: turn.excerpt,
			})),
		},
		null,
		2,
	);
}
