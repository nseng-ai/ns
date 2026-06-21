import { failure, ok, shellNegative, type ClinkrExit } from "@sdl/clinkr";
import { formatErrorMessage } from "@sdl/core/primitives";
import { z } from "zod";

import { catalogOptions, environmentOptions, type RoasterRuntime } from "../context.ts";
import type { RoasterFailure } from "../failures.ts";
import { publishFindings, type PublishFindingsResult } from "../findings-publication.ts";
import { ROASTER_REVIEW_LOG_NAMESPACE, type ReviewLogEntry } from "../gateways/review-log.ts";
import {
	reviewFindingsPayloadSchema,
	reviewRunResultSchema,
	type ReviewDefinition,
	type ReviewFindingsPayload,
	type ReviewRunResult,
	type ReviewUsage,
} from "../models.ts";
import { applicableReviewKeys } from "../review-applicability.ts";
import { parseReviewDefinition } from "../review-definition.ts";
import { loadRoastSkillEntries, roastReviewPathForKey } from "../skill-reviews.ts";
import { loadProjectConfigFromContext, runRoasterReview, writeReviewRunLog } from "./review-run.ts";

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
	model_profile: nonBlankStringSchema,
	local_only: z.boolean(),
});

export const reviewListResultSchema = z.object({
	reviews_dir: nonBlankStringSchema,
	keys: z.array(nonBlankStringSchema),
	count: z.int().min(0),
	reviews: z.array(reviewMetadataSchema),
});

export type ReviewListRequest = z.infer<typeof reviewListRequestSchema>;
export type ReviewListResult = z.infer<typeof reviewListResultSchema>;

export const roastSkillMetadataSchema = z.object({
	surface: nonBlankStringSchema,
	label: nonBlankStringSchema,
	review_key: nonBlankStringSchema,
	review_path: nonBlankStringSchema,
	title: nonBlankStringSchema,
	description: nonBlankStringSchema,
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

export const recordFindingsRequestSchema = z.object({
	reviewKey: nonBlankStringSchema.describe("Review key that produced the findings."),
	baseRef: z.string().optional().describe("Base ref for the local diff."),
	model: nonBlankStringSchema
		.optional()
		.describe("Model label to record for same-session findings."),
});

export type RecordFindingsRequest = z.infer<typeof recordFindingsRequestSchema>;

export async function runReviewList(
	ctx: RoasterRuntime,
	request: ReviewListRequest,
): Promise<ClinkrExit<ReviewListResult>> {
	const catalog = await ctx.reviewCatalog.listReviewKeys(catalogOptions(ctx.runScope));
	if (catalog.type === "error") return failureFromRoaster(catalog.error);

	const loaded = await loadDefinitions(ctx, catalog.value.keys);
	if (loaded.type === "error") return failureFromRoaster(loaded.error);

	let selectedKeys = catalog.value.keys;
	if (request.ci) {
		selectedKeys = selectedKeys.filter((key) =>
			loaded.value.some((item) => item.key === key && !item.definition.localOnly),
		);
	}
	if (request.applicable) {
		const diff = await loadDiffFromRequest(ctx, request.baseRef);
		if (diff.type === "error") return failureFromRoaster(diff.error);
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
			model_profile: item.definition.modelProfile,
			local_only: item.definition.localOnly,
		}));
	return ok(
		reviewListResultSchema.parse({
			reviews_dir: catalog.value.reviewsDir,
			keys: selectedKeys,
			count: selectedKeys.length,
			reviews,
		}),
	);
}

export function renderReviewList(result: ReviewListResult): string {
	const lines = [`Reviews directory: ${result.reviews_dir}`, `Reviews: ${result.count}`];
	for (const review of result.reviews) {
		const model = ` (model profile: ${review.model_profile})`;
		const scope = review.local_only ? " [local-only]" : "";
		lines.push(`- ${review.key}: ${review.description}${model}${scope}`);
	}
	return lines.join("\n");
}

export async function runRoastSkillList(
	ctx: RoasterRuntime,
	_request: RoastSkillListRequest,
): Promise<ClinkrExit<RoastSkillListResult>> {
	const loaded = await loadRoastSkillEntries({
		...catalogOptions(ctx.runScope),
		reviewCatalog: ctx.reviewCatalog,
	});
	if (loaded.type === "error") return failureFromRoaster(loaded.error);

	const entries = loaded.value.map((entry) => ({
		surface: entry.surface,
		label: entry.label,
		review_key: entry.reviewKey,
		review_path: roastReviewPathForKey(entry.reviewKey),
		title: entry.title,
		description: entry.description,
	}));
	return ok(roastSkillListResultSchema.parse({ count: entries.length, entries }));
}

export function renderRoastSkillList(result: RoastSkillListResult): string {
	const lines = [`Roast skill entries: ${result.count}`];
	for (const entry of result.entries) {
		lines.push(`- ${entry.surface} — ${entry.label} (review: ${entry.review_key})`);
	}
	return lines.join("\n");
}

export async function runReviewByKey(
	ctx: RoasterRuntime,
	request: ReviewRunRequest,
): Promise<ClinkrExit<ReviewRunResult>> {
	const outcome = await runRoasterReview(ctx, request);
	if (outcome.type === "failed") return failureFromRoaster(outcome.error);
	ctx.stderr(
		`resolved model=${outcome.progress.model} model_profile=${outcome.progress.modelProfile} base_ref=${outcome.progress.baseRef} changed_paths=${outcome.progress.changedPathCount}\n`,
	);
	if (outcome.type === "completed_log_failed") {
		return shellNegative(
			`${renderReviewRun(outcome.result)}\n\nroaster: failed to write Branch Memory review log:\n${outcome.error.message}`,
			outcome.result,
		);
	}
	return ok(outcome.result);
}

