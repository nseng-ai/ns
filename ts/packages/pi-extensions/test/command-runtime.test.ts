import { describe, expect, test } from "bun:test";

import {
	formatCommand,
	formatOutputSection,
	normalizeExecResult,
	stripTerminalEscapes,
	tailText,
} from "../src/command-runtime.ts";

describe("command runtime helpers", () => {
	test("normalizes optional pi exec fields", () => {
		expect(normalizeExecResult({ code: 2 })).toEqual({
			stdout: "",
			stderr: "",
			code: 2,
			killed: false,
		});
		expect(normalizeExecResult({ stdout: "out", stderr: "err", code: 9, killed: true })).toEqual({
			stdout: "out",
			stderr: "err",
			code: 9,
			killed: true,
		});
	});

	test("formats command displays with shell quoting", () => {
		expect(formatCommand("gt", ["delete", "feature/foo", "-f"])).toBe("gt delete feature/foo -f");
		expect(formatCommand("gh", ["pr", "view", "branch name", "can't"])).toBe("gh pr view 'branch name' 'can'\\''t'");
	});

	test("strips terminal ANSI and OSC escapes", () => {
		expect(stripTerminalEscapes("\u001b[31mred\u001b[0m")).toBe("red");
		expect(stripTerminalEscapes("\u001b]8;;https://github.example/pull/101\u0007#101\u001b]8;;\u0007")).toBe("#101");
	});

	test("tailText returns full text under limits", () => {
		expect(tailText("line 1\nline 2", { maxLines: 3, maxChars: 100 })).toBe("line 1\nline 2");
	});

	test("tailText keeps the last lines with an omitted-line prefix", () => {
		const lines = Array.from({ length: 5 }, (_, index) => `line ${index + 1}`).join("\n");

		expect(tailText(lines, { maxLines: 2, maxChars: 100 })).toBe("… 3 earlier line(s) omitted\nline 4\nline 5");
	});

	test("tailText keeps final chars with an ellipsis when char-limited", () => {
		expect(tailText("abcdefghijklmnopqrstuvwxyz", { maxChars: 5 })).toBe("…vwxyz");
	});

	test("formatOutputSection strips escapes, normalizes carriage returns, and labels empty output", () => {
		expect(formatOutputSection("stdout", "\u001b[31mfirst\rsecond\u001b[0m\n", { maxLines: 10, maxChars: 100 })).toBe(
			"----- stdout tail -----\nfirst\nsecond",
		);
		expect(formatOutputSection("stderr", "\n", { maxLines: 10, maxChars: 100 })).toBe("----- stderr tail -----\n(empty)");
	});
});
