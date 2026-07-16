import { z } from "zod";

export const severityValues = ["info", "warning", "error"] as const;
export const reviewInputOmissionReasonValues = [
	"file-exceeds-cap",
	"diff-budget-exhausted",
] as const;
export const inlineFallbackReasonValues = [
	"missing-path",
	"missing-line",
	"file-not-changed",
	"patch-unavailable",
	"line-not-in-diff",
] as const;
export const priorFindingResolutionStatusValues = ["resolved", "unresolved", "unknown"] as const;
export const inlinePostingOutcomeValues = [
	"posted",
	"skipped-duplicate",
	"fallback-only",
	"api-error",
] as const;
export const diffChangeKindValues = ["added", "modified", "deleted", "renamed", "copied"] as const;

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
		modelProfile: nonBlankStringSchema,
		applicability: reviewApplicabilitySchema,
		localOnly: z.boolean(),
	})
	.strict();
export type ReviewDefinition = z.infer<typeof reviewDefinitionSchema>;

export const diffFileSchema = z
	.object({
		path: z.string(),
		oldPath: z.string().nullable(),
		changeKind: z.enum(diffChangeKindValues),
		rawText: z.string(),
		isBinary: z.boolean(),
		addedLines: nonNegativeIntegerSchema,
		removedLines: nonNegativeIntegerSchema,
		hunkCount: nonNegativeIntegerSchema,
		byteSize: nonNegativeIntegerSchema,
		estimatedTokens: nonNegativeIntegerSchema,
	})
	.strict();
export type DiffFile = z.infer<typeof diffFileSchema>;
export type DiffChangeKind = DiffFile["changeKind"];

const localDiffFields = {
	diffText: z.string(),
	files: z.array(diffFileSchema),
	changedPaths: z.array(z.string()),
};

export const localDiffSchema = z.discriminatedUnion("sourceType", [
	z
		.object({
			sourceType: z.literal("base-ref"),
			baseRef: nonBlankStringSchema,
			...localDiffFields,
		})
		.strict(),
	z
		.object({
			sourceType: z.literal("revision-range"),
			baseRef: z.never().optional(),
			revisionRange: nonBlankStringSchema,
			...localDiffFields,
		})
		.strict(),
]);
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

export const reviewFindingsPayloadSchema = z
	.object({
		findings: z.array(reviewFindingSchema),
	})
	.strict();
export type ReviewFindingsPayload = z.infer<typeof reviewFindingsPayloadSchema>;

export const findingsReviewSchema = z
	.object({
		format: z.literal("findings"),
		findings: z.array(reviewFindingSchema),
		count: nonNegativeIntegerSchema,
	})
	.strict()
	.refine((value) => value.count === value.findings.length, {
		message: "count must equal findings length",
		path: ["count"],
	});
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

export const lastReviewedHeadStateSchema = z
	.object({
		headSha: nonBlankStringSchema,
		baseRef: nonBlankStringSchema,
		baseMergeBaseSha: nonBlankStringSchema,
	})
	.strict();
export type LastReviewedHeadState = z.infer<typeof lastReviewedHeadStateSchema>;

export const priorFindingsPromptContextSchema = z
	.object({
		prNumber: z.int().positive(),
		reviewName: nonBlankStringSchema,
		summaryCommentId: z.int().positive(),
		lastReviewedHead: lastReviewedHeadStateSchema.nullable(),
		cap: z.int().positive(),
		stampedFindingCount: nonNegativeIntegerSchema,
		omittedByContextCap: nonNegativeIntegerSchema,
		cumulativePrunedCount: nonNegativeIntegerSchema,
		findings: z.array(
			z
				.object({
					id: nonBlankStringSchema,
					finding: reviewFindingSchema,
					firstSeenHeadSha: nonBlankStringSchema.nullable(),
					lastSeenHeadSha: nonBlankStringSchema.nullable(),
					resolutionStatus: z.enum(priorFindingResolutionStatusValues),
					reviewThreadIds: z.array(nonBlankStringSchema),
					hasOutdatedReviewThread: z.boolean(),
				})
				.strict(),
		),
	})
	.strict();
export type PriorFindingsPromptContext = z.infer<typeof priorFindingsPromptContextSchema>;
export type PriorFindingsPromptContextEntry = PriorFindingsPromptContext["findings"][number];

export const reviewRunnerRequestSchema = z
	.object({
		model: nonBlankStringSchema,
		reviewDefinition: reviewDefinitionSchema,
		reviewDir: nonBlankStringSchema,
		target: diffReviewTargetSchema,
		priorFindingsContext: priorFindingsPromptContextSchema.optional(),
	})
	.strict();
export type ReviewRunnerRequest = z.infer<typeof reviewRunnerRequestSchema>;

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
		modelProfile: nonBlankStringSchema,
		model: nonBlankStringSchema,
		baseRef: nonBlankStringSchema,
		format: z.literal("findings"),
		count: nonNegativeIntegerSchema,
		findings: z.array(reviewFindingSchema),
		usage: reviewUsageSchema.nullable(),
		inputCoverage: reviewInputCoverageSchema.nullable(),
	})
	.strict()
	.refine((value) => value.count === value.findings.length, {
		message: "count must equal findings length",
		path: ["count"],
	});
export type ReviewRunResult = z.infer<typeof reviewRunResultSchema>;

