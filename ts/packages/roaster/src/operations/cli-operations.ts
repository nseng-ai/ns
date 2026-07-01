import { failure, ok, negative, type ClinkrExit } from "@sdl/clinkr";
import { formatErrorMessage, optionalEntries, optionalEntry } from "@sdl/core/primitives";
import { z } from "zod";

import { catalogOptions, environmentOptions, type RoasterRuntime } from "../context.ts";
import {
	isReviewLogFailure,
	type ReviewLogFailure,
	type RoasterFailure,
	type RoasterResult,
} from "../failures.ts";
import {
	publishFindings,
	type PublicationError,
	type PublishFindingsResult,
} from "../findings-publication.ts";
import {
	ROASTER_REVIEW_LOG_NAMESPACE,
	type ReviewLogEntry,
	type ReviewLogWriteResult,
} from "../gateways/review-log.ts";
import {
	postInlineFindingsResultSchema,
	reviewFindingsPayloadSchema,
	reviewRunResultSchema,
	type ReviewDefinition,
	type ReviewFindingsPayload,
	type ReviewRunResult,
	type ReviewUsage,
} from "../models.ts";
import { applicableReviewKeys } from "../review-applicability.ts";
import { roasterReviewDisplayRole, roasterReviewRoleLabel } from "../review-display.ts";
import { loadParsedReviewDefinition } from "../review-definition-loading.ts";
import { loadRoastSkillEntries, roastReviewPathForKey } from "../skill-reviews.ts";
import { loadReviewExecutionContext, runRoasterReview, writeReviewRunLog } from "./review-run.ts";

const nonBlankStringSchema = z.string().trim().min(1);

export const reviewListRequestSchema = z.object({
	applicable: z
		.boolean()
		.default(false)
		.describe("Only list reviews applicable to the current diff."),
	ci: z.boolean().default(false).describe("Only list reviews enabled for CI automation."),
	baseRef: z.string().optional().describe("Base ref used when filtering applicable reviews."),
});

export const reviewMetadataSchema = z.object({
	key: nonBlankStringSchema,
	description: nonBlankStringSchema,
	modelProfile: nonBlankStringSchema,
	localOnly: z.boolean(),
});

export const reviewListResultSchema = z.object({
	reviewsDir: nonBlankStringSchema,
	keys: z.array(nonBlankStringSchema),
	count: z.int().min(0),
	reviews: z.array(reviewMetadataSchema),
});

export type ReviewListRequest = z.infer<typeof reviewListRequestSchema>;
export type ReviewListResult = z.infer<typeof reviewListResultSchema>;

export const roastSkillMetadataSchema = z.object({
	surface: nonBlankStringSchema,
	label: nonBlankStringSchema,
	reviewKey: nonBlankStringSchema,
	reviewPath: nonBlankStringSchema,
	title: nonBlankStringSchema,
	description: nonBlankStringSchema,
	defaultPrompt: nonBlankStringSchema,
});

export const roastSkillListRequestSchema = z.object({});

export const roastSkillListResultSchema = z.object({
	count: z.int().min(0),
	entries: z.array(roastSkillMetadataSchema),
});

export type RoastSkillListRequest = z.infer<typeof roastSkillListRequestSchema>;
export type RoastSkillListResult = z.infer<typeof roastSkillListResultSchema>;

