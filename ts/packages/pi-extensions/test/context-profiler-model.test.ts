import { describe, expect, test } from "vitest";

import type { BuildSystemPromptOptions, SessionEntry, Skill } from "@earendil-works/pi-coding-agent";
import {
	buildBaseRegions,
	buildLiveRegions,
	buildTurnsFromEntries,
	buildTurnsFromMessages,
	CAP_FIRST_TURNS,
	CAP_LAST_TURNS,
	capTurns,
	deriveLiveTurns,
	estimateTokensFromChars,
	normalizeMessage,
	type LiveTurn,
} from "../src/context-profiler/model.ts";
import { makeTurns as makeTurnsAtIndices } from "./context-profiler-fakes.ts";

function makeSkill(overrides: Partial<Skill> = {}): Skill {
	return {
		name: "alpha",
		description: "first skill",
		filePath: "skills/alpha/SKILL.md",
		baseDir: "skills/alpha",
		sourceInfo: { path: "skills/alpha/SKILL.md", source: "test", scope: "project", origin: "top-level" },
		disableModelInvocation: false,
		...overrides,
	};
}

function skillPromptChars(skill: Skill): number {
	return JSON.stringify({
		name: skill.name,
		description: skill.description,
		filePath: skill.filePath,
		disabled: skill.disableModelInvocation,
	}).length;
}

function makeOptions(): BuildSystemPromptOptions {
	return {
		cwd: "/repo",
		customPrompt: "CUSTOM",
		appendSystemPrompt: "APPEND!",
		promptGuidelines: ["g1", "g2"],
		contextFiles: [{ path: "AGENTS.md", content: "0123456789" }],
		skills: [makeSkill()],
		selectedTools: ["read", "bash"],
		toolSnippets: { read: "snippet" },
	};
}

function knownCharsOf(options: BuildSystemPromptOptions): number {
	const fileChars = (options.contextFiles ?? []).reduce((total, file) => total + file.content.length, 0);
	const skillChars = (options.skills ?? []).reduce((total, skill) => total + skillPromptChars(skill), 0);
	const toolChars = (options.selectedTools ?? []).reduce((total, tool) => total + tool.length + (options.toolSnippets?.[tool]?.length ?? 0), 0);
	const guidelineChars = (options.promptGuidelines ?? []).reduce((total, guideline) => total + guideline.length + 3, 0);
	return fileChars + skillChars + toolChars + (options.customPrompt?.length ?? 0) + (options.appendSystemPrompt?.length ?? 0) + guidelineChars;
}

function makeTurns(count: number, tokensEach = 4): LiveTurn[] {
	return Array.from({ length: count }, (_unused, position) => ({
		index: position + 1,
		role: "user",
		tokens: { value: tokensEach, provenance: "estimated" as const },
		toolNames: [],
		excerpt: `turn ${position + 1}`,
		message: normalizeMessage({ role: "user", content: `turn ${position + 1}` }),
	}));
}

describe("estimateTokensFromChars", () => {
	test("applies ceil(chars / 4) with a zero floor and estimated provenance", () => {
		expect(estimateTokensFromChars(0)).toEqual({ value: 0, provenance: "estimated" });
		expect(estimateTokensFromChars(1)).toEqual({ value: 1, provenance: "estimated" });
		expect(estimateTokensFromChars(4)).toEqual({ value: 1, provenance: "estimated" });
		expect(estimateTokensFromChars(5)).toEqual({ value: 2, provenance: "estimated" });
		expect(estimateTokensFromChars(-10)).toEqual({ value: 0, provenance: "estimated" });
	});
});

