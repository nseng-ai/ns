/**
 * Pure LM episode segmentation logic for the context profiler: prompt,
 * response parsing/repair, snapshot fingerprinting, and payload assembly.
 * No TUI or extension-runtime imports — the gateway and controller live
 * elsewhere; everything here is data in, data out.
 *
 * Truncation/windowing policy (explicit, not inherited by accident):
 * 1. The LM payload sees exactly the snapshot's deterministically capped turn
 *    list (CAP_FIRST_TURNS + CAP_LAST_TURNS from model.ts), never the
 *    uncapped session.
 * 2. Per-turn text is the existing ≤120-char excerpt only, never verbatim
 *    message content.
 * 3. A hard total cap (SEGMENTATION_PAYLOAD_MAX_CHARS) bounds the serialized
 *    request; when exceeded, turns are dropped from the middle (first/last
 *    preserved) and the reduced includedTurnCount is reported to the model.
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
	type TurnRange,
} from "./model.ts";
import { parseLmJson } from "./lm-json.ts";

/** Fixed analysis model — never the session's main model. */
export const SEGMENTATION_PROVIDER = "openai-codex";
export const SEGMENTATION_MODEL = "gpt-5.4-mini";
export const MAX_EPISODES = 12;
export const MIN_TURNS_FOR_SEGMENTATION = 3;
export const SEGMENTATION_PAYLOAD_MAX_CHARS = 60_000;

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
 * Repair LM episode starts against the real (capped) turn list: the LM claims
 * where episodes start, code owns the indices. Start turns are clamped to the
 * list's range and snapped forward to the next real turn (which skips the
 * elided middle), deduped by turn, the first turn is forced to be a start,
 * starts are sorted and capped, and end turns derive from the next start's
 * position in the capped list. An episode whose position run crosses an
 * elision seam (consecutive capped turns with non-adjacent indices) is split
 * into one annotation per contiguous run of included turns, so every
 * turnRange contains only included turns and its displayed claim, token sum,
 * and drill-down agree. Splitting may push the annotation count past
 * MAX_EPISODES — the cap bounds LM output, not repaired regions. Finally,
 * "active" is demoted to "unknown" on every non-final annotation.
 */
export function repairEpisodes(
	starts: readonly LmEpisodeStart[],
	turns: readonly LiveTurn[],
): EpisodeAnnotation[] {
	const firstTurn = turns[0];
	if (firstTurn === undefined) return [];

	const startsByTurn = new Map<number, LmEpisodeStart>();
	for (const start of starts) {
		const turn = snapStartTurn(start.startTurn, turns);
		if (!startsByTurn.has(turn)) startsByTurn.set(turn, { ...start, startTurn: turn });
	}
	if (!startsByTurn.has(firstTurn.index)) {
		startsByTurn.set(firstTurn.index, {
			startTurn: firstTurn.index,
			label: "uncategorized",
			kind: "uncategorized",
			outcome: "unknown",
		});
	}

	const sortedStarts = [...startsByTurn.entries()]
		.sort(([left], [right]) => left - right)
		.slice(0, MAX_EPISODES)
		.map(([turnIndex, start]) => ({
			start,
			position: turns.findIndex((turn) => turn.index === turnIndex),
		}))
		// Guard only: snapStartTurn returns indices present in turns.
		.filter((entry) => entry.position !== -1);
	const episodes = sortedStarts.flatMap(
		({ start, position }, episodeNumber): EpisodeAnnotation[] => {
			const endPosition = (sortedStarts[episodeNumber + 1]?.position ?? turns.length) - 1;
			return splitRunAtSeams(turns, position, endPosition).map(
				(turnRange): EpisodeAnnotation => ({
					label: start.label,
					kind: start.kind,
					outcome: start.outcome,
					turnRange,
				}),
			);
		},
	);
	return episodes.map((episode, position): EpisodeAnnotation => {
		const isFinal = position === episodes.length - 1;
		return episode.outcome === "active" && !isFinal ? { ...episode, outcome: "unknown" } : episode;
	});
}

