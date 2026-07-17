import { failure, ok, negative, type ClinkrExit } from "@nseng-ai/clinkr";
import { parseJsonInputText, type JsonInputError } from "@nseng-ai/capability-kit/json-input";
import { optionalEntries, optionalEntry } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import { catalogOptions, environmentOptions, type ReviewsRuntime } from "../core/context.ts";
import {
	isReviewLogFailure,
	type ReviewLogFailure,
	type ReviewFailure,
	type ReviewResult,
} from "../core/failures.ts";
import {
	publishFindings,
	type LastReviewedHeadState,
	type PublicationError,
	type PublishFindingsResult,
} from "../core/findings-publication.ts";
import { gatherPriorFindingsContext } from "../core/prior-findings-context.ts";
import {
	REVIEW_LOG_NAMESPACE,
	type ReviewLogEntry,
	type ReviewLogWriteResult,
} from "../gateways/review-log.ts";
import {
	postInlineFindingsResultSchema,
	priorFindingsPromptContextSchema,
	reviewFindingsPayloadSchema,
	reviewRunResultSchema,
	reviewUsageTotalInputTokens,
	type PriorFindingsPromptContext,
	type ReviewDefinition,
	type ReviewFindingsPayload,
	type ReviewRunResult,
} from "../core/models.ts";
import { applicableReviewKeys } from "../core/review-applicability.ts";
import { reviewDisplayRole, reviewRoleLabel } from "../core/review-display.ts";
import { loadParsedReviewDefinition } from "../core/review-definition-loading.ts";
import { reviewSkillEntryFromDefinition } from "../core/skill-reviews.ts";
import { loadReviewExecutionContext, runReview, writeReviewRunLog } from "./review-run.ts";

const nonBlankStringSchema = z.string().trim().min(1);
const DEFAULT_PRIOR_FINDINGS_CONTEXT_FINDING_COUNT = 50;

export const reviewListRequestSchema = z.object({
	applicable: z
		.boolean()
		.default(false)
		.describe("Only list reviews applicable to the current diff."),
	ci: z.boolean().default(false).describe("Only list reviews enabled for CI automation."),
	baseRef: z.string().optional().describe("Base ref used when filtering applicable reviews."),
});

export const reviewSkillMetadataSchema = z.object({
	surface: nonBlankStringSchema,
	label: nonBlankStringSchema,
});

export const reviewMetadataSchema = z.object({
	key: nonBlankStringSchema,
	description: nonBlankStringSchema,
	modelProfile: nonBlankStringSchema,
	localOnly: z.boolean(),
	reviewSkill: reviewSkillMetadataSchema,
});

export const reviewListResultSchema = z.object({
	reviewsDir: nonBlankStringSchema,
	keys: z.array(nonBlankStringSchema),
	count: z.int().min(0),
	reviews: z.array(reviewMetadataSchema),
});

export type ReviewListRequest = z.infer<typeof reviewListRequestSchema>;
export type ReviewListResult = z.infer<typeof reviewListResultSchema>;

export const reviewRunRequestSchema = z.object({
	key: nonBlankStringSchema.describe("Review key to run."),
	model: z.string().optional().describe("Qualified provider/model reference override."),
	modelProfile: z.string().optional().describe("Configured [models.profiles] alias override."),
	baseRef: z.string().optional().describe("Base ref for the local diff."),
	logBranch: nonBlankStringSchema
		.optional()
		.describe("Branch Memory branch for the review log. Defaults to the current branch."),
	priorFindingsPrNumber: z
		.int()
		.positive()
		.optional()
		.describe("Opt in to PR prior-findings context gathering for this pull request."),
	priorFindingsCap: z
		.int()
		.positive()
		.optional()
		.describe("Maximum prior findings to include when PR context gathering is enabled."),
});

export type ReviewRunRequest = z.infer<typeof reviewRunRequestSchema>;

export const reviewLogRequestSchema = z.object({
	key: z.string().optional().describe("Review key filter."),
});

export const reviewLogEntrySchema = z.object({
	entryKey: nonBlankStringSchema,
	branch: nonBlankStringSchema,
	entryLocator: nonBlankStringSchema,
	reviewKey: nonBlankStringSchema.nullable(),
	ranAt: nonBlankStringSchema.nullable(),
});

export const reviewLogResultSchema = z.object({
	namespace: nonBlankStringSchema,
	reviewKey: nonBlankStringSchema.nullable(),
	count: z.int().min(0),
	entries: z.array(reviewLogEntrySchema),
});

export type ReviewLogRequest = z.infer<typeof reviewLogRequestSchema>;
export type ReviewLogResult = z.infer<typeof reviewLogResultSchema>;