export const reviewRosterSelectionEntrySchema = z
	.object({ reviewKey: nonBlankStringSchema, selected: z.boolean() })
	.strict();
export type ReviewRosterSelectionEntry = z.infer<typeof reviewRosterSelectionEntrySchema>;

export const reviewRosterRunRequestSchema = z
	.object({
		revisionRange: nonBlankStringSchema,
		roster: z.array(reviewRosterSelectionEntrySchema).min(1),
	})
	.strict();
export type ReviewRosterRunRequest = z.infer<typeof reviewRosterRunRequestSchema>;

export const sourceAttributedFindingSchema = reviewFindingSchema
	.extend({ reviewKey: nonBlankStringSchema, occurrence: nonNegativeIntegerSchema })
	.strict();
export type SourceAttributedFinding = z.infer<typeof sourceAttributedFindingSchema>;

const rosterEntryBase = { reviewKey: nonBlankStringSchema, position: nonNegativeIntegerSchema };
export const reviewRosterEntrySchema = z.discriminatedUnion("state", [
	z.object({ ...rosterEntryBase, state: z.literal("toggled-off") }).strict(),
	z
		.object({
			...rosterEntryBase,
			state: z.literal("completed"),
			modelProfile: nonBlankStringSchema,
			model: nonBlankStringSchema,
			findings: z.array(sourceAttributedFindingSchema),
			usage: reviewUsageSchema.nullable(),
			inputCoverage: reviewInputCoverageSchema.nullable(),
		})
		.strict(),
	z
		.object({
			...rosterEntryBase,
			state: z.literal("failed"),
			stage: z.enum(["definition", "model-resolution", "runner"]),
			error: z.object({ code: nonBlankStringSchema, message: nonBlankStringSchema }).strict(),
		})
		.strict(),
]);
export type ReviewRosterEntry = z.infer<typeof reviewRosterEntrySchema>;

export const reviewRosterProgressEventSchema = z.discriminatedUnion("type", [
	z
		.object({
			type: z.literal("review-started"),
			reviewKey: nonBlankStringSchema,
			position: nonNegativeIntegerSchema,
		})
		.strict(),
	z
		.object({
			type: z.literal("review-completed"),
			reviewKey: nonBlankStringSchema,
			position: nonNegativeIntegerSchema,
			findingCount: nonNegativeIntegerSchema,
			inputCoverage: reviewInputCoverageSchema.nullable(),
		})
		.strict(),
	z
		.object({
			type: z.literal("review-failed"),
			reviewKey: nonBlankStringSchema,
			position: nonNegativeIntegerSchema,
			stage: z.enum(["definition", "model-resolution", "runner"]),
			error: z.object({ code: nonBlankStringSchema, message: nonBlankStringSchema }).strict(),
		})
		.strict(),
]);
export type ReviewRosterProgressEvent = z.infer<typeof reviewRosterProgressEventSchema>;

export const reviewRosterRunResultSchema = z
	.object({
		revisionRange: nonBlankStringSchema,
		ranAt: z.iso.datetime(),
		entries: z.array(reviewRosterEntrySchema),
		findings: z.array(sourceAttributedFindingSchema),
	})
	.strict()
	.superRefine((value, context) => {
		const expected = value.entries.flatMap((entry) =>
			entry.state === "completed" ? entry.findings : [],
		);
		if (JSON.stringify(expected) !== JSON.stringify(value.findings)) {
			context.addIssue({
				code: "custom",
				message: "findings must equal completed entry findings",
				path: ["findings"],
			});
		}
	});
export type ReviewRosterRunResult = z.infer<typeof reviewRosterRunResultSchema>;

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

export function createLocalDiff(options: {
	readonly baseRef: string;
	readonly diffText: string;
	readonly files: readonly DiffFile[];
}): LocalDiff {
	const files = options.files.map((file) => ({ ...file }));
	return localDiffSchema.parse({
		sourceType: "base-ref",
		baseRef: options.baseRef,
		diffText: options.diffText,
		files,
		changedPaths: files.map((file) => file.path),
	});
}

export function createRevisionRangeLocalDiff(options: {
	readonly revisionRange: string;
	readonly diffText: string;
	readonly files: readonly DiffFile[];
}): LocalDiff {
	const files = options.files.map((file) => ({ ...file }));
	return localDiffSchema.parse({
		sourceType: "revision-range",
		revisionRange: options.revisionRange,
		diffText: options.diffText,
		files,
		changedPaths: files.map((file) => file.path),
	});
}

export function joinDiffFileRawText(files: readonly DiffFile[]): string {
	return files.map((file) => file.rawText).join("");
}

export function filterLocalDiffFiles(
	localDiff: LocalDiff,
	keepFile: (file: DiffFile) => boolean,
): LocalDiff {
	const files = localDiff.files.filter(keepFile);
	if (files.length === localDiff.files.length) return localDiff;
	const diffText = joinDiffFileRawText(files);
	return localDiff.sourceType === "base-ref"
		? createLocalDiff({ baseRef: localDiff.baseRef, diffText, files })
		: createRevisionRangeLocalDiff({ revisionRange: localDiff.revisionRange, diffText, files });
}

export function reviewUsageTotalInputTokens(usage: ReviewUsage): number {
	return usage.inputTokens + usage.cacheCreationInputTokens + usage.cacheReadInputTokens;
}
