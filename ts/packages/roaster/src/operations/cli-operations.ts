import { failure, ok, type ClinkrExit } from "@asdl/clinkr";
import { z } from "zod";

import type { RoasterContext } from "../context.ts";
import { failureMessage, type RoasterFailure } from "../failures.ts";
import { publishFindings, type PublishFindingsResult } from "../findings-publication.ts";
import {
	reviewRunResultSchema,
	type ReviewDefinition,
	type ReviewExecutionResponse,
	type ReviewRunResult,
	type ReviewUsage,
} from "../models.ts";
import { applicableReviewKeys } from "../review-applicability.ts";
import { parseReviewDefinition } from "../review-definition.ts";

export interface RoasterCliContext {
	readonly context: RoasterContext;
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
	readonly stdin: () => Promise<string>;
	readonly stdout: (text: string) => void;
	readonly stderr: (text: string) => void;
}

const nonBlankStringSchema = z.string().trim().min(1);

export const reviewListRequestSchema = z.object({
	applicable: z
		.boolean()
		.default(false)
		.describe("Only list reviews applicable to the current diff."),
	base_ref: z.string().optional().describe("Base ref used when filtering applicable reviews."),
});

export const reviewMetadataSchema = z.object({
	key: nonBlankStringSchema,
	description: nonBlankStringSchema,
	default_model: nonBlankStringSchema.nullable(),
});

export const reviewListResultSchema = z.object({
	reviews_dir: nonBlankStringSchema,
	keys: z.array(nonBlankStringSchema),
	count: z.int().min(0),
	reviews: z.array(reviewMetadataSchema),
});

export type ReviewListRequest = z.infer<typeof reviewListRequestSchema>;
export type ReviewListResult = z.infer<typeof reviewListResultSchema>;

export const reviewRunRequestSchema = z.object({
	key: nonBlankStringSchema.describe("Review key to run."),
	model: z.string().optional().describe("Claude Code model override."),
	base_ref: z.string().optional().describe("Base ref for the local diff."),
});

export type ReviewRunRequest = z.infer<typeof reviewRunRequestSchema>;

export const publishFindingsRequestSchema = z.object({
	pr_number: z.int().positive().describe("Pull request number."),
	run_url: z.string().optional().describe("GitHub Actions run URL to include in the activity log."),
	review_name: z.string().optional().describe("Fallback review key for failed run envelopes."),
	base_ref: z.string().optional().describe("Fallback base ref for failed run envelopes."),
});