export const publishFindingsRequestSchema = z.object({
	prNumber: z.int().positive().describe("Pull request number."),
	runUrl: z.string().optional().describe("GitHub Actions run URL to include in the activity log."),
	reviewName: z.string().optional().describe("Fallback review key for failed run envelopes."),
	baseRef: z.string().optional().describe("Fallback base ref for failed run envelopes."),
	reviewedHeadSha: z
		.string()
		.optional()
		.describe("PR head commit SHA reviewed by this publish, for Last-reviewed stamping."),
	reviewedBaseMergeBaseSha: z
		.string()
		.optional()
		.describe("Merge-base SHA for the reviewed base ref and PR head."),
});

export const publishFindingsResultSchema = z
	.object({
		inlineStatus: postInlineFindingsResultSchema,
		summaryStatus: z
			.object({
				type: z.enum(["posted", "updated"]),
				marker: z.string(),
			})
			.strict(),
	})
	.strict();

export type PublishFindingsRequest = z.infer<typeof publishFindingsRequestSchema>;
export type PublishFindingsCliResult = z.infer<typeof publishFindingsResultSchema>;
export type PublishFindingsCommandResult = PublishFindingsCliResult;

export const recordFindingsRequestSchema = z.object({
	reviewKey: nonBlankStringSchema.describe("Review key that produced the findings."),
	baseRef: z.string().optional().describe("Base ref for the local diff."),
	model: nonBlankStringSchema
		.optional()
		.describe("Model label to record for same-session findings."),
});

export type RecordFindingsRequest = z.infer<typeof recordFindingsRequestSchema>;

export type RecordFindingsOutcome =
	| {
			readonly type: "recorded";
			readonly result: ReviewRunResult;
			readonly logEntry: ReviewLogWriteResult;
	  }
	| {
			readonly type: "recorded_log_failed";
			readonly result: ReviewRunResult;
			readonly error: ReviewLogFailure;
	  }
	| { readonly type: "failed"; readonly error: ReviewFailure };

export async function buildReviewListResult(
	ctx: ReviewsRuntime,
	request: ReviewListRequest,
): Promise<ReviewResult<ReviewListResult>> {
	const catalog = await ctx.reviewCatalog.listReviewKeys(catalogOptions(ctx.runScope));
	if (!catalog.ok) return catalog;

	const loaded = await loadDefinitions(ctx, catalog.value.keys);
	if (!loaded.ok) return loaded;

	let selectedKeys = catalog.value.keys;
	if (request.ci) {
		selectedKeys = selectedKeys.filter((key) =>
			loaded.value.some((item) => item.key === key && !item.definition.localOnly),
		);
	}
	if (request.applicable) {
		const diff = await loadDiffFromRequest(ctx, request.baseRef);
		if (!diff.ok) return diff;
		const selectedBeforeApplicability = new Set(selectedKeys);
		selectedKeys = applicableReviewKeys(
			new Map(
				loaded.value
					.filter((item) => selectedBeforeApplicability.has(item.key))
					.map((item) => [item.key, item.definition]),
			),
			{ changedPaths: diff.value.changedPaths },
		);
	}

	const selected = new Set(selectedKeys);
	const reviews = loaded.value
		.filter((item) => selected.has(item.key))
		.map((item) => {
			const skillEntry = reviewSkillEntryFromDefinition(item.key, item.definition);
			return {
				key: item.key,
				description: item.definition.description,
				modelProfile: item.definition.modelProfile,
				localOnly: item.definition.localOnly,
				reviewSkill: skillEntry,
			};
		});
	return {
		ok: true,
		value: reviewListResultSchema.parse({
			reviewsDir: catalog.value.reviewsDir,
			keys: selectedKeys,
			count: selectedKeys.length,
			reviews,
		}),
	};
}

export async function runReviewList(
	ctx: ReviewsRuntime,
	request: ReviewListRequest,
): Promise<ClinkrExit<ReviewListResult>> {
	return clinkrExitFromReviewResult(await buildReviewListResult(ctx, request));
}

export function renderReviewList(result: ReviewListResult): string {
	const lines = [`Reviews directory: ${result.reviewsDir}`, `Reviews: ${result.count}`];
	const tripwires = result.reviews.filter(
		(review) => reviewDisplayRole(review.modelProfile) === "tripwire",
	);
	const deepReviews = result.reviews.filter(
		(review) => reviewDisplayRole(review.modelProfile) === "deep_review",
	);
	if (tripwires.length > 0) {
		lines.push(`Tripwires: ${tripwires.length}`);
		lines.push(...tripwires.map(renderReviewListEntry));
	}
	if (deepReviews.length > 0) {
		lines.push(`Deep reviews: ${deepReviews.length}`);
		lines.push(...deepReviews.map(renderReviewListEntry));
	}
	return lines.join("\n");
}

