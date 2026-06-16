import { describe, expect, test } from "vitest";

import { MAX_PROMPT_DIFF_FILE_TOKENS, MAX_PROMPT_DIFF_TOKENS, promptSizedDiff } from "../../src/gateways/harness-diff-cap.ts";
import { createLocalDiff, type LocalDiff } from "../../src/models.ts";

function diffFile(path: string, estimatedTokens: number, rawText = `diff --git a/${path} b/${path}\n+change\n`) {
	return {
		path,
		oldPath: null,
		changeKind: "modified" as const,
		rawText,
		isBinary: false,
		addedLines: 1,
		removedLines: 0,
		hunkCount: 1,
		byteSize: rawText.length,
		estimatedTokens,
	};
}

function localDiff(files: readonly ReturnType<typeof diffFile>[], diffText = files.map((file) => file.rawText).join("")): LocalDiff {
	return createLocalDiff({ baseRef: "main", diffText, files });
}

describe("prompt-sized diff coverage", () => {
	test("returns the original diff byte-for-byte when nothing is omitted under the total cap", () => {
		const diffText = "diff --git a/src/app.ts b/src/app.ts\n+change\n";

		const result = promptSizedDiff(localDiff([diffFile("src/app.ts", 10, diffText)], diffText));

		expect(result.diffText).toBe(diffText);
		expect(result.inputCoverage).toMatchObject({ includedFileCount: 1, omittedFileCount: 0, changedPathCount: 1 });
	});

	test("includes exact total-cap and exact per-file-cap inputs", () => {
		const exactTotalDiff = "a".repeat(MAX_PROMPT_DIFF_TOKENS * 4);
		const totalResult = promptSizedDiff(localDiff([diffFile("exact-total.ts", 1, exactTotalDiff)], exactTotalDiff));
		const perFileResult = promptSizedDiff(localDiff([diffFile("exact-file.ts", MAX_PROMPT_DIFF_FILE_TOKENS)]));

		expect(totalResult.diffText).toBe(exactTotalDiff);
		expect(totalResult.inputCoverage.omittedFileCount).toBe(0);
		expect(perFileResult.inputCoverage.omittedFileCount).toBe(0);
	});

	test("omits files over the per-file cap even when total input would fit", () => {
		const result = promptSizedDiff(localDiff([diffFile("large.ts", MAX_PROMPT_DIFF_FILE_TOKENS + 1)]));

		expect(result.inputCoverage.omittedFiles).toEqual([
			expect.objectContaining({ path: "large.ts", reason: "file_exceeds_cap", estimatedTokens: MAX_PROMPT_DIFF_FILE_TOKENS + 1 }),
		]);
		expect(result.diffText).toContain("# Roaster note: diff input was capped before sending to the review model.");
		expect(result.diffText).toContain("# - large.ts (modified,");
		expect(result.diffText).toContain("file exceeds cap");
	});

	test("uses strict greedy total-cap exhaustion and can include later smaller files", () => {
		const first = diffFile("first.ts", 39_990, "first\n");
		const second = diffFile("second.ts", 39_990, "second\n");
		const third = diffFile("third.ts", 39_990, "third\n");
		const tooLargeNext = diffFile("fourth.ts", 31, "fourth\n");
		const laterSmall = diffFile("fifth.ts", 30, "fifth\n");

		const result = promptSizedDiff(localDiff([first, second, third, tooLargeNext, laterSmall]));

		expect(result.inputCoverage.includedFileCount).toBe(4);
		expect(result.inputCoverage.omittedFiles).toEqual([expect.objectContaining({ path: "fourth.ts", reason: "diff_budget_exhausted" })]);
		expect(result.diffText).toContain("first\nsecond\nthird\nfifth\n");
		expect(result.diffText).not.toContain("fourth\n");
	});

	test("uses unknown path fallback and returns header only when all files are omitted", () => {
		const result = promptSizedDiff(localDiff([diffFile("", MAX_PROMPT_DIFF_FILE_TOKENS + 1, "large\n")]));

		expect(result.inputCoverage.omittedFiles[0]?.path).toBe("(unknown path)");
		expect(result.diffText).toContain("# Included file diffs follow.");
		expect(result.diffText).not.toContain("large\n");
		expect(result.diffText.endsWith("\n")).toBe(false);
	});
});
