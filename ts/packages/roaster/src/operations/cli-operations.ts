import { readFile } from "node:fs/promises";

import { failure, ok, type ClinkrExit } from "@asdl/clinkr";
import { z } from "zod";

import type { RoasterContext } from "../context.ts";
import { failureMessage, type RoasterFailure } from "../failures.ts";
import {
	extractInlineMarkers,
	inlineMarkerForFinding,
	parseFindingsCommentBody,
	parseFindingsPayloadResult,
	parseInlinePostingStatusResult,
	preserveActivityLog,
	renderFindingsComment,
	renderInlineBody,
} from "../findings-publication.ts";
import { classifyInlineFindings } from "../inline-commentability.ts";
import {
	postInlineFindingsResultSchema,
	reviewRunResultSchema,
	type InlinePostingStatus,
	type PostInlineFindingsResult,
	type ReviewExecutionResponse,
	type ReviewRunResult,
	type ReviewUsage,
} from "../models.ts";
import { applicableReviewKeys } from "../review-applicability.ts";
import { parseReviewDefinition, type ReviewDefinition } from "../review-definition.ts";

const BOT_LOGIN = "github-actions[bot]";

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

export const postInlineFindingsRequestSchema = z.object({
	pr_number: z.int().positive().describe("Pull request number."),
});

export const formatFindingsCommentRequestSchema = z.object({
	inline_result_file: z.string().optional().describe("Path to post-inline-findings JSON output."),
	review_name: z.string().optional().describe("Fallback review key for failed run envelopes."),
	base_ref: z.string().optional().describe("Fallback base ref for failed run envelopes."),
});