export async function runReviewByKey(
	ctx: ReviewsRuntime,
	request: ReviewRunRequest,
): Promise<ClinkrExit<ReviewRunResult>> {
	const priorFindingsContext = await loadPriorFindingsPromptContext(ctx, request);
	return clinkrExitFromReviewRunOutcome(
		ctx,
		await runReview(ctx, {
			key: request.key,
			...optionalEntries({
				model: request.model,
				modelProfile: request.modelProfile,
				baseRef: request.baseRef,
				logBranch: request.logBranch,
				priorFindingsContext,
			}),
		}),
	);
}

async function loadPriorFindingsPromptContext(
	ctx: ReviewsRuntime,
	request: ReviewRunRequest,
): Promise<PriorFindingsPromptContext | undefined> {
	if (request.priorFindingsPrNumber === undefined) return undefined;
	const priorFindingsCap = request.priorFindingsCap ?? DEFAULT_PRIOR_FINDINGS_CONTEXT_FINDING_COUNT;

	const result = await gatherPriorFindingsContext(ctx.github, {
		...environmentOptions(ctx.runScope),
		prNumber: request.priorFindingsPrNumber,
		reviewName: request.key,
		cap: priorFindingsCap,
	});
	if (result.type === "without-context") {
		ctx.stderr(`prior-findings context: ${result.message} Continuing with context-free review.\n`);
		return undefined;
	}

	ctx.stderr(
		`prior-findings context: loaded ${result.context.findings.length} findings for PR #${result.context.prNumber} review ${result.context.reviewName}.\n`,
	);
	return priorFindingsPromptContextSchema.parse(result.context);
}

export function clinkrExitFromReviewRunOutcome(
	ctx: Pick<ReviewsRuntime, "stderr">,
	outcome: Awaited<ReturnType<typeof runReview>>,
): ClinkrExit<ReviewRunResult> {
	if (outcome.type === "failed") return failureFromReview(outcome.error);
	ctx.stderr(
		`resolved model=${outcome.progress.model} model_profile=${outcome.progress.modelProfile} base_ref=${outcome.progress.baseRef} changed_paths=${outcome.progress.changedPathCount}\n`,
	);
	if (outcome.type === "completed_log_failed") {
		return negative(
			`${renderReviewRun(outcome.result)}\n\nreviews: failed to write Branch Memory review log:\n${outcome.error.message}`,
			{ data: outcome.result },
		);
	}
	return ok(outcome.result);
}

export function renderReviewRun(result: ReviewRunResult): string {
	const lines = [
		`${reviewRoleLabel(result.modelProfile)}: ${result.reviewName}`,
		`Model: ${result.model}`,
		`Base ref: ${result.baseRef}`,
		`Findings: ${result.count}`,
	];
	for (const finding of result.findings) {
		lines.push(
			`[${finding.severity}] ${finding.path ?? "unknown"}:${finding.line ?? "—"} ${finding.summary}`,
		);
	}
	if (result.usage !== null) {
		lines.push(
			`Tokens: ${reviewUsageTotalInputTokens(result.usage)} in / ${result.usage.outputTokens} out`,
		);
		lines.push(`Cost: $${result.usage.totalCostUsd.toFixed(4)} USD`);
		lines.push(
			`Duration: ${(result.usage.durationMs / 1000).toFixed(1)}s (${result.usage.numTurns} turns)`,
		);
	}
	return lines.join("\n");
}

export async function runRecordFindings(
	ctx: ReviewsRuntime,
	request: RecordFindingsRequest,
): Promise<ClinkrExit<ReviewRunResult>> {
	return clinkrExitFromRecordFindingsOutcome(ctx, await recordSameSessionFindings(ctx, request));
}

export async function recordSameSessionFindings(
	ctx: ReviewsRuntime,
	request: RecordFindingsRequest,
): Promise<RecordFindingsOutcome> {
	const payload = await readFindingsPayload(ctx);
	if (!payload.ok) return { type: "failed", error: payload.error };

	const loaded = await loadReviewExecutionContext(ctx, {
		reviewKey: request.reviewKey,
		...optionalEntry("baseRef", request.baseRef),
	});
	if (!loaded.ok) return { type: "failed", error: loaded.error };
	const { source, definition, diff } = loaded.value;

	const result = reviewRunResultSchema.parse({
		reviewName: source.key,
		reviewPath: source.path,
		modelProfile: definition.modelProfile,
		model: request.model ?? "same-session",
		baseRef: diff.baseRef,
		format: "findings",
		count: payload.value.findings.length,
		findings: payload.value.findings,
		usage: null,
		inputCoverage: null,
	});

	const logResult = await writeReviewRunLog(ctx, { reviewKey: source.key, result });
	if (!logResult.ok) {
		if (!isReviewLogFailure(logResult.error)) return { type: "failed", error: logResult.error };
		return { type: "recorded_log_failed", result, error: logResult.error };
	}

	return { type: "recorded", result, logEntry: logResult.value };
}

