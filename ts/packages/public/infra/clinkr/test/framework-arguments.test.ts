import { describe, expect, test } from "vitest";

import { resolveClinkrOutputFormat } from "@nseng-ai/clinkr/app";

describe("Clinkr output format resolution", () => {
	test.each([
		{ argv: [], expected: "human" },
		{ argv: ["--format", "json"], expected: "json" },
		{ argv: ["--format=md"], expected: "md" },
		{ argv: ["--format=invalid"], expected: "human" },
		{ argv: ["--format=json", "--format=md"], expected: "human" },
	] as const)("resolves $argv as $expected", ({ argv, expected }) => {
		expect(resolveClinkrOutputFormat(argv)).toBe(expected);
	});
});
