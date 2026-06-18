import { describe, expect, test } from "vitest";

import {
	createFindingsReview,
	createLocalDiff,
	findingsReviewSchema,
	harnessReviewRequestSchema,
	inlineClassificationResultSchema,
	inlinePostingStatusSchema,
	localDiffSchema,
	postInlineFindingsResultSchema,
	prChangedFileSchema,
	prDiscussionCommentSchema,
	prInlineCommentInputSchema,
	prReviewCommentSchema,
	reviewDefinitionSchema,
	reviewFindingSchema,
	reviewExecutionResponseSchema,
	reviewInputCoverageSchema,
	reviewRunResultSchema,
	reviewUsageSchema,
	reviewUsageTotalInputTokens,
} from "../../src/models.ts";

describe("roaster domain schemas", () => {
	test("accepts representative review definitions and findings payloads", () => {
		const definition = reviewDefinitionSchema.parse({
			name: "typescript-style",
			description: "Review TypeScript diffs.",
			instructions: "Flag concrete issues.",
			defaultModel: "haiku",
			applicability: { include: ["**/*.ts"], exclude: [] },
		});

		const finding = reviewFindingSchema.parse({
			path: "src/app.ts",
			line: 12,
			severity: "warning",
			summary: "Avoid broad casts",
			details: "The changed line casts an unknown payload without validation.",
		});

		expect(definition.name).toBe("typescript-style");
		expect(createFindingsReview([finding])).toEqual({
			format: "findings",
			findings: [finding],
			count: 1,
		});
	});

	test("rejects malformed findings and mismatched counts", () => {
		expect(() =>
			reviewFindingSchema.parse({
				path: "",
				line: 1,
				severity: "warning",
				summary: "x",
				details: "y",
			}),
		).toThrow();
		expect(() =>
			reviewFindingSchema.parse({
				path: "src/app.ts",
				line: 1,
				severity: "fatal",
				summary: "x",
				details: "y",
			}),
		).toThrow();
		expect(() =>
			findingsReviewSchema.parse({ format: "findings", findings: [], count: 1 }),
		).toThrow();
		expect(() =>
			findingsReviewSchema.parse({ format: "findings", findings: [], count: 0, extra: true }),
		).toThrow();
	});

	test("models local diffs with derived changed paths", () => {
		const localDiff = createLocalDiff({
			baseRef: "main",
			diffText: "diff text",
			files: [
				{
					path: "src/app.ts",
					oldPath: null,
					changeKind: "modified",
					rawText: "raw",
					isBinary: false,
					addedLines: 1,
					removedLines: 0,
					hunkCount: 1,
					byteSize: 3,
					estimatedTokens: 1,
				},
			],
		});

		expect(localDiffSchema.parse(localDiff).changedPaths).toEqual(["src/app.ts"]);
	});

	test("validates coverage counts and usage totals", () => {
		const coverage = reviewInputCoverageSchema.parse({
			fullDiffEstimatedTokens: 100,
			promptDiffTokenCap: 80,
			promptDiffFileTokenCap: 50,
			changedPathCount: 2,
			includedFileCount: 1,
			omittedFileCount: 1,
			omittedFiles: [
				{
					path: "large.ts",
					changeKind: "modified",
					byteSize: 1000,
					estimatedTokens: 300,
					addedLines: 5,
					removedLines: 2,
					reason: "file_exceeds_cap",
				},
			],
		});
		const usage = reviewUsageSchema.parse({
			inputTokens: 10,
			outputTokens: 4,
			cacheCreationInputTokens: 3,
			cacheReadInputTokens: 2,
			totalCostUsd: 0.05,
			durationMs: 1234,
			numTurns: 1,
		});

		expect(coverage.omittedFileCount).toBe(1);
		expect(reviewUsageTotalInputTokens(usage)).toBe(15);
		expect(() => reviewInputCoverageSchema.parse({ ...coverage, omittedFileCount: 2 })).toThrow();
	});

	test("validates harness request and response payloads", () => {
		const localDiff = createLocalDiff({ baseRef: "main", diffText: "diff", files: [] });
		const reviewDefinition = reviewDefinitionSchema.parse({
			name: "typescript-style",
			description: "Review TypeScript diffs.",
			instructions: "Flag concrete issues.",
			defaultModel: "haiku",
			applicability: { include: ["**/*.ts"], exclude: [] },
		});
		const request = harnessReviewRequestSchema.parse({
			model: "haiku",
			reviewDefinition,
			target: { localDiff },
		});
		const response = reviewExecutionResponseSchema.parse({
			payload: createFindingsReview([]),
			usage: null,
			inputCoverage: null,
		});

		expect(request.target.localDiff.baseRef).toBe("main");
		expect(response.payload.count).toBe(0);
	});

	test("validates review run result contract", () => {
		const result = reviewRunResultSchema.parse({
			reviewName: "typescript-style",
			reviewPath: "reviews/typescript-style.md",
			model: "haiku",
			baseRef: "main",
			format: "findings",
			count: 0,
			findings: [],
			usage: null,
			inputCoverage: null,
		});

		expect(result.count).toBe(0);
		expect(() => reviewRunResultSchema.parse({ ...result, count: 1 })).toThrow();
		expect(() =>
			reviewRunResultSchema.parse({ ...result, payload: createFindingsReview([]) }),
		).toThrow();
	});
});

describe("GitHub and publication schemas", () => {
	test("preserves nullable GitHub file patches and normalizes consumed comment shapes", () => {
		expect(
			prChangedFileSchema.parse({ path: "image.png", status: "added", patch: null }).patch,
		).toBeNull();
		expect(
			prReviewCommentSchema.parse({ author: "github-actions[bot]", body: "<!-- marker -->" })
				.author,
		).toBe("github-actions[bot]");
		expect(
			prInlineCommentInputSchema.parse({ path: "src/app.ts", line: 4, body: "inline" }).line,
		).toBe(4);
		expect(prDiscussionCommentSchema.parse({ id: 123, body: "summary" }).id).toBe(123);
	});

	test("validates inline classification and posting status payloads", () => {
		const finding = reviewFindingSchema.parse({
			path: "src/app.ts",
			line: 3,
			severity: "info",
			summary: "Looks good",
			details: "A detail.",
		});

		expect(
			inlineClassificationResultSchema.parse({
				inlineable: [{ finding, target: { path: "src/app.ts", line: 3 } }],
				fallbackOnly: [{ finding: { ...finding, line: null }, reason: "missing_line" }],
			}).inlineable,
		).toHaveLength(1);
		expect(
			inlinePostingStatusSchema.parse({
				postedCount: 1,
				skippedDuplicateCount: 0,
				fallbackOnlyCount: 1,
				apiError: null,
			}).postedCount,
		).toBe(1);
		expect(
			postInlineFindingsResultSchema.parse({
				postedCount: 1,
				skippedDuplicateCount: 0,
				fallbackOnlyCount: 1,
				apiError: null,
				fallbackOnly: [],
			}).fallbackOnly,
		).toEqual([]);
	});
});
