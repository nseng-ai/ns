import { describe, expect, test } from "vitest";

import {
	normalizeTextOutput,
	stripOuterCodeFence,
	trimOuterBlankLines,
} from "../src/text-normalization.ts";

describe("trimOuterBlankLines", () => {
	test("removes leading and trailing blank lines without touching inner spacing", () => {
		expect(trimOuterBlankLines("\n\n alpha \n\n beta\n\n")).toBe(" alpha \n\n beta");
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