export function renderReviewRun(result: ReviewRunResult): string {
	const lines = [
		`Reviewer: ${result.reviewName}`,
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
	const payload = await readFindingsPayload(ctx);
	if (payload.type === "failure") return payload.exit;

	const source = await ctx.reviewCatalog.loadReviewSource({
		...catalogOptions(ctx.runScope),
		key: request.reviewKey,
	});
	if (source.type === "error") return failureFromRoaster(source.error);

	const parsed = parseReviewDefinition(source.value.source, { name: source.value.key });
	if (parsed.type === "error") return failure("review_definition_invalid", parsed.error.message);

	const config = await loadProjectConfigFromContext(ctx);
	if (config.type === "error") return failureFromRoaster(config.error);

	const diff = await ctx.localDiff.loadDiff({
		...environmentOptions(ctx.runScope),
		...(request.baseRef === undefined ? {} : { baseRef: request.baseRef }),
		excludeGlobs: config.value.diff.exclude,
	});
	if (diff.type === "error") return failureFromRoaster(diff.error);

	const result = reviewRunResultSchema.parse({
		reviewName: source.value.key,
		reviewPath: source.value.path,
		model: request.model ?? "same-session",
		baseRef: diff.value.baseRef,
		format: "findings",
		count: payload.value.findings.length,
		findings: payload.value.findings,
		usage: null,
		inputCoverage: null,
	});

	const logResult = await writeReviewRunLog(ctx, { reviewKey: source.value.key, result });
	if (logResult.type === "error") {
		return shellNegative(
			`${renderReviewRun(result)}\n\nroaster: failed to write Branch Memory review log:\n${logResult.error.message}`,
			result,
		);
	}

	ctx.stderr(`recorded review log: ${logResult.value.key}\n`);
	return ok(result);
}

async function readFindingsPayload(
	ctx: RoasterRuntime,
): Promise<
	| { readonly type: "ok"; readonly value: ReviewFindingsPayload }
	| { readonly type: "failure"; readonly exit: ClinkrExit<never> }
> {
	const text = await ctx.stdin();
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (caught) {
		return {
			type: "failure",
			exit: failure(
				"review_execution_invalid_json",
				`record-findings stdin must be JSON: ${formatErrorMessage(caught)}`,
			),
		};
	}

	const payload = reviewFindingsPayloadSchema.safeParse(parsed);
	if (!payload.success) {
		return {
			type: "failure",
			exit: failure(
				"review_execution_invalid_findings",
				`record-findings stdin must match { findings: [...] }: ${z.prettifyError(payload.error)}`,
			),
		};
	}
	return { type: "ok", value: payload.data };
}

export async function runReviewLog(
	ctx: RoasterRuntime,
	request: ReviewLogRequest,
): Promise<ClinkrExit<ReviewLogResult>> {
	const entries = await ctx.reviewLog.listReviewLogs({
		...environmentOptions(ctx.runScope),
		...(request.key === undefined ? {} : { reviewKey: request.key }),
	});
	if (entries.type === "error") return failureFromRoaster(entries.error);
	return ok(
		reviewLogResultSchema.parse({
			namespace: ROASTER_REVIEW_LOG_NAMESPACE,
			reviewKey: request.key ?? null,
			count: entries.value.length,
			entries: entries.value.map(reviewLogEntryResult),
		}),
	);
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
	request: z.infer<typeof publishFindingsRequestSchema>,
): Promise<number> {
	const envelope = await ctx.stdin();
	const result = await publishFindings(ctx, {
		prNumber: request.prNumber,
		envelope,
		...(request.runUrl === undefined ? {} : { runUrl: request.runUrl }),
		...(request.reviewName === undefined ? {} : { fallbackReviewName: request.reviewName }),
		...(request.baseRef === undefined ? {} : { fallbackBaseRef: request.baseRef }),
	});
	if (result.type === "error")
		return stderrFailure(ctx, `publish-findings: ${result.error.message}\n`);

	ctx.stderr(renderPublishFindingsDiagnostics(result.value));
	return 0;
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
		const source = await ctx.reviewCatalog.loadReviewSource({
			...catalogOptions(ctx.runScope),
			key,
		});
		if (source.type === "error") return source;
		const parsed = parseReviewDefinition(source.value.source, { name: source.value.key });
		if (parsed.type === "error") {
			return {
				type: "error",
				error: {
					type: "review_definition_invalid",
					message: `Review definition ${source.value.key} at ${source.value.path} is invalid: ${parsed.error.message}`,
				},
			};
		}
		loaded.push({ key: source.value.key, definition: parsed.definition });
	}
	return { type: "ok", value: loaded };
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

function loadDiffFromRequest(
	ctx: RoasterRuntime,
	baseRef: string | undefined,
): ReturnType<RoasterRuntime["localDiff"]["loadDiff"]> {
	return ctx.localDiff.loadDiff({
		...environmentOptions(ctx.runScope),
		...(baseRef === undefined ? {} : { baseRef }),
	});
}

function renderPublishFindingsDiagnostics(
	result: Extract<PublishFindingsResult, { readonly type: "ok" }>["value"],
): string {
	const apiError = result.inlineStatus.apiError?.replace(/\s+/gu, " ") ?? "none";
	return [
		`inline findings: posted=${result.inlineStatus.postedCount} skipped_duplicate=${result.inlineStatus.skippedDuplicateCount} fallback_only=${result.inlineStatus.fallbackOnlyCount} api_error=${apiError}`,
		`${result.summaryStatus.type} findings comment`,
		"",
	].join("\n");
}

function stderrFailure(ctx: RoasterRuntime, message: string): number {
	ctx.stderr(message);
	return 1;
}
