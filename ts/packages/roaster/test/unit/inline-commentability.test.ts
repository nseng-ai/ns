import { describe, expect, test } from "vitest";

import { classifyInlineFindings, commentableRightSideLines } from "../../src/inline-commentability.ts";
import type { PRChangedFile, ReviewFinding } from "../../src/models.ts";

describe("commentableRightSideLines", () => {
	test("includes added and context lines but excludes deleted lines", () => {
		const lines = commentableRightSideLines("@@ -1,3 +1,3 @@\n context\n-old\n+new\n");

		expect([...lines]).toEqual([1, 2]);
	});

	test("handles new files, deleted files, single-line hunks, multi-hunks, no-newline markers, and pre-hunk text", () => {
		expect([...commentableRightSideLines("@@ -0,0 +1,3 @@\n+one\n+two\n+three\n")]).toEqual([1, 2, 3]);
		expect([...commentableRightSideLines("@@ -1,3 +0,0 @@\n-one\n-two\n-three\n")]).toEqual([]);
		expect([...commentableRightSideLines("@@ -7 +8 @@\n+new\n")]).toEqual([8]);
		expect([...commentableRightSideLines("+pre\n@@ -1 +1 @@\n one\n@@ -9 +10 @@\n+two\n\\ No newline at end of file\n")]).toEqual([1, 10]);
	});

	test("returns an empty set for null patches", () => {
		expect([...commentableRightSideLines(null)]).toEqual([]);
	});
});

describe("classifyInlineFindings", () => {
	const changedFiles: readonly PRChangedFile[] = [
		{ path: "src/app.ts", status: "modified", patch: "@@ -1,2 +1,2 @@\n old\n+new\n" },
		{ path: "image.png", status: "added", patch: null },
	];

	test("classifies inlineable findings", () => {
		const result = classifyInlineFindings([finding({ path: "src/app.ts", line: 2 })], changedFiles);

		expect(result.inlineable).toHaveLength(1);
		expect(result.inlineable[0]?.target).toEqual({ path: "src/app.ts", line: 2 });
		expect(result.fallbackOnly).toEqual([]);
	});

	test.each([
		[finding({ path: null, line: 1 }), "missing_path"],
		[finding({ path: "src/app.ts", line: null }), "missing_line"],
		[finding({ path: "src/other.ts", line: 1 }), "file_not_changed"],
		[finding({ path: "image.png", line: 1 }), "patch_unavailable"],
		[finding({ path: "src/app.ts", line: 99 }), "line_not_in_diff"],
	] as const)("classifies fallback reason %s", (item, reason) => {
		const result = classifyInlineFindings([item], changedFiles);

		expect(result.inlineable).toEqual([]);
		expect(result.fallbackOnly).toHaveLength(1);
		expect(result.fallbackOnly[0]?.reason).toBe(reason);
	});
});

function finding(overrides: Partial<ReviewFinding>): ReviewFinding {
	return {
		path: "src/app.ts",
		line: 1,
		severity: "warning",
		summary: "Summary",
		details: "Details",
		...overrides,
	};
}
