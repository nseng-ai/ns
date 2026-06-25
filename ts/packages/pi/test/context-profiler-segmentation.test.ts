import { describe, expect, test } from "vitest";

import {
	buildSegmentationPayload,
	computeSegmentationFingerprint,
	MAX_EPISODES,
	parseSegmentationResponseText,
	repairDelegations,
	repairEpisodes,
	SEGMENTATION_PAYLOAD_MAX_CHARS,
	SEGMENTATION_SYSTEM_PROMPT,
	type LmDelegationClaim,
	type LmEpisodeStart,
} from "../src/context-profiler/segmentation.ts";
import { MAX_DELEGATIONS } from "../src/context-profiler/model.ts";
import {
	makeProfile,
	makeTurn,
	makeTurnsAtIndices,
	sequentialTurns,
} from "./context-profiler-fakes.ts";

function makeStart(startTurn: number, overrides: Partial<LmEpisodeStart> = {}): LmEpisodeStart {
	return {
		startTurn,
		label: `episode ${startTurn}`,
		kind: "explore",
		outcome: "completed",
		...overrides,
	};
}

function makeDelegation(
	turn: number,
	overrides: Partial<LmDelegationClaim> = {},
): LmDelegationClaim {
	return { turn, label: `delegation ${turn}`, confidence: "high", ...overrides };
}

/** Capped-shape turn list: first 16 turns plus last 64, middle elided. */
function cappedSeamIndices(): number[] {
	const first = Array.from({ length: 16 }, (_unused, position) => position + 1);
	const last = Array.from({ length: 64 }, (_unused, position) => position + 137);
	return [...first, ...last];
}

const VALID_RESPONSE = JSON.stringify({
	episodes: [
		{ startTurn: 1, label: "initial exploration", kind: "explore", outcome: "completed" },
		{ startTurn: 5, label: "the fix", kind: "edit", outcome: "active" },
	],
	summary: "A session that explored and then fixed something.",
	delegations: [{ turn: 4, label: "ask a helper", confidence: "high" }],
});

describe("segmentation prompt", () => {
	test("asks for delegation claims and semantic detection rules", () => {
		expect(SEGMENTATION_SYSTEM_PROMPT).toContain('"delegations"');
		expect(SEGMENTATION_SYSTEM_PROMPT).toContain("judge by call/result semantics, not tool name");
		expect(SEGMENTATION_SYSTEM_PROMPT).toContain('confidence:"low" when unsure');
	});
});

