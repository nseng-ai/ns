import { describe, expect, test } from "vitest";

import {
	createFindingsReview,
	createLocalDiff,
	diffChangeKindValues,
	diffFileSchema,
	filterLocalDiffFiles,
	findingsReviewSchema,
	reviewRunnerRequestSchema,
	inlineClassificationResultSchema,
	inlinePostingStatusSchema,
	localDiffSchema,
	postInlineFindingsResultSchema,
	reviewDefinitionSchema,
	reviewFindingSchema,
	reviewExecutionResponseSchema,
	reviewInputCoverageSchema,
	reviewRunResultSchema,
	reviewUsageSchema,
	reviewUsageTotalInputTokens,
	type DiffFile,
} from "../../src/core/models.ts";

function diffFile(path: string, rawText: string): DiffFile {
	return {
		path,
		oldPath: null,
		changeKind: "modified",
		rawText,
		isBinary: false,
		addedLines: 1,
		removedLines: 0,
		hunkCount: 1,
		byteSize: rawText.length,
		estimatedTokens: 1,
	};
}

describe("reviews domain schemas", () => {
	test("accepts representative review definitions and findings payloads", () => {
		const definition = reviewDefinitionSchema.parse({
			name: "typescript-style",
			description: "Review TypeScript diffs.",
			instructions: "Flag concrete issues.",
			modelProfile: "fast",
			applicability: { include: ["**/*.ts"], exclude: [] },
			localOnly: false,
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

	test("defines canonical diff file schema and change kinds", () => {
		expect(diffChangeKindValues).toEqual(["added", "modified", "deleted", "renamed", "copied"]);
		expect(
			diffFileSchema.parse({
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
			}),
		).toMatchObject({ path: "src/app.ts", changeKind: "modified" });
		expect(() =>
			diffFileSchema.parse({
				path: "src/app.ts",
				oldPath: null,
				changeKind: "changed",
				rawText: "raw",
				isBinary: false,
				addedLines: 1,
				removedLines: 0,
				hunkCount: 1,
				byteSize: 3,
				estimatedTokens: 1,
			}),
		).toThrow();
	});

	test("filters local diff files with one shared reconstruction path", () => {
		const firstFile = diffFile(
			"src/first.ts",
			"diff --git a/src/first.ts b/src/first.ts\n+first\n",
		);
		const secondFile = diffFile(
			"docs/second.md",
			"diff --git a/docs/second.md b/docs/second.md\n+second\n",
		);
		const localDiff = createLocalDiff({
			baseRef: "main",
			diffText: [firstFile.rawText, secondFile.rawText].join(""),
			files: [firstFile, secondFile],
		});

		const filtered = filterLocalDiffFiles(localDiff, (file) => file.path.endsWith(".ts"));

		expect(filtered.changedPaths).toEqual(["src/first.ts"]);
		expect(filtered.diffText).toBe(firstFile.rawText);
		expect(filterLocalDiffFiles(localDiff, () => true)).toBe(localDiff);
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
					reason: "file-exceeds-cap",
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
			modelProfile: "fast",
			applicability: { include: ["**/*.ts"], exclude: [] },
			localOnly: false,
		});
		const request = reviewRunnerRequestSchema.parse({
			modelSelection: { provider: "openai", modelId: "gpt-5.6-luna", thinking: "high" },
			reviewDefinition,
			reviewDir: "/repo/.ns/reviews/typescript-style",
			target: { localDiff },
			priorFindingsContext: {
				prNumber: 123,
				reviewName: "typescript-style",
				summaryCommentId: 456,
				lastReviewedHead: {
					headSha: "head-abc",
					baseRef: "main",
					baseMergeBaseSha: "merge-base-def",
				},
				cap: 10,
				stampedFindingCount: 1,
				omittedByContextCap: 0,
				cumulativePrunedCount: 0,
				findings: [
					{
						id: "finding-1",
						finding: {
							path: "src/app.ts",
							line: 1,
							severity: "warning",
							summary: "Use a narrower type.",
							details: "The prior review already surfaced this.",
						},
						firstSeenHeadSha: "old-head",
						lastSeenHeadSha: "head-abc",
						resolutionStatus: "unresolved",
						reviewThreadIds: ["thread-1"],
						hasOutdatedReviewThread: false,
					},
				],
			},
		});
		const response = reviewExecutionResponseSchema.parse({
			payload: createFindingsReview([]),
			usage: null,
			inputCoverage: null,
		});

		expect(request.modelSelection.thinking).toBe("high");
		expect(request.target.localDiff.baseRef).toBe("main");
		expect(request.priorFindingsContext?.findings[0]?.resolutionStatus).toBe("unresolved");
		expect(() =>
			reviewRunnerRequestSchema.parse({
				...request,
				modelSelection: { provider: "openai", modelId: "gpt-5.6-luna" },
			}),
		).toThrow();
		expect(response.payload.count).toBe(0);
	});

	test("validates review run result contract", () => {
		const result = reviewRunResultSchema.parse({
			reviewName: "typescript-style",
			reviewPath: ".ns/reviews/typescript-style/review.md",
			modelProfile: "fast",
			model: "openai/gpt-5.6-luna",
			baseRef: "main",
			format: "findings",
			count: 0,
			findings: [],
			usage: null,
			inputCoverage: null,
		});

		expect(result.modelProfile).toBe("fast");
		expect(result.count).toBe(0);
		expect(() => reviewRunResultSchema.parse({ ...result, count: 1 })).toThrow();
		expect(() =>
			reviewRunResultSchema.parse({ ...result, payload: createFindingsReview([]) }),
		).toThrow();
	});
});

describe("GitHub and publication schemas", () => {
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
				fallbackOnly: [{ finding: { ...finding, line: null }, reason: "missing-line" }],
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
