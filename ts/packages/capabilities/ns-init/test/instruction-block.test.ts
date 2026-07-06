import { describe, expect, it } from "vitest";

import {
	applyObjectiveInstructionBlock,
	CLAUDE_AGENTS_IMPORT_LINE,
	ensureClaudeAgentsImport,
	renderObjectiveInstructionBlock,
} from "../src/instruction-block.ts";

describe("renderObjectiveInstructionBlock", () => {
	it("teaches the lean day-one contract", () => {
		const block = renderObjectiveInstructionBlock();
		expect(block).toContain("<!-- ns:objectives:begin v1 -->");
		expect(block).toContain("ns objective list");
		expect(block).toContain(".ns/objectives/");
		expect(block).toContain("<!-- ns:objectives:end -->");
	});
});

describe("applyObjectiveInstructionBlock", () => {
	it("appends the block to an empty file", () => {
		const result = applyObjectiveInstructionBlock({ text: "" });
		expect(result).toMatchObject({ type: "applied", change: "appended" });
		if (result.type !== "applied") throw new Error("expected applied");
		expect(result.content).toBe(`${renderObjectiveInstructionBlock()}\n`);
	});

	it("preserves existing customer content when appending", () => {
		const result = applyObjectiveInstructionBlock({ text: "# My repo\n\nHouse rules.\n" });
		if (result.type !== "applied") throw new Error("expected applied");
		expect(result.change).toBe("appended");
		expect(result.content.startsWith("# My repo\n\nHouse rules.\n\n<!-- ns:objectives:begin")).toBe(
			true,
		);
	});

	it("is idempotent on re-apply", () => {
		const first = applyObjectiveInstructionBlock({ text: "# My repo\n" });
		if (first.type !== "applied") throw new Error("expected applied");
		const second = applyObjectiveInstructionBlock({ text: first.content });
		expect(second).toMatchObject({ type: "applied", change: "unchanged" });
		if (second.type !== "applied") throw new Error("expected applied");
		expect(second.content).toBe(first.content);
	});

	it("replaces a stale block while preserving surrounding content", () => {
		const stale = [
			"# My repo",
			"",
			"<!-- ns:objectives:begin v0 -->",
			"old instructions",
			"<!-- ns:objectives:end -->",
			"",
			"Trailing customer prose.",
			"",
		].join("\n");
		const result = applyObjectiveInstructionBlock({ text: stale });
		if (result.type !== "applied") throw new Error("expected applied");
		expect(result.change).toBe("replaced");
		expect(result.content).toContain("# My repo");
		expect(result.content).toContain("Trailing customer prose.");
		expect(result.content).toContain("<!-- ns:objectives:begin v1 -->");
		expect(result.content).not.toContain("old instructions");
	});

	it("reports a malformed region instead of clobbering it", () => {
		const result = applyObjectiveInstructionBlock({
			text: "<!-- ns:objectives:begin v1 -->\nno end marker\n",
		});
		expect(result).toMatchObject({ type: "malformed" });
	});
});

describe("ensureClaudeAgentsImport", () => {
	it("creates the import line from empty content", () => {
		const result = ensureClaudeAgentsImport({ text: "" });
		expect(result.change).toBe("appended");
		expect(result.content).toBe(`${CLAUDE_AGENTS_IMPORT_LINE}\n`);
	});

	it("appends the import line after existing content", () => {
		const result = ensureClaudeAgentsImport({ text: "# Claude notes\n" });
		expect(result.change).toBe("appended");
		expect(result.content).toBe(`# Claude notes\n\n${CLAUDE_AGENTS_IMPORT_LINE}\n`);
	});

	it("leaves content with an existing @AGENTS.md import untouched", () => {
		const existing = "# Claude notes\n\nSee @AGENTS.md for everything.\n";
		const result = ensureClaudeAgentsImport({ text: existing });
		expect(result).toEqual({ content: existing, change: "unchanged" });
	});
});
