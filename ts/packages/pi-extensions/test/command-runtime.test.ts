import { describe, expect, test } from "bun:test";

import { formatCommand, formatOutputSection, normalizeExecResult, stripTerminalEscapes, tailText } from "../src/command-runtime.ts";

describe("command runtime helpers", () => {
	test("normalizes optional pi exec fields", () => {
		expect(normalizeExecResult({ code: 0 })).toEqual({ stdout: "", stderr: "", code: 0, killed: false });
		expect(normalizeExecResult({ stdout: "out", stderr: "err", code: 2, killed: true })).toEqual({ stdout: "out", stderr: "err", code: 2, killed: true });
	});

	test("formats command displays with shell quoting", () => {
		expect(formatCommand("gh", ["pr", "view", "branch name", "can't"])).toBe("gh pr view 'branch name' 'can'\\''t'");
		expect(formatCommand("git", ["status", "--porcelain=v1"])).toBe("git status --porcelain=v1");
	});

	test("strips terminal ANSI and OSC escapes", () => {
		expect(stripTerminalEscapes("\u001B[31mred\u001B[0m")).toBe("red");
		expect(stripTerminalEscapes("\u001B]8;;https://example.test\u0007#522\u001B]8;;\u0007")).toBe("#522");
	});

	test("tailText returns full text under limits", () => {
		expect(tailText("a\nb", { maxChars: 10, maxLines: 5 })).toBe("a\nb");
	});

	test("tailText keeps the last lines with an omitted-line prefix", () => {
		expect(tailText("one\ntwo\nthree", { maxChars: 100, maxLines: 2 })).toBe("… 1 earlier line(s) omitted\ntwo\nthree");
	});

	test("tailText keeps final chars with an ellipsis when char-limited", () => {
		expect(tailText("abcdefgh", { maxChars: 4 })).toBe("…efgh");
	});

	test("formatOutputSection strips escapes, normalizes carriage returns, and labels empty output", () => {
		expect(formatOutputSection("stdout", "\u001B[31ma\u001B[0m\rb\n", { maxChars: 20 })).toBe("----- stdout tail -----\na\nb");
		expect(formatOutputSection("stderr", "", { maxChars: 20 })).toBe("----- stderr tail -----\n(empty)");
	});
});
