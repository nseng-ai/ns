import { describe, expect, test } from "vitest";

import {
	finalizeBranchSlug,
	MAX_BRANCH_SLUG_LENGTH,
	normalizeBranchSlugText,
	sanitizeBranchName,
	trimBranchSlugToLength,
} from "../src/branch-slug.ts";

describe("normalizeBranchSlugText", () => {
	test("normalizes unicode prose to ascii kebab-case", () => {
		expect(normalizeBranchSlugText("Résumé: Fix branch_slug!!!")).toBe("resume-fix-branch-slug");
	});
});

describe("sanitizeBranchName", () => {
	test("uses the first non-empty line after stripping markdown code fences", () => {
		expect(sanitizeBranchName("\n```text\n Ship the Plan!!! \n```\nignored line")).toBe("ship-the");
	});

	test("returns undefined when no usable slug remains", () => {
		expect(sanitizeBranchName("---")).toBeUndefined();
	});
});

describe("trimBranchSlugToLength", () => {
	test("trims trailing separators after truncation", () => {
		expect(trimBranchSlugToLength("abc-def", 4)).toBe("abc");
	});
});

describe("finalizeBranchSlug", () => {
	test("strips generic plan suffixes and caps length", () => {
		const value = `${"a".repeat(MAX_BRANCH_SLUG_LENGTH)}-plan`;
		expect(finalizeBranchSlug(value)).toBe("a".repeat(MAX_BRANCH_SLUG_LENGTH));
	});
});