describe("parseSegmentationResponseText", () => {
	test("parses a clean JSON object", () => {
		const result = parseSegmentationResponseText(VALID_RESPONSE);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.episodes).toEqual([
			{ startTurn: 1, label: "initial exploration", kind: "explore", outcome: "completed" },
			{ startTurn: 5, label: "the fix", kind: "edit", outcome: "active" },
		]);
		expect(result.value.summary).toBe("A session that explored and then fixed something.");
		expect(result.value.delegations).toEqual([
			{ turn: 4, label: "ask a helper", confidence: "high" },
		]);
	});

	test("parses fenced and prose-wrapped JSON", () => {
		const fenced = parseSegmentationResponseText("```json\n" + VALID_RESPONSE + "\n```");
		expect(fenced.ok).toBe(true);
		const proseWrapped = parseSegmentationResponseText(
			`Here is the segmentation you asked for:\n${VALID_RESPONSE}\nHope that helps!`,
		);
		expect(proseWrapped.ok).toBe(true);
	});

	test("reports malformed responses as errors", () => {
		const noObject = parseSegmentationResponseText("no json here");
		expect(noObject).toEqual({ ok: false, error: "response contains no JSON object" });
		const invalidJson = parseSegmentationResponseText("{episodes: nope}");
		expect(invalidJson.ok).toBe(false);
		if (!invalidJson.ok) expect(invalidJson.error).toContain("invalid JSON");
	});

	test("requires an episodes array", () => {
		const missing = parseSegmentationResponseText(JSON.stringify({ summary: "no episodes" }));
		expect(missing).toEqual({ ok: false, error: "response JSON has no episodes array" });
		const wrongType = parseSegmentationResponseText(JSON.stringify({ episodes: "three" }));
		expect(wrongType.ok).toBe(false);
	});

	test("drops invalid episode entries and keeps valid ones", () => {
		const result = parseSegmentationResponseText(
			JSON.stringify({
				episodes: [
					{ startTurn: 2, label: "ok", kind: "edit", outcome: "completed" },
					{ label: "no start turn" },
					{ startTurn: "not-a-number" },
					"not an object",
					{ startTurn: "7", label: "numeric string start", kind: "test", outcome: "completed" },
				],
			}),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.episodes.map((episode) => episode.startTurn)).toEqual([2, 7]);
		expect(result.value.summary).toBeNull();
	});

	test("coerces unknown kind and outcome values instead of failing", () => {
		const result = parseSegmentationResponseText(
			JSON.stringify({
				episodes: [{ startTurn: 3, label: "odd", kind: "rummaging", outcome: "victorious" }],
			}),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.episodes[0]).toEqual({
			startTurn: 3,
			label: "odd",
			kind: "uncategorized",
			outcome: "unknown",
		});
	});

	test("parses lenient delegation claims without allowing LM-inferred confidence", () => {
		const result = parseSegmentationResponseText(
			JSON.stringify({
				episodes: [{ startTurn: 1, label: "a", kind: "chat", outcome: "active" }],
				delegations: [
					{ turn: "4", label: "  delegated\nwork  ", confidence: "high" },
					{ turn: 5, label: "", confidence: "inferred" },
					{ label: "missing turn", confidence: "low" },
					"garbage",
				],
			}),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.delegations).toEqual([
			{ turn: 4, label: "delegated work", confidence: "high" },
			{ turn: 5, label: "delegation", confidence: "low" },
		]);
	});

	test("normalizes blank labels and caps episode count", () => {
		const episodes = Array.from({ length: MAX_EPISODES + 5 }, (_unused, position) => ({
			startTurn: position + 1,
			label: position === 0 ? "   " : `e${position}`,
			kind: "chat",
			outcome: "completed",
		}));
		const result = parseSegmentationResponseText(JSON.stringify({ episodes }));
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.episodes).toHaveLength(MAX_EPISODES);
		expect(result.value.episodes[0]?.label).toBe("uncategorized");
	});
});

