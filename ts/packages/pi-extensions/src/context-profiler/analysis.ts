/**
 * Pure per-episode LM analysis for the context profiler: neutral prompt,
 * verbatim per-episode payload assembly, and response parsing. Runtime and
 * provider plumbing live in analysis-model-gateway.ts.
 */

import { z } from "zod";
import {
	EFFICIENCY_VALUES,
	RELEVANCE_VALUES,
	renderNormalizedMessageText,
	turnsInRange,
	type EfficiencyVerdict,
	type EpisodeAnnotation,
	type LiveTurn,
	type ProfileSnapshot,
	type RelevanceVerdict,
} from "./model.ts";

export const EPISODE_ANALYSIS_SYSTEM_PROMPT = `You are a neutral Pi context-profiler judge.
Return JSON only with this exact shape: {"efficiency":"efficient|mixed|wasteful","relevance":"load-bearing|still-useful|stale|rot"}
Definitions:
- efficiency=efficient: most turns directly advance the session's work.
- efficiency=mixed: the episode contains both useful work and detours, retries, or overhead.
- efficiency=wasteful: most turns are dead ends, repeated failures, or low-value churn.
- relevance=load-bearing: the episode contains facts or decisions still needed to understand the session.
- relevance=still-useful: the episode remains useful background, but is not central.
- relevance=stale: the episode was useful then, but later work mostly superseded it.
- relevance=rot: the episode is misleading or contradicted by later work.
Rules:
- Judge only the target episode, using the episode map and summary for session position.
- Be qualitative and descriptive only; do not advise compaction, dropping, or action.
- Do not compute or return token counts, percentages, or explanations.
- Output the JSON object only; no Markdown, prose, or code fences.`;

const episodeAnalysisSchema = z.object({
	efficiency: z.enum(EFFICIENCY_VALUES),
	relevance: z.enum(RELEVANCE_VALUES),
});

export interface EpisodeAnalysisVerdicts {
	efficiency: EfficiencyVerdict;
	relevance: RelevanceVerdict;
}

export type EpisodeAnalysisParseResult =
	| { ok: true; value: EpisodeAnalysisVerdicts }
	| { ok: false; error: string };

export interface EpisodeAnalysisPayloadOptions {
	profile: ProfileSnapshot;
	episodes: readonly EpisodeAnnotation[];
	episodeIndex: number;
	summary: string | null;
}

export interface EpisodeAnalysisPayload {
	/** Serialized request body sent verbatim as the LM user message. */
	json: string;
}

export function parseEpisodeAnalysisResponseText(text: string): EpisodeAnalysisParseResult {
	const jsonText = extractJsonObjectText(text);
	if (jsonText === null) return { ok: false, error: "response contains no JSON object" };
	let parsed: unknown;
	try {
		parsed = JSON.parse(jsonText);
	} catch (error) {
		return { ok: false, error: `invalid JSON: ${error instanceof Error ? error.message : String(error)}` };
	}
	const verdicts = episodeAnalysisSchema.safeParse(parsed);
	if (!verdicts.success) return { ok: false, error: "response JSON has no valid verdict pair" };
	return { ok: true, value: verdicts.data };
}

export function buildEpisodeAnalysisPayload(options: EpisodeAnalysisPayloadOptions): EpisodeAnalysisPayload {
	const episode = options.episodes[options.episodeIndex];
	if (episode === undefined) throw new Error(`episode index ${options.episodeIndex} is out of range`);
	const targetTurns = turnsInRange(options.profile.liveTurns, episode.turnRange);
	// No per-turn clamp by design: per-episode requests keep the dominant path
	// well below the fixed analysis model context window. A provider that
	// silently truncates overlong prompts could still judge unseen content; this
	// accepted residual risk is surfaced by the plan, not engineered around here.
	return {
		json: JSON.stringify(
			{
				metadata: {
					cwd: options.profile.cwd,
					model: options.profile.model,
					usage: options.profile.usage ?? null,
					liveSource: options.profile.liveSource,
					turnCount: options.profile.cap.originalCount,
					includedTurnCount: options.profile.cap.includedCount,
					elidedMiddleTurns: options.profile.cap.elidedMiddleTurns,
				},
				summary: options.summary,
				episodeMap: options.episodes.map((candidate, index) => ({
					episode: index + 1,
					label: candidate.label,
					kind: candidate.kind,
					outcome: candidate.outcome,
					turnRange: candidate.turnRange,
				})),
				targetEpisode: {
					episode: options.episodeIndex + 1,
					label: episode.label,
					kind: episode.kind,
					outcome: episode.outcome,
					turnRange: episode.turnRange,
					turns: targetTurns.map(serializeTurn),
				},
			},
			null,
			2,
		),
	};
}

function serializeTurn(turn: LiveTurn): { turn: number; role: string; tokens: number; tools: readonly string[]; text: string } {
	return {
		turn: turn.index,
		role: turn.role,
		tokens: turn.tokens.value,
		tools: turn.toolNames,
		text: renderNormalizedMessageText(turn.message),
	};
}

function extractJsonObjectText(text: string): string | null {
	const trimmed = text.trim();
	const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
	const candidate = fenced?.[1] ?? trimmed;
	const first = candidate.indexOf("{");
	const last = candidate.lastIndexOf("}");
	if (first === -1 || last <= first) return null;
	return candidate.slice(first, last + 1);
}
