import { describe, expect, test } from "vitest";

import { buildEpisodeAnalysisPayload, parseEpisodeAnalysisResponseText } from "../src/context-profiler/analysis.ts";
import type { EpisodeAnnotation } from "../src/context-profiler/model.ts";
import { makeProfile, makeTurn } from "./context-profiler-fakes.ts";

const EPISODES: EpisodeAnnotation[] = [
	{ label: "setup", kind: "explore", outcome: "completed", turnRange: { start: 1, end: 1 } },
	{ label: "fix", kind: "edit", outcome: "active", turnRange: { start: 2, end: 3 } },
];

describe("parseEpisodeAnalysisResponseText", () => {
	test("parses a clean JSON verdict pair", () => {
		const result = parseEpisodeAnalysisResponseText(JSON.stringify({ efficiency: "efficient", relevance: "load-bearing" }));
		expect(result).toEqual({ ok: true, value: { efficiency: "efficient", relevance: "load-bearing" } });
	});

	test("parses fenced and prose-wrapped JSON", () => {
		const text = JSON.stringify({ efficiency: "mixed", relevance: "still-useful" });
		expect(parseEpisodeAnalysisResponseText("```json\n" + text + "\n```").ok).toBe(true);
		expect(parseEpisodeAnalysisResponseText(`Here: ${text}`).ok).toBe(true);
	});

	test("reports malformed or invalid verdicts as errors", () => {
		expect(parseEpisodeAnalysisResponseText("no json here")).toEqual({ ok: false, error: "response contains no JSON object" });
		const invalidJson = parseEpisodeAnalysisResponseText("{efficiency:nope}");
		expect(invalidJson.ok).toBe(false);
		const invalidVerdict = parseEpisodeAnalysisResponseText(JSON.stringify({ efficiency: "great", relevance: "current" }));
		expect(invalidVerdict).toEqual({ ok: false, error: "response JSON has no valid verdict pair" });
	});
});

describe("buildEpisodeAnalysisPayload", () => {
	test("serializes one target episode with full normalized turn text and compact episode map", () => {
		const profile = makeProfile([
			makeTurn(1, { role: "user", message: { role: "user", toolName: null, parts: [{ kind: "text", text: "setup text" }], detailsJson: null } }),
			makeTurn(2, { role: "assistant", toolNames: ["bash"], message: { role: "assistant", toolName: null, parts: [{ kind: "toolCall", name: "bash", argsJson: "{\n  \"cmd\": \"test\"\n}" }], detailsJson: null } }),
			makeTurn(3, { role: "toolResult", message: { role: "toolResult", toolName: "bash", parts: [{ kind: "text", text: "passed" }], detailsJson: "{\n  \"exitCode\": 0\n}" } }),
		], { cap: { originalCount: 20, includedCount: 3, elidedMiddleTurns: 17 } });
		const payload = buildEpisodeAnalysisPayload({ profile, episodes: EPISODES, episodeIndex: 1, summary: "A short session." });
		const request = JSON.parse(payload.json) as {
			metadata: { model: string; turnCount: number; includedTurnCount: number; elidedMiddleTurns: number };
			summary: string;
			episodeMap: unknown[];
			targetEpisode: { episode: number; label: string; turns: { turn: number; text: string }[] };
		};

		expect(request.metadata.model).toBe("anthropic/claude-fable-5");
		expect(request.metadata).toMatchObject({ turnCount: 20, includedTurnCount: 3, elidedMiddleTurns: 17 });
		expect(request.summary).toBe("A short session.");
		expect(request.episodeMap).toEqual([
			{ episode: 1, label: "setup", kind: "explore", outcome: "completed", turnRange: { start: 1, end: 1 } },
			{ episode: 2, label: "fix", kind: "edit", outcome: "active", turnRange: { start: 2, end: 3 } },
		]);
		expect(request.targetEpisode.episode).toBe(2);
		expect(request.targetEpisode.label).toBe("fix");
		expect(request.targetEpisode.turns.map((turn) => turn.turn)).toEqual([2, 3]);
		expect(request.targetEpisode.turns[0]?.text).toContain("⏺ bash");
		expect(request.targetEpisode.turns[1]?.text).toContain("⏺ tool result · bash");
		expect(request.targetEpisode.turns[1]?.text).toContain("[details]");
	});
});