describe("repairEpisodes", () => {
	test("returns nothing for an empty turn list", () => {
		expect(repairEpisodes([makeStart(1)], [])).toEqual([]);
	});

	test("derives end turns from the next start and keeps order", () => {
		const turns = sequentialTurns(10);
		const episodes = repairEpisodes([makeStart(5, { kind: "edit" }), makeStart(1)], turns);
		expect(episodes).toHaveLength(2);
		expect(episodes[0]?.turnRange).toEqual({ start: 1, end: 4 });
		expect(episodes[1]?.turnRange).toEqual({ start: 5, end: 10 });
		expect(episodes[1]?.kind).toBe("edit");
	});

	test("clamps out-of-range starts and snaps into the elided middle gap", () => {
		// Capped list with an elided middle: indices 1–4 then 90–93.
		const turns = makeTurnsAtIndices([1, 2, 3, 4, 90, 91, 92, 93]);
		const episodes = repairEpisodes([makeStart(1), makeStart(40), makeStart(999)], turns);
		expect(episodes.map((episode) => episode.turnRange.start)).toEqual([1, 90, 93]);
		expect(episodes.map((episode) => episode.turnRange.end)).toEqual([4, 92, 93]);
	});

	test("dedups starts that snap to the same turn, first claim wins", () => {
		const turns = sequentialTurns(6);
		const episodes = repairEpisodes(
			[makeStart(3, { label: "winner" }), makeStart(3.2, { label: "loser" })],
			turns,
		);
		expect(episodes.map((episode) => episode.label)).toEqual(["uncategorized", "winner"]);
	});

	test("forces the first turn to be an episode start", () => {
		const turns = sequentialTurns(8);
		const episodes = repairEpisodes([makeStart(5)], turns);
		expect(episodes[0]).toEqual({
			label: "uncategorized",
			kind: "uncategorized",
			outcome: "unknown",
			turnRange: { start: 1, end: 4 },
		});
	});

	test("caps the episode count at MAX_EPISODES", () => {
		const turns = sequentialTurns(20);
		const starts = turns.map((turn) => makeStart(turn.index));
		const episodes = repairEpisodes(starts, turns);
		expect(episodes).toHaveLength(MAX_EPISODES);
		expect(episodes[episodes.length - 1]?.turnRange.end).toBe(20);
	});

	test("demotes active outcomes on non-final episodes only", () => {
		const turns = sequentialTurns(9);
		const episodes = repairEpisodes(
			[
				makeStart(1, { outcome: "active" }),
				makeStart(4, { outcome: "completed" }),
				makeStart(7, { outcome: "active" }),
			],
			turns,
		);
		expect(episodes.map((episode) => episode.outcome)).toEqual(["unknown", "completed", "active"]);
	});

	test("splits an episode crossing the elision seam into included-turn runs", () => {
		const turns = makeTurnsAtIndices(cappedSeamIndices());
		const episodes = repairEpisodes(
			[makeStart(1, { label: "the work", kind: "edit", outcome: "active" })],
			turns,
		);
		expect(episodes).toEqual([
			// Label and kind carry over to both pieces; "active" survives only on the truly last piece.
			{ label: "the work", kind: "edit", outcome: "unknown", turnRange: { start: 1, end: 16 } },
			{ label: "the work", kind: "edit", outcome: "active", turnRange: { start: 137, end: 200 } },
		]);
		const included = new Set(turns.map((turn) => turn.index));
		for (const episode of episodes) {
			for (let index = episode.turnRange.start; index <= episode.turnRange.end; index += 1) {
				expect(included.has(index)).toBe(true);
			}
		}
	});

	test("seam-splitting only affects the episode whose run crosses the seam", () => {
		const turns = makeTurnsAtIndices(cappedSeamIndices());
		const episodes = repairEpisodes(
			[
				makeStart(1, { label: "early", kind: "explore", outcome: "completed" }),
				makeStart(150, { label: "late", kind: "edit", outcome: "active" }),
			],
			turns,
		);
		expect(episodes.map((episode) => episode.turnRange)).toEqual([
			{ start: 1, end: 16 },
			{ start: 137, end: 149 },
			{ start: 150, end: 200 },
		]);
		expect(episodes.map((episode) => episode.label)).toEqual(["early", "early", "late"]);
		expect(episodes.map((episode) => episode.kind)).toEqual(["explore", "explore", "edit"]);
		expect(episodes.map((episode) => episode.outcome)).toEqual([
			"completed",
			"completed",
			"active",
		]);
	});
});

describe("repairDelegations", () => {
	test("returns nothing for an empty turn list", () => {
		expect(repairDelegations([makeDelegation(1)], [])).toEqual([]);
	});

	test("snaps out-of-range and elided turns to real capped turns, dedupes, and sorts", () => {
		const turns = makeTurnsAtIndices([1, 2, 3, 4, 90, 91, 92, 93]);
		const claims = [
			makeDelegation(999, { label: "late" }),
			makeDelegation(40, { label: "middle winner", confidence: "low" }),
			makeDelegation(40.2, { label: "middle loser" }),
			makeDelegation(0, { label: "early" }),
		];
		expect(repairDelegations(claims, turns)).toEqual([
			{ turn: 1, label: "early", confidence: "high" },
			{ turn: 90, label: "middle winner", confidence: "low" },
			{ turn: 93, label: "late", confidence: "high" },
		]);
	});

	test("caps repaired delegation claims", () => {
		const turns = sequentialTurns(MAX_DELEGATIONS + 5);
		const repaired = repairDelegations(
			turns.map((turn) => makeDelegation(turn.index)),
			turns,
		);
		expect(repaired).toHaveLength(MAX_DELEGATIONS);
		expect(repaired[repaired.length - 1]?.turn).toBe(MAX_DELEGATIONS);
	});
});

