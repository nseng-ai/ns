import { describe, expect, test } from "vitest";

import { stripTerminalEscapes } from "@asdl/core/terminal-escapes";

describe("terminal escapes", () => {
	test("strips terminal ANSI and OSC escapes from the public subpath", () => {
		expect(stripTerminalEscapes("\u001b[31mred\u001b[0m")).toBe("red");
		expect(
			stripTerminalEscapes("\u001b]8;;https://github.example/pull/101\u0007#101\u001b]8;;\u0007"),
		).toBe("#101");
	});
});
