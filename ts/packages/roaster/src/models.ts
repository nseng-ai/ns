import { z } from "zod";

import type { DiffFile } from "./diff-parsing.ts";

export const severityValues = ["info", "warning", "error"] as const;
export const reviewInputOmissionReasonValues = ["file_exceeds_cap", "diff_budget_exhausted"] as const;
export const prChangedFileStatusValues = ["added", "removed", "modified", "renamed", "copied", "changed", "unchanged"] as const;
export const inlineFallbackReasonValues = ["missing_path", "missing_line", "file_not_changed", "patch_unavailable", "line_not_in_diff"] as const;
export const inlinePostingOutcomeValues = ["posted", "skipped_duplicate", "fallback_only", "api_error"] as const;

const nonBlankStringSchema = z.string().trim().min(1);
const nonNegativeIntegerSchema = z.int().min(0);

export const reviewApplicabilitySchema = z
	.object({
		include: z.array(nonBlankStringSchema),
		exclude: z.array(nonBlankStringSchema),
	})
	.strict();
export type ReviewApplicability = z.infer<typeof reviewApplicabilitySchema>;

export const reviewDefinitionSchema = z
	.object({
		name: nonBlankStringSchema,
		description: nonBlankStringSchema,
		instructions: nonBlankStringSchema,
		defaultModel: nonBlankStringSchema.nullable(),
		applicability: reviewApplicabilitySchema,
	})
	.strict();
export type ReviewDefinition = z.infer<typeof reviewDefinitionSchema>;

export const diffFileSchema = z
	.object({
		path: z.string(),
		oldPath: z.string().nullable(),
		changeKind: z.enum(["added", "modified", "deleted", "renamed", "copied"]),
		rawText: z.string(),
		isBinary: z.boolean(),
		addedLines: nonNegativeIntegerSchema,
		removedLines: nonNegativeIntegerSchema,
		hunkCount: nonNegativeIntegerSchema,
		byteSize: nonNegativeIntegerSchema,
		estimatedTokens: nonNegativeIntegerSchema,
	})
	.strict();
export type DiffFileModel = z.infer<typeof diffFileSchema>;

export const localDiffSchema = z
	.object({
		baseRef: nonBlankStringSchema,
		diffText: z.string(),
		files: z.array(diffFileSchema),
		changedPaths: z.array(z.string()),
	})
	.strict();
export type LocalDiff = z.infer<typeof localDiffSchema>;

export const reviewFindingSchema = z
	.object({
		path: nonBlankStringSchema.nullable(),
		line: z.int().positive().nullable(),
		severity: z.enum(severityValues),
		summary: nonBlankStringSchema,
		details: nonBlankStringSchema,
	})
	.strict();
export type ReviewFinding = z.infer<typeof reviewFindingSchema>;

export const findingsReviewSchema = z
	.object({
		format: z.literal("findings"),
		findings: z.array(reviewFindingSchema),
		count: nonNegativeIntegerSchema,
	})
	.strict()
	.refine((value) => value.count === value.findings.length, { message: "count must equal findings length", path: ["count"] });
export type FindingsReview = z.infer<typeof findingsReviewSchema>;

export const reviewUsageSchema = z
	.object({
		inputTokens: nonNegativeIntegerSchema,
		outputTokens: nonNegativeIntegerSchema,
		cacheCreationInputTokens: nonNegativeIntegerSchema,
		cacheReadInputTokens: nonNegativeIntegerSchema,
		totalCostUsd: z.number().min(0),
		durationMs: nonNegativeIntegerSchema,
		numTurns: nonNegativeIntegerSchema,
	})
	.strict();
export type ReviewUsage = z.infer<typeof reviewUsageSchema>;

export const omittedReviewInputFileSchema = z
	.object({
		path: nonBlankStringSchema,
		changeKind: nonBlankStringSchema,
		byteSize: nonNegativeIntegerSchema,
		estimatedTokens: nonNegativeIntegerSchema,
		addedLines: nonNegativeIntegerSchema,
		removedLines: nonNegativeIntegerSchema,
		reason: z.enum(reviewInputOmissionReasonValues),
	})
	.strict();
export type OmittedReviewInputFile = z.infer<typeof omittedReviewInputFileSchema>;

export const diffReviewTargetSchema = z
	.object({
		localDiff: localDiffSchema,
	})
	.strict();
export type DiffReviewTarget = z.infer<typeof diffReviewTargetSchema>;

export const harnessReviewRequestSchema = z
	.object({
		model: nonBlankStringSchema,
		reviewDefinition: reviewDefinitionSchema,
		target: diffReviewTargetSchema,
	})
	.strict();
export type HarnessReviewRequest = z.infer<typeof harnessReviewRequestSchema>;

export const reviewInputCoverageSchema = z
	.object({
		fullDiffEstimatedTokens: nonNegativeIntegerSchema,
		promptDiffTokenCap: nonNegativeIntegerSchema,
		promptDiffFileTokenCap: nonNegativeIntegerSchema,
		changedPathCount: nonNegativeIntegerSchema,
		includedFileCount: nonNegativeIntegerSchema,
		omittedFileCount: nonNegativeIntegerSchema,
		omittedFiles: z.array(omittedReviewInputFileSchema),
	})
	.strict()
	.refine((value) => value.omittedFileCount === value.omittedFiles.length, {
		message: "omittedFileCount must equal omittedFiles length",
		path: ["omittedFileCount"],
	})
	.refine((value) => value.includedFileCount + value.omittedFileCount <= value.changedPathCount, {
		message: "included and omitted file counts cannot exceed changedPathCount",
		path: ["includedFileCount"],
	});