export const postFindingsCommentRequestSchema = z.object({
	pr_number: z.int().positive().describe("Pull request number."),
	run_url: z.string().optional().describe("GitHub Actions run URL to include in the activity log."),
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
			reviewDefinition: {
				...parsed.definition,
				applicability: {
					include: [...parsed.definition.applicability.include],
					exclude: [...parsed.definition.applicability.exclude],
				},
			},
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

export async function runPostInlineFindings(
	ctx: RoasterCliContext,
	request: z.infer<typeof postInlineFindingsRequestSchema>,
): Promise<number> {
	const raw = await ctx.stdin();
	const parsed = parseFindingsPayloadResult(raw);
	if (parsed.type === "error")
		return stderrFailure(ctx, `post-inline-findings: ${parsed.error.message}\n`);

	if (parsed.payload.errorType !== null || parsed.payload.count === 0) {
		writeInlineStatus(ctx, emptyInlineResult());
		return 0;
	}

	const changedFiles = await ctx.context.github.getPrChangedFiles(request.pr_number, {
		cwd: ctx.cwd,
		env: ctx.env,
	});
	if (changedFiles.type === "error") {
		writeInlineStatus(ctx, { ...emptyInlineResult(), apiError: changedFiles.error.message });
		return 0;
	}

	const reviewComments = await ctx.context.github.getPrReviewComments(request.pr_number, {
		cwd: ctx.cwd,
		env: ctx.env,
	});
	if (reviewComments.type === "error") {
		writeInlineStatus(ctx, { ...emptyInlineResult(), apiError: reviewComments.error.message });
		return 0;
	}

	const classified = classifyInlineFindings(parsed.payload.findings, changedFiles.value);
	const existingMarkers = new Set(
		reviewComments.value
			.filter((comment) => comment.author === BOT_LOGIN)
			.flatMap((comment) => extractInlineMarkers(comment.body)),
	);
	const fallbackOnly = classified.fallbackOnly.map((item) => ({
		finding: item.finding,
		reason: item.reason,
	}));
	const comments = [];
	let skippedDuplicateCount = 0;

	for (const item of classified.inlineable) {
		const marker = inlineMarkerForFinding(parsed.payload.reviewName, item.finding);
		if (existingMarkers.has(marker)) {
			skippedDuplicateCount += 1;
			continue;
		}
		comments.push({
			path: item.target.path,
			line: item.target.line,
			body: renderInlineBody(marker, item.finding, { reviewName: parsed.payload.reviewName }),
		});
	}

	let apiError: string | null = null;
	let postedCount = 0;
	if (comments.length > 0) {
		try {
			const posted = await ctx.context.github.createPrReview(request.pr_number, comments, {
				cwd: ctx.cwd,
				env: ctx.env,
			});
			if (posted.type === "error") apiError = posted.error.message;
			else postedCount = comments.length;
		} catch (caught) {
			apiError = caught instanceof Error ? caught.message : String(caught);
		}
	}

	writeInlineStatus(ctx, {
		postedCount,
		skippedDuplicateCount,
		fallbackOnlyCount: fallbackOnly.length,
		apiError,
		fallbackOnly,
	});
	return 0;
}

export async function runFormatFindingsComment(
	ctx: RoasterCliContext,
	request: z.infer<typeof formatFindingsCommentRequestSchema>,
): Promise<number> {
	const raw = await ctx.stdin();
	const payload = parseFindingsPayloadResult(raw, fallbackPayloadOptions(request));
	if (payload.type === "error")
		return stderrFailure(ctx, `format-findings-comment: ${payload.error.message}\n`);

	const inlineStatus = await loadInlineStatus(request.inline_result_file);
	if (inlineStatus.type === "error")
		return stderrFailure(ctx, `format-findings-comment: ${inlineStatus.message}\n`);

	ctx.stdout(renderFindingsComment(payload.payload, { inlineStatus: inlineStatus.status }));
	return 0;
}

export async function runPostFindingsComment(
	ctx: RoasterCliContext,
	request: z.infer<typeof postFindingsCommentRequestSchema>,
): Promise<number> {
	const body = await ctx.stdin();
	const parsed = parseFindingsCommentBody(body);
	if (parsed.type === "error")
		return stderrFailure(ctx, `post-findings-comment: ${parsed.error.message}\n`);

	const existing = await ctx.context.github.findPrDiscussionCommentByMarker({
		prNumber: request.pr_number,
		marker: parsed.parsed.marker,
		authorLogin: BOT_LOGIN,
		cwd: ctx.cwd,
		env: ctx.env,
	});
	if (existing.type === "error")
		return stderrFailure(ctx, `post-findings-comment: ${existing.error.message}\n`);

	const runSummary = activityLogEntry(request.run_url);
	const nextBody =
		existing.value === null
			? preserveActivityLog("", parsed.parsed.body, runSummary)
			: preserveActivityLog(existing.value.body, parsed.parsed.body, runSummary);
	const written =
		existing.value === null
			? await ctx.context.github.addPrDiscussionComment(request.pr_number, nextBody, {
					cwd: ctx.cwd,
					env: ctx.env,
				})
			: await ctx.context.github.updatePrDiscussionComment(existing.value.id, nextBody, {
					cwd: ctx.cwd,
					env: ctx.env,
				});
	if (written.type === "error")
		return stderrFailure(ctx, `post-findings-comment: ${written.error.message}\n`);

	ctx.stderr(existing.value === null ? "posted findings comment\n" : "updated findings comment\n");
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

type InlineResult = PostInlineFindingsResult;

function emptyInlineResult(): InlineResult {
	return {
		postedCount: 0,
		skippedDuplicateCount: 0,
		fallbackOnlyCount: 0,
		apiError: null,
		fallbackOnly: [],
	};
}

function writeInlineStatus(ctx: RoasterCliContext, status: InlineResult): void {
	ctx.stdout(`${JSON.stringify(postInlineFindingsResultSchema.parse(status))}\n`);
}

type InlineStatusLoadResult =
	| { readonly type: "ok"; readonly status: InlinePostingStatus | null }
	| { readonly type: "error"; readonly message: string };

async function loadInlineStatus(path: string | undefined): Promise<InlineStatusLoadResult> {
	if (path === undefined) return { type: "ok", status: null };
	let source: string;
	try {
		source = await readFile(path, "utf8");
	} catch (caught) {
		return { type: "error", message: caught instanceof Error ? caught.message : String(caught) };
	}
	const parsed = parseInlinePostingStatusResult(source);
	if (parsed.type === "error") return { type: "error", message: parsed.error.message };
	return { type: "ok", status: parsed.status };
}

function stderrFailure(ctx: RoasterCliContext, message: string): number {
	ctx.stderr(message);
	return 1;
}

function fallbackPayloadOptions(request: z.infer<typeof formatFindingsCommentRequestSchema>): {
	readonly fallbackReviewName?: string;
	readonly fallbackBaseRef?: string;
} {
	return {
		...(request.review_name === undefined ? {} : { fallbackReviewName: request.review_name }),
		...(request.base_ref === undefined ? {} : { fallbackBaseRef: request.base_ref }),
	};
}

function activityLogEntry(runUrl: string | undefined): string {
	const timestamp = new Date().toISOString();
	return runUrl === undefined || runUrl.trim() === "" ? timestamp : `${timestamp} · ${runUrl}`;
}