export function clinkrExitFromRecordFindingsOutcome(
	ctx: Pick<ReviewsRuntime, "stderr">,
	outcome: RecordFindingsOutcome,
): ClinkrExit<ReviewRunResult> {
	if (outcome.type === "failed") return failureFromReview(outcome.error);
	if (outcome.type === "recorded_log_failed") {
		return negative(
			`${renderReviewRun(outcome.result)}\n\nreviews: failed to write Branch Memory review log:\n${outcome.error.message}`,
			{ data: outcome.result },
		);
	}
	ctx.stderr(`recorded review log: ${outcome.logEntry.key}\n`);
	return ok(outcome.result);
}

async function readFindingsPayload(
	ctx: ReviewsRuntime,
): Promise<ReviewResult<ReviewFindingsPayload>> {
	const result = parseJsonInputText({
		text: await ctx.stdin(),
		schema: reviewFindingsPayloadSchema,
		jsonDescription: "record-findings stdin",
		schemaDescription: "record-findings stdin { findings: [...] }",
	});
	if (result.type === "ok") return { ok: true, value: result.value };
	return {
		ok: false,
		error: {
			code: reviewRunnerFailureTypeFromJsonInputError(result.error),
			message: result.error.message,
		},
	};
}

function reviewRunnerFailureTypeFromJsonInputError(
	error: JsonInputError,
): "review-execution-invalid-json" | "review-execution-invalid-findings" {
	return error.errorType === "invalid-json"
		? "review-execution-invalid-json"
		: "review-execution-invalid-findings";
}

export async function buildReviewLogResult(
	ctx: ReviewsRuntime,
	request: ReviewLogRequest,
): Promise<ReviewResult<ReviewLogResult>> {
	const entries = await ctx.reviewLog.listReviewLogs({
		...environmentOptions(ctx.runScope),
		...optionalEntry("reviewKey", request.key),
	});
	if (!entries.ok) return entries;
	return {
		ok: true,
		value: reviewLogResultSchema.parse({
			namespace: REVIEW_LOG_NAMESPACE,
			reviewKey: request.key ?? null,
			count: entries.value.length,
			entries: entries.value.map(reviewLogEntryResult),
		}),
	};
}

export async function runReviewLog(
	ctx: ReviewsRuntime,
	request: ReviewLogRequest,
): Promise<ClinkrExit<ReviewLogResult>> {
	return clinkrExitFromReviewResult(await buildReviewLogResult(ctx, request));
}

export function renderReviewLog(result: ReviewLogResult): string {
	if (result.count === 0) {
		return result.reviewKey === null
			? "No review logs found for this branch."
			: `No review logs found for review key ${result.reviewKey} on this branch.`;
	}
	const lines = [`Review logs: ${result.count}`];
	for (const entry of result.entries) {
		lines.push(
			`- ${entry.ranAt ?? "unknown time"}  ${entry.reviewKey ?? "unknown review"}  ${entry.entryKey}`,
			`  git show ${entry.entryLocator}`,
			`  brmem get ${entry.entryKey} --namespace ${result.namespace}`,
		);
	}
	return lines.join("\n");
}

export async function runPublishFindings(
	ctx: ReviewsRuntime,
	request: PublishFindingsRequest,
): Promise<number> {
	const result = await publishFindingsFromRequest(ctx, request);
	if (!result.ok) return stderrFailure(ctx, `publish-findings: ${result.error.message}\n`);

	ctx.stderr(renderPublishFindingsDiagnostics(result.value));
	return 0;
}

export async function runPublishFindingsCommand(
	ctx: ReviewsRuntime,
	request: PublishFindingsRequest,
): Promise<ClinkrExit<PublishFindingsCommandResult>> {
	return clinkrExitFromPublishFindingsResult(ctx, await publishFindingsFromRequest(ctx, request));
}

export function clinkrExitFromPublishFindingsResult(
	ctx: Pick<ReviewsRuntime, "stderr">,
	result: PublishFindingsResult,
): ClinkrExit<PublishFindingsCommandResult> {
	if (!result.ok) return failureFromPublicationError(result.error);

	ctx.stderr(renderPublishFindingsDiagnostics(result.value));
	return ok(publishFindingsResultSchema.parse(result.value));
}