export type ReviewInputCoverage = z.infer<typeof reviewInputCoverageSchema>;

export const reviewExecutionResponseSchema = z
	.object({
		payload: findingsReviewSchema,
		usage: reviewUsageSchema.nullable(),
		inputCoverage: reviewInputCoverageSchema.nullable(),
	})
	.strict();
export type ReviewExecutionResponse = z.infer<typeof reviewExecutionResponseSchema>;

export const reviewRunResultSchema = z
	.object({
		reviewName: nonBlankStringSchema,
		reviewPath: nonBlankStringSchema,
		model: nonBlankStringSchema,
		baseRef: nonBlankStringSchema,
		format: z.literal("findings"),
		count: nonNegativeIntegerSchema,
		findings: z.array(reviewFindingSchema),
		usage: reviewUsageSchema.nullable(),
		inputCoverage: reviewInputCoverageSchema.nullable(),
	})
	.strict()
	.refine((value) => value.count === value.findings.length, { message: "count must equal findings length", path: ["count"] });
export type ReviewRunResult = z.infer<typeof reviewRunResultSchema>;

export const prChangedFileSchema = z
	.object({
		path: nonBlankStringSchema,
		status: z.enum(prChangedFileStatusValues).or(nonBlankStringSchema),
		patch: z.string().nullable(),
	})
	.strict();
export type PRChangedFile = z.infer<typeof prChangedFileSchema>;

export const prReviewCommentSchema = z
	.object({
		author: nonBlankStringSchema,
		body: z.string(),
	})
	.strict();
export type PRReviewComment = z.infer<typeof prReviewCommentSchema>;

export const prInlineCommentInputSchema = z
	.object({
		path: nonBlankStringSchema,
		line: z.int().positive(),
		body: nonBlankStringSchema,
	})
	.strict();
export type PRInlineCommentInput = z.infer<typeof prInlineCommentInputSchema>;

export const prDiscussionCommentSchema = z
	.object({
		id: z.int().positive(),
		body: z.string(),
	})
	.strict();
export type PRDiscussionComment = z.infer<typeof prDiscussionCommentSchema>;

export const inlineTargetSchema = z
	.object({
		path: nonBlankStringSchema,
		line: z.int().positive(),
	})
	.strict();
export type InlineTarget = z.infer<typeof inlineTargetSchema>;

export const inlineableFindingSchema = z
	.object({
		finding: reviewFindingSchema,
		target: inlineTargetSchema,
	})
	.strict();
export type InlineableFinding = z.infer<typeof inlineableFindingSchema>;

export const fallbackOnlyFindingSchema = z
	.object({
		finding: reviewFindingSchema,
		reason: z.enum(inlineFallbackReasonValues),
	})
	.strict();
export type FallbackOnlyFinding = z.infer<typeof fallbackOnlyFindingSchema>;

export const inlineClassificationResultSchema = z
	.object({
		inlineable: z.array(inlineableFindingSchema),
		fallbackOnly: z.array(fallbackOnlyFindingSchema),
	})
	.strict();
export type InlineClassificationResult = z.infer<typeof inlineClassificationResultSchema>;

export const inlinePostingStatusSchema = z
	.object({
		postedCount: nonNegativeIntegerSchema,
		skippedDuplicateCount: nonNegativeIntegerSchema,
		fallbackOnlyCount: nonNegativeIntegerSchema,
		apiError: z.string().nullable(),
	})
	.strict();
export type InlinePostingStatus = z.infer<typeof inlinePostingStatusSchema>;

export const inlinePostingEventSchema = z
	.object({
		outcome: z.enum(inlinePostingOutcomeValues),
		finding: reviewFindingSchema.optional(),
		reason: z.enum(inlineFallbackReasonValues).optional(),
		message: z.string().optional(),
	})
	.strict();
export type InlinePostingEvent = z.infer<typeof inlinePostingEventSchema>;

export const postInlineFindingsResultSchema = inlinePostingStatusSchema
	.extend({
		fallbackOnly: z.array(fallbackOnlyFindingSchema),
	})
	.strict();
export type PostInlineFindingsResult = z.infer<typeof postInlineFindingsResultSchema>;

export function createFindingsReview(findings: readonly ReviewFinding[]): FindingsReview {
	const review = { format: "findings" as const, findings: [...findings], count: findings.length };
	return findingsReviewSchema.parse(review);
}

export function createLocalDiff(options: { readonly baseRef: string; readonly diffText: string; readonly files: readonly DiffFile[] }): LocalDiff {
	const files = options.files.map((file) => ({ ...file }));
	return localDiffSchema.parse({
		baseRef: options.baseRef,
		diffText: options.diffText,
		files,
		changedPaths: files.map((file) => file.path),
	});
}

export function reviewUsageTotalInputTokens(usage: ReviewUsage): number {
	return usage.inputTokens + usage.cacheCreationInputTokens + usage.cacheReadInputTokens;
}