describe("buildBaseRegions", () => {
	test("returns the base-pending placeholder before any prompt capture", () => {
		const regions = buildBaseRegions(null, null);
		expect(regions).toHaveLength(1);
		expect(regions[0]?.id).toBe("base-pending");
		expect(regions[0]?.tokens).toEqual({ value: 0, provenance: "estimated" });
		expect(regions[0]?.members).toHaveLength(1);
		expect(regions[0]?.members[0]?.note).toBe("no system prompt options captured yet");
	});

	test("decomposes prompt options into the four base regions", () => {
		const options = makeOptions();
		const known = knownCharsOf(options);
		const systemPrompt = "S".repeat(known + 40);
		const regions = buildBaseRegions(options, systemPrompt);

		expect(regions.map((region) => region.id)).toEqual(["base-instructions", "base-context-files", "base-skills", "base-tools"]);

		const instructions = regions[0];
		// scaffold 40 + custom 6 + append 7 + guidelines (2+3)*2 chars.
		expect(instructions?.tokens.value).toBe(Math.ceil((40 + 6 + 7 + 10) / 4));
		const scaffold = instructions?.members[0];
		expect(scaffold?.tokens.value).toBe(10);
		expect(scaffold?.content).toBe(systemPrompt);
		expect(instructions?.members[1]?.content).toBe("CUSTOM");
		expect(instructions?.members[2]?.content).toBe("APPEND!");
		expect(instructions?.members[3]?.content).toBe("• g1\n• g2");

		const files = regions[1];
		expect(files?.tokens.value).toBe(Math.ceil(10 / 4));
		expect(files?.members[0]?.name).toBe("AGENTS.md");
		expect(files?.members[0]?.content).toBe("0123456789");

		const skills = regions[2];
		expect(skills?.members[0]?.tokens.value).toBe(Math.ceil(skillPromptChars(makeSkill()) / 4));
		expect(skills?.members[0]?.note).toContain("reconstructed");

		const tools = regions[3];
		expect(tools?.members.map((member) => member.name)).toEqual(["read", "bash"]);
		expect(tools?.members[0]?.tokens.value).toBe(Math.ceil(("read".length + "snippet".length) / 4));
		expect(tools?.members[0]?.content).toBe("snippet");
		expect(tools?.members[1]?.content).toBeNull();
		expect(tools?.members[1]?.note).toContain("no prompt snippet captured");

		const allCounts = regions.flatMap((region) => [region.tokens, ...region.members.map((member) => member.tokens)]);
		expect(allCounts.every((count) => count.provenance === "estimated")).toBe(true);
	});

	test("clamps scaffold chars at zero when known parts exceed the assembled prompt", () => {
		const options = makeOptions();
		const regions = buildBaseRegions(options, "short");
		expect(regions[0]?.members[0]?.tokens.value).toBe(0);
	});

	test("defaults selected tools to the snippet keys when absent", () => {
		const options: BuildSystemPromptOptions = { cwd: "/repo", toolSnippets: { grep: "find things" } };
		const regions = buildBaseRegions(options, "");
		expect(regions[3]?.members.map((member) => member.name)).toEqual(["grep"]);
	});
});

describe("buildTurnsFromMessages", () => {
	test("derives role, tokens, and excerpt from string content", () => {
		const turns = buildTurnsFromMessages([{ role: "user", content: "hello world" }]);
		expect(turns).toHaveLength(1);
		expect(turns[0]?.index).toBe(1);
		expect(turns[0]?.role).toBe("user");
		expect(turns[0]?.tokens).toEqual({ value: Math.ceil(11 / 4), provenance: "estimated" });
		expect(turns[0]?.excerpt).toBe("hello world");
	});

	test("sums text, thinking, and toolCall chars and ignores images", () => {
		const args = { path: "/tmp/x", limit: 5 };
		const message = {
			role: "assistant",
			content: [
				{ type: "text", text: "abcd" },
				{ type: "thinking", thinking: "efgh" },
				{ type: "toolCall", name: "read", arguments: args },
				{ type: "image", data: "ZGF0YQ==" },
			],
		};
		const turns = buildTurnsFromMessages([message]);
		// Tool args count as pretty JSON — exactly what the verbatim view renders.
		const expectedChars = 4 + 4 + "read".length + JSON.stringify(args, null, 2).length;
		expect(turns[0]?.tokens.value).toBe(Math.ceil(expectedChars / 4));
		expect(turns[0]?.toolNames).toEqual(["read"]);
	});

	test("dedupes direct toolName against toolCall part names", () => {
		const message = {
			role: "toolResult",
			toolName: "bash",
			content: [{ type: "toolCall", name: "bash", arguments: {} }],
		};
		expect(buildTurnsFromMessages([message])[0]?.toolNames).toEqual(["bash"]);
	});

	test("falls back excerpt to tool name, then collapsed JSON of the whole message", () => {
		const toolOnly = { role: "toolResult", toolName: "bash", content: [] };
		expect(buildTurnsFromMessages([toolOnly])[0]?.excerpt).toBe("bash");
		const bare = { role: "custom" };
		expect(buildTurnsFromMessages([bare])[0]?.excerpt).toBe('{ "role": "custom" }');
	});

	test("collapses whitespace and caps the excerpt at 120 chars", () => {
		const text = `lead\n\n${"x".repeat(300)}`;
		const turns = buildTurnsFromMessages([{ role: "user", content: text }]);
		const excerpt = turns[0]?.excerpt ?? "";
		expect(excerpt.startsWith("lead x")).toBe(true);
		expect(excerpt).toHaveLength(120);
		expect(excerpt.endsWith("…")).toBe(true);
	});
});