export async function runReviewList(
	ctx: RoasterCliContext,
	request: ReviewListRequest,
): Promise<ClinkrExit<ReviewListResult>> {
	const catalog = await ctx.context.reviewCatalog.listReviewKeys({ cwd: ctx.cwd });
	if (catalog.type === "error") return failureFromRoaster(catalog.error);

	const loaded = await loadDefinitions(ctx, catalog.value.keys);
	if (loaded.type === "error") return failureFromRoaster(loaded.error);

	let selectedKeys = catalog.value.keys;
	if (request.applicable) {
		const diff = await ctx.context.localDiff.loadDiff({
			cwd: ctx.cwd,
			env: ctx.env,
			baseRef: request.base_ref,
		});
		if (diff.type === "error") return failureFromRoaster(diff.error);
		selectedKeys = applicableReviewKeys(
			new Map(loaded.value.map((item) => [item.key, item.definition])),
			{ changedPaths: diff.value.changedPaths },
		);
	}

	const selected = new Set(selectedKeys);
	const reviews = loaded.value
		.filter((item) => selected.has(item.key))
		.map((item) => ({
			key: item.key,
			description: item.definition.description,
			default_model: item.definition.defaultModel,
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
		const model = review.default_model === null ? "" : ` (default model: ${review.default_model})`;
		lines.push(`- ${review.key}: ${review.description}${model}`);
	}
	return lines.join("\n");
}

export async function runReviewByKey(
	ctx: RoasterCliContext,
	request: ReviewRunRequest,
): Promise<ClinkrExit<ReviewRunResult>> {
	const source = await ctx.context.reviewCatalog.loadReviewSource({
		cwd: ctx.cwd,
		key: request.key,
	});
	if (source.type === "error") return failureFromRoaster(source.error);

	const parsed = parseReviewDefinition(source.value.source, { name: source.value.key });
	if (parsed.type === "error") {
		return failure("review_definition_invalid", parsed.error.message);
	}

	const model = resolveModel(request.model, parsed.definition.defaultModel);
	if (model === null)
		return failure(
			"model_not_provided",
			"No model was provided. Pass --model or set default_model in the review definition.",
		);

	const diff = await ctx.context.localDiff.loadDiff({
		cwd: ctx.cwd,
		env: ctx.env,
		baseRef: request.base_ref,
	});
	if (diff.type === "error") return failureFromRoaster(diff.error);

	ctx.stderr(
		`resolved model=${model} base_ref=${diff.value.baseRef} changed_paths=${diff.value.changedPaths.length}\n`,
	);

	const response = await ctx.context.harness.runReview(
		{
			model,
			reviewDefinition: parsed.definition,
			target: { localDiff: diff.value },
		},
		{ cwd: ctx.cwd, env: ctx.env },
	);
	if (response.type === "error") return failureFromRoaster(response.error);

	return ok(
		reviewRunResult(source.value.key, source.value.path, model, diff.value.baseRef, response.value),
	);
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

export async function runPublishFindings(
	ctx: RoasterCliContext,
	request: z.infer<typeof publishFindingsRequestSchema>,
): Promise<number> {
	const envelope = await ctx.stdin();
	const result = await publishFindings(ctx.context, {
		prNumber: request.pr_number,
		envelope,
		...(request.run_url === undefined ? {} : { runUrl: request.run_url }),
		...(request.review_name === undefined ? {} : { fallbackReviewName: request.review_name }),
		...(request.base_ref === undefined ? {} : { fallbackBaseRef: request.base_ref }),
		cwd: ctx.cwd,
		env: ctx.env,
	});
	if (result.type === "error") return stderrFailure(ctx, `publish-findings: ${result.message}\n`);

	ctx.stderr(renderPublishFindingsDiagnostics(result));
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
	ctx: RoasterCliContext,
	keys: readonly string[],
): Promise<LoadDefinitionsResult> {
	const loaded: LoadedDefinition[] = [];
	for (const key of keys) {
		const source = await ctx.context.reviewCatalog.loadReviewSource({ cwd: ctx.cwd, key });
		if (source.type === "error") return source;
		const parsed = parseReviewDefinition(source.value.source, { name: source.value.key });
		if (parsed.type === "error") {
			return {
				type: "error",
				error: {
					type: "review_definition_invalid",
					reviewKey: source.value.key,
					message: parsed.error.message,
				},
			};
		}
		loaded.push({ key: source.value.key, definition: parsed.definition });
	}
	return { type: "ok", value: loaded };
}

function reviewRunResult(
	reviewName: string,
	reviewPath: string,
	model: string,
	baseRef: string,
	response: ReviewExecutionResponse,
): ReviewRunResult {
	return reviewRunResultSchema.parse({
		reviewName,
		reviewPath,
		model,
		baseRef,
		format: response.payload.format,
		count: response.payload.count,
		findings: response.payload.findings,
		usage: response.usage,
		inputCoverage: response.inputCoverage,
	});
}

function resolveModel(
	requestModel: string | undefined,
	defaultModel: string | null,
): string | null {
	const model = requestModel?.trim() ?? "";
	if (model !== "") return model;
	return defaultModel;
}

function totalInputTokens(usage: ReviewUsage): number {
	return usage.inputTokens + usage.cacheCreationInputTokens + usage.cacheReadInputTokens;
}

function failureFromRoaster(error: RoasterFailure): ClinkrExit<never> {
	return failure(error.type, failureMessage(error));
}

function renderPublishFindingsDiagnostics(
	result: Extract<PublishFindingsResult, { readonly type: "ok" }>,
): string {
	const apiError = result.inlineStatus.apiError?.replace(/\s+/gu, " ") ?? "none";
	return [
		`inline findings: posted=${result.inlineStatus.postedCount} skipped_duplicate=${result.inlineStatus.skippedDuplicateCount} fallback_only=${result.inlineStatus.fallbackOnlyCount} api_error=${apiError}`,
		`${result.summaryAction} findings comment`,
		"",
	].join("\n");
}

function stderrFailure(ctx: RoasterCliContext, message: string): number {
	ctx.stderr(message);
	return 1;
}
