import { describe, expect, test } from "vitest";

import {
	firstNonEmptyLine,
	nonEmptyLines,
	normalizeTextOutput,
	stripOuterCodeFence,
	trimOuterBlankLines,
} from "../src/text-normalization.ts";

describe("trimOuterBlankLines", () => {
	test("removes leading and trailing blank lines without touching inner spacing", () => {
		expect(trimOuterBlankLines("\n\n alpha \n\n beta\n\n")).toBe(" alpha \n\n beta");
	});
});

describe("firstNonEmptyLine", () => {
	test("returns undefined for empty and whitespace-only input", () => {
		expect(firstNonEmptyLine("")).toBeUndefined();
		expect(firstNonEmptyLine(" \n\t\r\n")).toBeUndefined();
	});

	test("normalizes CR and CRLF, trims, and returns the first non-empty line", () => {
		expect(firstNonEmptyLine("\r\n  alpha  \r beta\n")).toBe("alpha");
	});

	test("strips terminal escapes before selecting a line", () => {
		expect(firstNonEmptyLine("\u001B[31m  warning  \u001B[0m\nnext")).toBe("warning");
	});
});

describe("nonEmptyLines", () => {
	test("returns all trimmed non-empty lines after normalization", () => {
		expect(nonEmptyLines("\u001B[32m a \u001B[0m\r\n\r b \n")).toEqual(["a", "b"]);
	});
});

describe("stripOuterCodeFence", () => {
	test("removes one outer markdown code fence", () => {
		expect(stripOuterCodeFence("\n```markdown\nhello\n```\n")).toBe("hello");
	});

	test("keeps internal code fences", () => {
		expect(stripOuterCodeFence("before\n```\ninner\n```\nafter")).toBe(
			"before\n```\ninner\n```\nafter",
		);
	});
});

describe("normalizeTextOutput", () => {
	test("normalizes CRLF output before stripping an outer fence", () => {
		expect(normalizeTextOutput("\r\n```gitcommit\r\n[cp] Fix it\r\n```\r\n")).toBe("[cp] Fix it");
	});
});