describe("normalizeMessage", () => {
	test("wraps a non-record message in a single opaque part", () => {
		expect(normalizeMessage("plain string")).toEqual({
			role: "message",
			toolName: null,
			parts: [{ kind: "opaque", json: '"plain string"' }],
			detailsJson: null,
		});
	});

	test("normalizes typed parts and falls back to 'tool' for nameless tool calls", () => {
		const normalized = normalizeMessage({
			role: "assistant",
			content: [
				{ type: "text", text: "hi" },
				{ type: "thinking", thinking: "hmm" },
				{ type: "toolCall", arguments: { a: 1 } },
				{ type: "image", data: "ZGF0YQ==" },
			],
		});
		expect(normalized.role).toBe("assistant");
		expect(normalized.parts).toEqual([
			{ kind: "text", text: "hi" },
			{ kind: "thinking", text: "hmm" },
			{ kind: "toolCall", name: "tool", argsJson: JSON.stringify({ a: 1 }, null, 2) },
			{ kind: "image" },
		]);
	});

	test("turns unknown record parts into opaque JSON and skips non-record parts", () => {
		const normalized = normalizeMessage({ role: "assistant", content: [{ type: "mystery", payload: 1 }, 42] });
		expect(normalized.parts).toEqual([{ kind: "opaque", json: JSON.stringify({ type: "mystery", payload: 1 }, null, 2) }]);
	});

	test("keeps an empty message with only a toolName free of parts", () => {
		const normalized = normalizeMessage({ role: "toolResult", toolName: "bash", content: [] });
		expect(normalized.toolName).toBe("bash");
		expect(normalized.parts).toEqual([]);
		expect(normalized.detailsJson).toBeNull();
	});

	test("represents a fully empty message as one opaque part of its own JSON", () => {
		const bare = { role: "custom" };
		expect(normalizeMessage(bare).parts).toEqual([{ kind: "opaque", json: JSON.stringify(bare, null, 2) }]);
	});

	test("pretty-prints details when present", () => {
		const normalized = normalizeMessage({ role: "toolResult", content: "out", details: { exitCode: 0 } });
		expect(normalized.detailsJson).toBe(JSON.stringify({ exitCode: 0 }, null, 2));
	});
});

describe("buildTurnsFromEntries", () => {
	test("maps message entries and synthesizes compaction/branch_summary/custom turns", () => {
		const base = { id: "e", parentId: null, timestamp: "2026-01-01T00:00:00Z" };
		// Test fixture: only the fields the derivation reads are populated.
		const entries = [
			{ ...base, type: "message", message: { role: "user", content: "hi" } },
			{ ...base, type: "custom_message", customType: "note", content: "remember", display: true, details: { a: 1 } },
			{ ...base, type: "compaction", summary: "squashed", firstKeptEntryId: "e", tokensBefore: 9 },
			{ ...base, type: "branch_summary", fromId: "e", summary: "branched" },
			{ ...base, type: "model_change", provider: "anthropic", modelId: "m" },
		] as unknown as SessionEntry[];
		const turns = buildTurnsFromEntries(entries);
		expect(turns.map((turn) => turn.role)).toEqual(["user", "custom", "compaction", "branch_summary"]);
		expect(turns.map((turn) => turn.index)).toEqual([1, 2, 3, 4]);
		expect(turns[2]?.excerpt).toBe("squashed");
		expect(turns[3]?.excerpt).toBe("branched");
	});
});

describe("capTurns", () => {
	test("keeps everything at exactly the cap", () => {
		const turns = makeTurns(CAP_FIRST_TURNS + CAP_LAST_TURNS);
		const capped = capTurns(turns);
		expect(capped.turns).toHaveLength(80);
		expect(capped.cap).toEqual({ originalCount: 80, includedCount: 80, elidedMiddleTurns: 0 });
	});

	test("keeps first 16 and last 64 above the cap and reports the elided middle", () => {
		const turns = makeTurns(81);
		const capped = capTurns(turns);
		expect(capped.turns).toHaveLength(80);
		expect(capped.cap).toEqual({ originalCount: 81, includedCount: 80, elidedMiddleTurns: 1 });
		expect(capped.turns[CAP_FIRST_TURNS - 1]?.index).toBe(16);
		expect(capped.turns[CAP_FIRST_TURNS]?.index).toBe(18);
		expect(capped.turns[capped.turns.length - 1]?.index).toBe(81);
	});
});

