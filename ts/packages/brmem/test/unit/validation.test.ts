import { describe, expect, it } from "vitest";

import {
	validateBranchName,
	validateEntryKey,
	validateKeyGlob,
	validateNamespaceName,
} from "../../src/validation.ts";

function expectValid(result: { type: string }): void {
	expect(result.type).toBe("valid");
}

function expectInvalid(result: { type: string }): void {
	expect(result.type).toBe("invalid");
}

describe("validation", () => {
	it("accepts durable Entry Key examples", () => {
		for (const key of [
			"plan",
			"plan.md",
			"plan/plan.md",
			"a/b/c/d/e",
			"a---b",
			"a-b_c.d",
			"UPPER",
			"with.dots.many",
			"foo..bar",
			"a.locker",
			".lockfile",
			"unicode-é-ok",
		]) {
			expectValid(validateEntryKey(key));
		}
	});

	it("rejects invalid Entry Keys", () => {
		for (const key of [
			"",
			"/leading",
			"trailing/",
			"a//b",
			"a:b",
			"has space",
			"a~b",
			"a^b",
			"a?b",
			"a*b",
			"a[b",
			"a\\b",
			"line\nbreak",
			"nul\0byte",
			"del\u007fbyte",
			"..",
			"a/../b",
			"a.lock",
			"a/b.lock",
		]) {
			expectInvalid(validateEntryKey(key));
		}
	});

	it("validates namespaces and branches", () => {
		expectValid(validateNamespaceName("base"));
		expectValid(validateNamespaceName("notes"));
		expectInvalid(validateNamespaceName(""));
		expectInvalid(validateNamespaceName("a/b"));
		expectValid(validateBranchName("feat/x/y"));
		expectInvalid(validateBranchName(""));
		expectInvalid(validateBranchName("feat---x"));
	});

	it("validates Entry Key glob patterns", () => {
		expectValid(validateKeyGlob("foo/*.md"));
		expectValid(validateKeyGlob("[ab]?.md"));
		expectInvalid(validateKeyGlob(""));
		expectInvalid(validateKeyGlob("bad\0glob"));
		expectInvalid(validateKeyGlob("bad\nglob"));
	});
});