describe("computeSegmentationFingerprint", () => {
	test("is stable for an unchanged snapshot", () => {
		const profile = makeProfile(sequentialTurns(5));
		expect(computeSegmentationFingerprint(profile)).toBe(
			computeSegmentationFingerprint(makeProfile(sequentialTurns(5))),
		);
	});

	test("changes with live source, turn count, and last-turn identity", () => {
		const base = computeSegmentationFingerprint(makeProfile(sequentialTurns(5)));
		const otherSource = computeSegmentationFingerprint(
			makeProfile(sequentialTurns(5), { liveSource: "branch-fallback" }),
		);
		expect(otherSource).not.toBe(base);
		const moreTurns = computeSegmentationFingerprint(makeProfile(sequentialTurns(6)));
		expect(moreTurns).not.toBe(base);
		const editedLastTurn = makeProfile([
			...sequentialTurns(4),
			makeTurn(5, { excerpt: "different ending" }),
		]);
		expect(computeSegmentationFingerprint(editedLastTurn)).not.toBe(base);
	});
});

describe("buildSegmentationPayload", () => {
	test("serializes exactly the capped turn list with the documented field shape", () => {
		const turns = [
			makeTurn(1, { role: "assistant", toolNames: ["bash"], excerpt: "ran a command" }),
			makeTurn(2),
			makeTurn(3),
		];
		const profile = makeProfile(turns, {
			cap: { originalCount: 120, includedCount: 3, elidedMiddleTurns: 117 },
		});
		const payload = buildSegmentationPayload(profile);
		expect(payload.includedTurnCount).toBe(3);
		expect(payload.wasTruncatedForPayload).toBe(false);
		const request = JSON.parse(payload.json) as Record<string, unknown>;
		expect(request.cwd).toBe("/repo");
		expect(request.model).toBe("anthropic/claude-fable-5");
		expect(request.usage).toBeNull();
		expect(request.turnCount).toBe(120);
		expect(request.capped).toEqual({ includedTurnCount: 3, elidedMiddleTurns: 117 });
		expect((request.turns as unknown[])[0]).toEqual({
			turn: 1,
			role: "assistant",
			tokens: 4,
			tools: ["bash"],
			excerpt: "ran a command",
		});
	});

	test("drops middle turns to honor the payload char cap and flags truncation", () => {
		const longExcerpt = "x".repeat(110);
		// 500 turns × >110-char excerpts serialize well past the 60k cap.
		const oversized = Array.from({ length: 500 }, (_unused, position) =>
			makeTurn(position + 1, { excerpt: `${longExcerpt} ${position + 1}` }),
		);
		const profile = makeProfile(oversized);
		const payload = buildSegmentationPayload(profile);
		expect(payload.json.length).toBeLessThanOrEqual(SEGMENTATION_PAYLOAD_MAX_CHARS);
		expect(payload.wasTruncatedForPayload).toBe(true);
		expect(payload.includedTurnCount).toBeLessThan(oversized.length);
		const request = JSON.parse(payload.json) as {
			capped: { includedTurnCount: number; elidedMiddleTurns: number };
			turns: { turn: number }[];
		};
		expect(request.capped.includedTurnCount).toBe(payload.includedTurnCount);
		expect(request.capped.elidedMiddleTurns).toBe(oversized.length - payload.includedTurnCount);
		// First and last turns are preserved; the middle is dropped.
		expect(request.turns[0]?.turn).toBe(1);
		expect(request.turns[request.turns.length - 1]?.turn).toBe(500);

		const smallPayload = buildSegmentationPayload(makeProfile(oversized.slice(0, 3)));
		expect(smallPayload.wasTruncatedForPayload).toBe(false);
	});
});
