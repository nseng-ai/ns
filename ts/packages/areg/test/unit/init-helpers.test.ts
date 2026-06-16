import { describe, expect, test } from "vitest";

import {
	appendBlock,
	claudeBlock,
	managedBlockBounds,
	parseAsdlAregAgents,
	parseLegacyAregJsonAgents,
	replaceOrAppendAregSection,
	renderAregSection,
} from "../../src/operations/init.ts";

describe("init config helpers", () => {
	test("parses asdl.toml areg agents and validates bad values", () => {
		expect(parseAsdlAregAgents('[areg]\nagents = ["codex", "cursor"]\n')).toEqual({ ok: true, value: ["codex", "cursor"] });
		expect(parseAsdlAregAgents('[areg]\nagents = []\n')).toEqual({ ok: true, value: [] });
		expect(parseAsdlAregAgents('[areg\n')).toMatchObject({ ok: false, error: { message: expect.stringContaining("Invalid TOML") } });
		expect(parseAsdlAregAgents('[areg]\nagents = [""]\n')).toMatchObject({ ok: false, error: { message: expect.stringContaining("non-empty string list") } });
	});

	test("parses legacy areg.json agents", () => {
		expect(parseLegacyAregJsonAgents('{"agents":["codex","cursor"]}')).toEqual({ ok: true, value: ["codex", "cursor"] });
		expect(parseLegacyAregJsonAgents('[]')).toMatchObject({ ok: false, error: { message: "areg.json must contain a JSON object." } });
		expect(parseLegacyAregJsonAgents('{"agents":[]}')).toMatchObject({ ok: false, error: { message: "areg.json field `agents` must be a non-empty string list." } });
	});

	test("renders and replaces only the top-level areg TOML section", () => {
		expect(renderAregSection(["codex", "claude-code"])).toBe('[areg]\nagents = ["codex","claude-code"]\n');
		expect(replaceOrAppendAregSection('[roaster.diff]\nexclude = []\n', ["codex"])).toBe('[roaster.diff]\nexclude = []\n\n[areg]\nagents = ["codex"]\n');
		expect(replaceOrAppendAregSection('[before]\nx = 1\n\n[areg]\nagents = ["old"]\n\n[after]\ny = 2\n', ["new"])).toBe('[before]\nx = 1\n\n[areg]\nagents = ["new"]\n\n[after]\ny = 2\n');
	});
});

describe("init managed block helpers", () => {
	test("finds valid managed block bounds and rejects malformed variants", () => {
		expect(managedBlockBounds("prefix <s>body<e> suffix", { start: "<s>", end: "<e>" }, "file.md")).toEqual({ ok: true, value: { start: 7, end: 17 } });
		expect(managedBlockBounds("no block", { start: "<s>", end: "<e>" }, "file.md")).toEqual({ ok: true, value: null });
		expect(managedBlockBounds("<s>one<s><e>", { start: "<s>", end: "<e>" }, "file.md")).toMatchObject({ ok: false });
		expect(managedBlockBounds("<e>bad<s>", { start: "<s>", end: "<e>" }, "file.md")).toMatchObject({ ok: false });
	});

	test("appends blocks with Python-compatible newline behavior", () => {
		expect(appendBlock("", "BLOCK")).toBe("BLOCK\n");
		expect(appendBlock("text", "BLOCK")).toBe("text\n\nBLOCK\n");
		expect(appendBlock("text\n", "BLOCK")).toBe("text\n\nBLOCK\n");
		expect(appendBlock("text\n\n", "BLOCK")).toBe("text\n\nBLOCK\n");
	});

	test("Claude block can omit AGENTS include", () => {
		expect(claudeBlock({ includeAgentsRef: true })).toContain("@AGENTS.md");
		expect(claudeBlock({ includeAgentsRef: false })).not.toContain("@AGENTS.md");
	});
});