export const reviewRunRequestSchema = z.object({
	key: nonBlankStringSchema.describe("Review key to run."),
	model: z.string().optional().describe("Concrete model override."),
	modelProfile: z.string().optional().describe("Model profile override."),
	baseRef: z.string().optional().describe("Base ref for the local diff."),
	logBranch: nonBlankStringSchema
		.optional()
		.describe("Branch Memory branch for the review log. Defaults to the current branch."),
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
	| { readonly type: "failed"; readonly error: RoasterFailure };

export async function buildReviewListResult(
	ctx: RoasterRuntime,
	request: ReviewListRequest,
): Promise<RoasterResult<ReviewListResult>> {
	const catalog = await ctx.reviewCatalog.listReviewKeys(catalogOptions(ctx.runScope));
	if (catalog.type === "error") return catalog;

	const loaded = await loadDefinitions(ctx, catalog.value.keys);
	if (loaded.type === "error") return loaded;

	let selectedKeys = catalog.value.keys;
	if (request.ci) {
		selectedKeys = selectedKeys.filter((key) =>
			loaded.value.some((item) => item.key === key && !item.definition.localOnly),
		);
	}
	if (request.applicable) {
		const diff = await loadDiffFromRequest(ctx, request.baseRef);
		if (diff.type === "error") return diff;
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
		.map((item) => ({
			key: item.key,
			description: item.definition.description,
			modelProfile: item.definition.modelProfile,
			localOnly: item.definition.localOnly,
		}));
	return {
		type: "ok",
		value: reviewListResultSchema.parse({
			reviewsDir: catalog.value.reviewsDir,
			keys: selectedKeys,
			count: selectedKeys.length,
			reviews,
		}),
	};
}

export async function runReviewList(
	ctx: RoasterRuntime,
	request: ReviewListRequest,
): Promise<ClinkrExit<ReviewListResult>> {
	return clinkrExitFromRoasterResult(await buildReviewListResult(ctx, request));
}

export function renderReviewList(result: ReviewListResult): string {
	const lines = [`Reviews directory: ${result.reviewsDir}`, `Reviews: ${result.count}`];
	const tripwires = result.reviews.filter(
		(review) => roasterReviewDisplayRole(review.modelProfile) === "tripwire",
	);
	const deepReviews = result.reviews.filter(
		(review) => roasterReviewDisplayRole(review.modelProfile) === "deep_review",
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

export async function buildRoastSkillListResult(
	ctx: RoasterRuntime,
	_request: RoastSkillListRequest,
): Promise<RoasterResult<RoastSkillListResult>> {
	const loaded = await loadRoastSkillEntries({
		...catalogOptions(ctx.runScope),
		reviewCatalog: ctx.reviewCatalog,
	});
	if (loaded.type === "error") return loaded;

	const entries = loaded.value.map((entry) => ({
		surface: entry.surface,
		label: entry.label,
		reviewKey: entry.reviewKey,
		reviewPath: roastReviewPathForKey(entry.reviewKey),
		title: entry.title,
		description: entry.description,
		defaultPrompt: entry.defaultPrompt,
	}));
	return {
		type: "ok",
		value: roastSkillListResultSchema.parse({ count: entries.length, entries }),
	};
}

export async function runRoastSkillList(
	ctx: RoasterRuntime,
	request: RoastSkillListRequest,
): Promise<ClinkrExit<RoastSkillListResult>> {
	return clinkrExitFromRoasterResult(await buildRoastSkillListResult(ctx, request));
}

export function renderRoastSkillList(result: RoastSkillListResult): string {
	const lines = [`Roast skill entries: ${result.count}`];
	for (const entry of result.entries) {
		lines.push(`- ${entry.surface} — ${entry.label} (review: ${entry.reviewKey})`);
	}
	return lines.join("\n");
}

export async function runReviewByKey(
	ctx: RoasterRuntime,
	request: ReviewRunRequest,
): Promise<ClinkrExit<ReviewRunResult>> {
	return clinkrExitFromReviewRunOutcome(
		ctx,
		await runRoasterReview(ctx, {
			key: request.key,
			...optionalEntries({
				model: request.model,
				modelProfile: request.modelProfile,
				baseRef: request.baseRef,
				logBranch: request.logBranch,
			}),
		}),
	);
}

export function clinkrExitFromReviewRunOutcome(
	ctx: Pick<RoasterRuntime, "stderr">,
	outcome: Awaited<ReturnType<typeof runRoasterReview>>,
): ClinkrExit<ReviewRunResult> {
	if (outcome.type === "failed") return failureFromRoaster(outcome.error);
	ctx.stderr(
		`resolved model=${outcome.progress.model} model_profile=${outcome.progress.modelProfile} base_ref=${outcome.progress.baseRef} changed_paths=${outcome.progress.changedPathCount}\n`,
	);
	if (outcome.type === "completed_log_failed") {
		return negative(
			`${renderReviewRun(outcome.result)}\n\nroaster: failed to write Branch Memory review log:\n${outcome.error.message}`,
			{ data: outcome.result },
		);
	}
	return ok(outcome.result);
}

export function renderReviewRun(result: ReviewRunResult): string {
	const lines = [
		`${roasterReviewRoleLabel(result.modelProfile)}: ${result.reviewName}`,
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
		lines.push(`Tokens: ${totalInputTokens(result.usage)} in / ${result.usage.outputTokens} out`);
		lines.push(`Cost: $${result.usage.totalCostUsd.toFixed(4)} USD`);
		lines.push(
			`Duration: ${(result.usage.durationMs / 1000).toFixed(1)}s (${result.usage.numTurns} turns)`,
		);
	}
	return lines.join("\n");
}

export async function runRecordFindings(
	ctx: RoasterRuntime,
	request: RecordFindingsRequest,
): Promise<ClinkrExit<ReviewRunResult>> {
	return clinkrExitFromRecordFindingsOutcome(ctx, await recordSameSessionFindings(ctx, request));
}

export async function recordSameSessionFindings(
	ctx: RoasterRuntime,
	request: RecordFindingsRequest,
): Promise<RecordFindingsOutcome> {
	const payload = await readFindingsPayload(ctx);
	if (payload.type === "error") return { type: "failed", error: payload.error };

	const loaded = await loadReviewExecutionContext(ctx, {
		reviewKey: request.reviewKey,
		...optionalEntry("baseRef", request.baseRef),
	});
	if (loaded.type === "error") return { type: "failed", error: loaded.error };
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
	if (logResult.type === "error") {
		if (!isReviewLogFailure(logResult.error)) return { type: "failed", error: logResult.error };
		return { type: "recorded_log_failed", result, error: logResult.error };
	}

	return { type: "recorded", result, logEntry: logResult.value };
}

export function clinkrExitFromRecordFindingsOutcome(
	ctx: Pick<RoasterRuntime, "stderr">,
	outcome: RecordFindingsOutcome,
): ClinkrExit<ReviewRunResult> {
	if (outcome.type === "failed") return failureFromRoaster(outcome.error);
	if (outcome.type === "recorded_log_failed") {
		return negative(
			`${renderReviewRun(outcome.result)}\n\nroaster: failed to write Branch Memory review log:\n${outcome.error.message}`,
			{ data: outcome.result },
		);
	}
	ctx.stderr(`recorded review log: ${outcome.logEntry.key}\n`);
	return ok(outcome.result);
}

async function readFindingsPayload(
	ctx: RoasterRuntime,
): Promise<RoasterResult<ReviewFindingsPayload>> {
	const text = await ctx.stdin();
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (caught) {
		return {
			type: "error",
			error: {
				type: "review-execution-invalid-json",
				message: `record-findings stdin must be JSON: ${formatErrorMessage(caught)}`,
			},
		};
	}

	const payload = reviewFindingsPayloadSchema.safeParse(parsed);
	if (!payload.success) {
		return {
			type: "error",
			error: {
				type: "review-execution-invalid-findings",
				message: `record-findings stdin must match { findings: [...] }: ${z.prettifyError(payload.error)}`,
			},
		};
	}
	return { type: "ok", value: payload.data };
}

export async function buildReviewLogResult(
	ctx: RoasterRuntime,
	request: ReviewLogRequest,
): Promise<RoasterResult<ReviewLogResult>> {
	const entries = await ctx.reviewLog.listReviewLogs({
		...environmentOptions(ctx.runScope),
		...optionalEntry("reviewKey", request.key),
	});
	if (entries.type === "error") return entries;
	return {
		type: "ok",
		value: reviewLogResultSchema.parse({
			namespace: ROASTER_REVIEW_LOG_NAMESPACE,
			reviewKey: request.key ?? null,
			count: entries.value.length,
			entries: entries.value.map(reviewLogEntryResult),
		}),
	};
}

export async function runReviewLog(
	ctx: RoasterRuntime,
	request: ReviewLogRequest,
): Promise<ClinkrExit<ReviewLogResult>> {
	return clinkrExitFromRoasterResult(await buildReviewLogResult(ctx, request));
}

export function renderReviewLog(result: ReviewLogResult): string {
	if (result.count === 0) {
		return result.reviewKey === null
			? "No roaster review logs found for this branch."
			: `No roaster review logs found for review key ${result.reviewKey} on this branch.`;
	}
	const lines = [`Roaster review logs: ${result.count}`];
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
	ctx: RoasterRuntime,
	request: PublishFindingsRequest,
): Promise<number> {
	const result = await publishFindingsFromRequest(ctx, request);
	if (result.type === "error")
		return stderrFailure(ctx, `publish-findings: ${result.error.message}\n`);

	ctx.stderr(renderPublishFindingsDiagnostics(result.value));
	return 0;
}

export async function runPublishFindingsCommand(
	ctx: RoasterRuntime,
	request: PublishFindingsRequest,
): Promise<ClinkrExit<PublishFindingsCommandResult>> {
	return clinkrExitFromPublishFindingsResult(ctx, await publishFindingsFromRequest(ctx, request));
}

export function clinkrExitFromPublishFindingsResult(
	ctx: Pick<RoasterRuntime, "stderr">,
	result: PublishFindingsResult,
): ClinkrExit<PublishFindingsCommandResult> {
	if (result.type === "error") return failureFromPublicationError(result.error);

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
	ctx: RoasterRuntime,
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
	});
}

interface LoadedDefinition {
	readonly key: string;
	readonly definition: ReviewDefinition;
}

type LoadDefinitionsResult =
	| { readonly type: "ok"; readonly value: readonly LoadedDefinition[] }
	| { readonly type: "error"; readonly error: RoasterFailure };

async function loadDefinitions(
	ctx: RoasterRuntime,
	keys: readonly string[],
): Promise<LoadDefinitionsResult> {
	const loaded: LoadedDefinition[] = [];
	for (const key of keys) {
		const parsed = await loadParsedReviewDefinition({
			...catalogOptions(ctx.runScope),
			reviewCatalog: ctx.reviewCatalog,
			key,
		});
		if (parsed.type === "error") return parsed;
		loaded.push({ key: parsed.value.source.key, definition: parsed.value.definition });
	}
	return { type: "ok", value: loaded };
}

function renderReviewListEntry(review: ReviewListResult["reviews"][number]): string {
	const model = ` (model profile: ${review.modelProfile})`;
	const scope = review.localOnly ? " [local-only]" : "";
	return `- ${review.key}: ${review.description}${model}${scope}`;
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

function totalInputTokens(usage: ReviewUsage): number {
	return usage.inputTokens + usage.cacheCreationInputTokens + usage.cacheReadInputTokens;
}

function failureFromRoaster(error: RoasterFailure): ClinkrExit<never> {
	return failure(error.type, error.message);
}

function failureFromPublicationError(error: PublicationError): ClinkrExit<never> {
	return failure("roaster-publish-findings-failed", `publish-findings: ${error.message}`, {
		fatalFailurePhase: error.fatalFailurePhase,
		reason: error.reason,
	});
}

function clinkrExitFromRoasterResult<T>(result: RoasterResult<T>): ClinkrExit<T> {
	if (result.type === "ok") return ok(result.value);
	return failureFromRoaster(result.error);
}

function loadDiffFromRequest(
	ctx: RoasterRuntime,
	baseRef: string | undefined,
): ReturnType<RoasterRuntime["localDiff"]["loadDiff"]> {
	return ctx.localDiff.loadDiff({
		...environmentOptions(ctx.runScope),
		...optionalEntry("baseRef", baseRef),
	});
}

function renderPublishFindingsDiagnostics(
	result: Extract<PublishFindingsResult, { readonly type: "ok" }>["value"],
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

function stderrFailure(ctx: RoasterRuntime, message: string): number {
	ctx.stderr(message);
	return 1;
}