export function renderPublishFindingsResult(result: PublishFindingsCommandResult): string {
	return [
		`${result.summaryStatus.type} findings comment`,
		renderInlineFindingsSummary(result),
	].join("\n");
}

export async function publishFindingsFromRequest(
	ctx: ReviewsRuntime,
	request: PublishFindingsRequest,
): Promise<PublishFindingsResult> {
	const envelope = await ctx.stdin();
	return await publishFindings(ctx, {
		prNumber: request.prNumber,
		envelope,
		...optionalEntries({
			runUrl: request.runUrl,
			fallbackReviewName: request.reviewName,
			fallbackBaseRef: request.baseRef,
		}),
		...lastReviewedHeadOptions(request),
	});
}

interface LoadedDefinition {
	readonly key: string;
	readonly definition: ReviewDefinition;
}

async function loadDefinitions(
	ctx: ReviewsRuntime,
	keys: readonly string[],
): Promise<ReviewResult<readonly LoadedDefinition[]>> {
	const loaded: LoadedDefinition[] = [];
	for (const key of keys) {
		const parsed = await loadParsedReviewDefinition({
			...catalogOptions(ctx.runScope),
			reviewCatalog: ctx.reviewCatalog,
			key,
		});
		if (!parsed.ok) return parsed;
		loaded.push({ key: parsed.value.source.key, definition: parsed.value.definition });
	}
	return { ok: true, value: loaded };
}

function renderReviewListEntry(review: ReviewListResult["reviews"][number]): string {
	const model = ` (model profile: ${review.modelProfile})`;
	const scope = review.localOnly ? " [local-only]" : "";
	const skill = ` [${review.reviewSkill.surface} — ${review.reviewSkill.label}]`;
	return `- ${review.key}: ${review.description}${model}${scope}${skill}`;
}

function reviewLogEntryResult(entry: ReviewLogEntry): ReviewLogResult["entries"][number] {
	return {
		entryKey: entry.key,
		branch: entry.branch,
		entryLocator: entry.entryLocator,
		reviewKey: entry.reviewKey,
		ranAt: entry.ranAt,
	};
}

function failureFromReview(error: ReviewFailure): ClinkrExit<never> {
	return failure(error.code, error.message);
}

function failureFromPublicationError(error: PublicationError): ClinkrExit<never> {
	return failure("reviews-publish-findings-failed", `publish-findings: ${error.message}`, {
		fatalFailurePhase: error.fatalFailurePhase,
		reason: error.reason,
	});
}

function clinkrExitFromReviewResult<T>(result: ReviewResult<T>): ClinkrExit<T> {
	if (result.ok) return ok(result.value);
	return failureFromReview(result.error);
}

function loadDiffFromRequest(
	ctx: ReviewsRuntime,
	baseRef: string | undefined,
): ReturnType<ReviewsRuntime["localDiff"]["loadDiff"]> {
	return ctx.localDiff.loadDiff({
		...environmentOptions(ctx.runScope),
		...optionalEntry("baseRef", baseRef),
	});
}

function lastReviewedHeadOptions(request: PublishFindingsRequest): {
	readonly lastReviewedHead?: LastReviewedHeadState;
} {
	if (request.reviewedHeadSha === undefined || request.reviewedBaseMergeBaseSha === undefined)
		return {};
	const baseRef = request.baseRef?.trim();
	if (baseRef === undefined || baseRef === "") return {};
	return {
		lastReviewedHead: {
			headSha: request.reviewedHeadSha,
			baseRef,
			baseMergeBaseSha: request.reviewedBaseMergeBaseSha,
		},
	};
}

function renderPublishFindingsDiagnostics(
	result: Extract<PublishFindingsResult, { readonly ok: true }>["value"],
): string {
	return [
		renderInlineFindingsSummary(result),
		`${result.summaryStatus.type} findings comment`,
		"",
	].join("\n");
}

function renderInlineFindingsSummary(result: PublishFindingsCommandResult): string {
	const apiError = result.inlineStatus.apiError?.replace(/\s+/gu, " ") ?? "none";
	return `inline findings: posted=${result.inlineStatus.postedCount} skipped_duplicate=${result.inlineStatus.skippedDuplicateCount} fallback_only=${result.inlineStatus.fallbackOnlyCount} api_error=${apiError}`;
}

function stderrFailure(ctx: ReviewsRuntime, message: string): number {
	ctx.stderr(message);
	return 1;
}