describe("deriveLiveTurns", () => {
	test("treats the context event as authoritative once received, even when empty", () => {
		const branchEntries = [
			{
				id: "e",
				parentId: null,
				timestamp: "2026-01-01T00:00:00Z",
				type: "message",
				message: { role: "user", content: "hi" },
			},
		] as unknown as SessionEntry[];
		const live = deriveLiveTurns({ contextMessages: [], branchEntries });
		expect(live.source).toBe("context-event");
		expect(live.turns).toHaveLength(0);
	});

	test("falls back to branch entries before the first context event", () => {
		const branchEntries = [
			{
				id: "e",
				parentId: null,
				timestamp: "2026-01-01T00:00:00Z",
				type: "message",
				message: { role: "user", content: "hi" },
			},
		] as unknown as SessionEntry[];
		const live = deriveLiveTurns({ contextMessages: null, branchEntries });
		expect(live.source).toBe("branch-fallback");
		expect(live.turns).toHaveLength(1);
	});
});

describe("buildLiveRegions", () => {
	test("returns no regions for no turns", () => {
		expect(buildLiveRegions([])).toEqual([]);
	});

	test("derives one deterministic span without annotations", () => {
		const short = buildLiveRegions(makeTurns(2));
		expect(short).toHaveLength(1);
		expect(short[0]?.label).toBe("current exchange");
		const regions = buildLiveRegions(makeTurns(5, 4));
		expect(regions).toHaveLength(1);
		expect(regions[0]).toMatchObject({
			label: "conversation turns",
			kind: "chat",
			outcome: null,
			turnRange: { start: 1, end: 5 },
			tokens: { value: 20, provenance: "estimated" },
			isCurrent: true,
			source: "deterministic",
		});
	});

	test("renders annotation rows plus unannotated gaps when episodes are supplied", () => {
		const turns = makeTurns(10, 4);
		const regions = buildLiveRegions(turns, [
			{ label: "setup", kind: "explore", outcome: "completed", turnRange: { start: 1, end: 4 } },
			{ label: "fix", kind: "edit", outcome: "active", turnRange: { start: 7, end: 10 } },
		]);
		expect(regions.map((region) => region.label)).toEqual(["setup", "unannotated turns", "fix"]);
		expect(regions[0]).toMatchObject({
			kind: "explore",
			outcome: "completed",
			turnRange: { start: 1, end: 4 },
			tokens: { value: 16 },
			isCurrent: false,
			source: "annotation",
		});
		expect(regions[1]).toMatchObject({ kind: "uncategorized", outcome: null, turnRange: { start: 5, end: 6 }, tokens: { value: 8 }, source: "deterministic" });
		expect(regions[2]).toMatchObject({ kind: "edit", outcome: "active", turnRange: { start: 7, end: 10 }, tokens: { value: 16 }, isCurrent: true });
	});

	test("skips the elision-seam gap between episodes instead of emitting a ghost region", () => {
		// Capped-shape list: indices 1..16 then 137..200; 17..136 are elided.
		const turns = makeTurnsAtIndices([
			...Array.from({ length: 16 }, (_unused, position) => position + 1),
			...Array.from({ length: 64 }, (_unused, position) => position + 137),
		]);
		const regions = buildLiveRegions(turns, [
			{ label: "early", kind: "explore", outcome: "completed", turnRange: { start: 1, end: 16 } },
			{ label: "late", kind: "edit", outcome: "active", turnRange: { start: 137, end: 200 } },
		]);
		// No zero-turn "unannotated turns" row for the 17..136 hole.
		expect(regions.map((region) => region.label)).toEqual(["early", "late"]);
		expect(regions.every((region) => region.tokens.value > 0)).toBe(true);
	});

	test("clamps annotation ranges to real turn indices", () => {
		const turns = makeTurns(4, 4);
		const regions = buildLiveRegions(turns, [{ label: "everything", kind: "chat", outcome: "active", turnRange: { start: 0, end: 99 } }]);
		expect(regions).toHaveLength(1);
		expect(regions[0]?.turnRange).toEqual({ start: 1, end: 4 });
		expect(regions[0]?.tokens.value).toBe(16);
		expect(regions[0]?.isCurrent).toBe(true);
	});
});
