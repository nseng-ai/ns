import { describe, expect, test } from "vitest";

import { truncateTextHead, truncateTextHeadTail } from "../src/text-truncation.ts";

describe("truncateTextHeadTail", () => {
	test("keeps unbounded values unchanged", () => {
		expect(
			truncateTextHeadTail({ value: "abc", maxChars: 3, headRatio: 0.5, buildMarker: () => "..." }),
		).toBe("abc");
	});

	test("builds a marker-bounded head and tail excerpt", () => {
		const value = `${"a".repeat(80)}${"b".repeat(80)}`;
		const truncated = truncateTextHeadTail({
			value,
			maxChars: 100,
			headRatio: 0.7,
			buildMarker: (omittedChars) => `\n[... TRUNCATED ${omittedChars} chars ...]\n`,
		});

		expect(truncated).toContain("[... TRUNCATED 60 chars ...]");
		expect(truncated.length).toBe(100);
		expect(truncated.startsWith("a".repeat(49))).toBe(true);
		expect(truncated.endsWith("b".repeat(21))).toBe(true);
	});

	test("allows callers to preserve a domain-specific omitted count", () => {
		const truncated = truncateTextHeadTail({
			value: "0123456789",
			maxChars: 7,
			headRatio: 0.5,
			headRounding: "ceil",
			markerOmittedChars: 99,
			buildMarker: (omittedChars) => `[${omittedChars}]`,
		});

		expect(truncated).toBe("01[99]9");
	});
});

describe("truncateTextHead", () => {
	test("keeps unbounded values unchanged after optional input trimming", () => {
		expect(
			truncateTextHead({
				value: " abc \n",
				maxChars: 3,
				shouldTrimInput: true,
				buildMarker: () => "...",
			}),
		).toBe("abc");
	});

	test("recomputes omitted characters after marker length changes", () => {
		const truncated = truncateTextHead({
			value: "0123456789",
			maxChars: 8,
			buildMarker: (omittedChars) => `[${omittedChars}]`,
		});

		expect(truncated).toBe("01234[5]");
	});
});