/**
 * Split the position run [startPosition..endPosition] of the capped turn list
 * into turn-index ranges containing only included turns, breaking wherever two
 * consecutive capped turns have non-adjacent indices (an elision seam). Seams
 * are detected from the turn list itself, not cap metadata.
 */
function splitRunAtSeams(
	turns: readonly LiveTurn[],
	startPosition: number,
	endPosition: number,
): TurnRange[] {
	const ranges: TurnRange[] = [];
	let runStartPosition = startPosition;
	for (let position = startPosition; position < endPosition; position += 1) {
		const current = turns[position];
		const next = turns[position + 1];
		if (current === undefined || next === undefined) break;
		if (next.index !== current.index + 1) {
			ranges.push({ start: turns[runStartPosition]?.index ?? current.index, end: current.index });
			runStartPosition = position + 1;
		}
	}
	const runEnd = turns[endPosition];
	if (runEnd !== undefined) {
		ranges.push({ start: turns[runStartPosition]?.index ?? runEnd.index, end: runEnd.index });
	}
	return ranges;
}

/** Clamp to the list's range, then snap forward to the next real turn index. */
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
	const claimsByTurn = new Map<number, DelegationClaim>();
	for (const claim of claims) {
		const turn = snapStartTurn(claim.turn, turns);
		if (!claimsByTurn.has(turn)) {
			claimsByTurn.set(turn, { turn, label: claim.label, confidence: claim.confidence });
		}
	}
	return [...claimsByTurn.values()]
		.sort((left, right) => left.turn - right.turn)
		.slice(0, MAX_DELEGATIONS);
}

/**
 * Cache key for a segmentation result: live source, full turn count, and the
 * identity of the last turn. Reopening over an unchanged conversation reuses
 * the cached result; any new turn (or a different live source) misses.
 *
 * Deliberately NOT part of the key: middle-turn content. A conversation with
 * the same turn count and same last turn but altered middle content would
 * serve the cached episodes as "ready" even though buildSegmentationPayload
 * serializes every capped turn. This is a cheap heuristic, accepted on
 * purpose: in this harness realistic drift always changes the turn count or
 * the last turn, and the `r` force-refresh keybinding is the escape hatch
 * when it does not.
 */
export function computeSegmentationFingerprint(profile: ProfileSnapshot): string {
	const last = profile.liveTurns[profile.liveTurns.length - 1];
	return JSON.stringify({
		liveSource: profile.liveSource,
		turnCount: profile.cap.originalCount,
		lastTurn:
			last === undefined ? null : { index: last.index, role: last.role, excerpt: last.excerpt },
	});
}

export interface SegmentationPayload {
	/** Serialized request body sent verbatim as the LM user message. */
	json: string;
	/** Turns actually included after the payload-size cap. */
	includedTurnCount: number;
	/** True when the 60k-char cap forced dropping turns beyond the deterministic cap. */
	wasTruncatedForPayload: boolean;
}

export function buildSegmentationPayload(profile: ProfileSnapshot): SegmentationPayload {
	const turns = [...profile.liveTurns];
	let json = serializeSegmentationRequest(profile, turns);
	let dropped = 0;
	// Policy rule 3: drop from the middle, preserving first/last turns.
	while (json.length > SEGMENTATION_PAYLOAD_MAX_CHARS && turns.length > 2) {
		turns.splice(Math.floor(turns.length / 2), 1);
		dropped += 1;
		json = serializeSegmentationRequest(profile, turns);
	}
	return { json, includedTurnCount: turns.length, wasTruncatedForPayload: dropped > 0 };
}

function serializeSegmentationRequest(
	profile: ProfileSnapshot,
	turns: readonly LiveTurn[],
): string {
	return JSON.stringify(
		{
			cwd: profile.cwd,
			model: profile.model,
			usage: profile.usage ?? null,
			turnCount: profile.cap.originalCount,
			capped: {
				includedTurnCount: turns.length,
				elidedMiddleTurns: profile.cap.originalCount - turns.length,
			},
			turns: turns.map((turn) => ({
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
