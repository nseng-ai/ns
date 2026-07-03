import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { formatErrorMessage } from "@ns/core/primitives";

import { catalogOptions, environmentOptions, type RoasterRuntime } from "../core/context.ts";
import {
	isReviewLogFailure,
	type ReviewLogFailure,
	type RoasterFailure,
	type RoasterResult,
} from "../core/failures.ts";
import { isMissingFileError } from "../gateways/filesystem-errors.ts";
import type { ReviewSource } from "../gateways/review-catalog.ts";
import { renderReviewLogMarkdown, type ReviewLogWriteResult } from "../gateways/review-log.ts";
import {
	reviewRunResultSchema,
	type LocalDiff,
	type ReviewDefinition,
	type ReviewExecutionResponse,
	type ReviewRunResult,
} from "../core/models.ts";
import {
	DEFAULT_ROASTER_MODEL_PROFILES,
	isRoasterModelProfileKey,
	parseRoasterProjectConfigToml,
	type RoasterModelProfileKey,
	type RoasterProjectConfig,
} from "../core/project-config.ts";
import { loadParsedReviewDefinition } from "../core/review-definition-loading.ts";

export interface RunRoasterReviewRequest {
	readonly key: string;
	readonly model?: string;
	readonly modelProfile?: string;
	readonly baseRef?: string;
	readonly logBranch?: string;
}

export type RunRoasterReviewOutcome =
	| {
			readonly type: "completed";
			readonly result: ReviewRunResult;
			readonly logEntry: ReviewLogWriteResult;
			readonly progress: RunRoasterReviewProgress;
	  }
	| {
			readonly type: "completed_log_failed";
			readonly result: ReviewRunResult;
			readonly error: ReviewLogFailure;
			readonly progress: RunRoasterReviewProgress;
	  }
	| { readonly type: "failed"; readonly error: RoasterFailure };

export interface RunRoasterReviewProgress {
	readonly reviewKey: string;
	readonly reviewPath: string;
	readonly modelProfile: RoasterModelProfileKey;
	readonly model: string;
	readonly baseRef: string;
	readonly changedPathCount: number;
}

interface ResolvedReviewModel {
	readonly modelProfile: RoasterModelProfileKey;
	readonly model: string;
}

type ResolveReviewModelResult =
	| { readonly type: "ok"; readonly value: ResolvedReviewModel }
	| { readonly type: "error"; readonly error: RoasterFailure };

interface ReviewLogMetadata {
	readonly branch: string;
	readonly headCommit: string;
}

export interface LoadReviewExecutionContextRequest {
	readonly reviewKey: string;
	readonly baseRef?: string;
}

export interface ReviewExecutionContext {
	readonly source: ReviewSource;
	readonly definition: ReviewDefinition;
	readonly config: RoasterProjectConfig;
	readonly diff: LocalDiff;
}

export async function runRoasterReview(
	ctx: RoasterRuntime,
	request: RunRoasterReviewRequest,
): Promise<RunRoasterReviewOutcome> {
	const loaded = await loadReviewExecutionContext(ctx, {
		reviewKey: request.key,
		...(request.baseRef === undefined ? {} : { baseRef: request.baseRef }),
	});
	if (loaded.type === "error") return { type: "failed", error: loaded.error };
	const { source, definition, config, diff } = loaded.value;

	const resolved = resolveReviewModel(request, definition, config);
	if (resolved.type === "error") return { type: "failed", error: resolved.error };
	const model = resolved.value;

	const progress: RunRoasterReviewProgress = {
		reviewKey: source.key,
		reviewPath: source.path,
		modelProfile: model.modelProfile,
		model: model.model,
		baseRef: diff.baseRef,
		changedPathCount: diff.changedPaths.length,
	};

	const response = await ctx.reviewRunner.runReview(
		{
			model: model.model,
			reviewDefinition: definition,
			reviewDir: dirname(source.path),
			target: { localDiff: diff },
		},
		environmentOptions(ctx.runScope),
	);
	if (response.type === "error") return { type: "failed", error: response.error };

	const result = reviewRunResult(
		source.key,
		source.path,
		model.modelProfile,
		model.model,
		diff.baseRef,
		response.value,
	);
	const logResult = await writeReviewRunLog(ctx, {
		reviewKey: source.key,
		result,
		...(request.logBranch === undefined ? {} : { logBranch: request.logBranch }),
	});
	if (logResult.type === "error") {
		if (!isReviewLogFailure(logResult.error)) {
			return { type: "failed", error: logResult.error };
		}
		return { type: "completed_log_failed", result, error: logResult.error, progress };
	}

	return { type: "completed", result, logEntry: logResult.value, progress };
}

export async function loadReviewExecutionContext(
	ctx: RoasterRuntime,
	request: LoadReviewExecutionContextRequest,
): Promise<RoasterResult<ReviewExecutionContext>> {
	const loaded = await loadParsedReviewDefinition({
		...catalogOptions(ctx.runScope),
		reviewCatalog: ctx.reviewCatalog,
		key: request.reviewKey,
	});
	if (loaded.type === "error") return loaded;

	const config = await loadProjectConfigFromContext(ctx);
	if (config.type === "error") return config;

	const diff = await ctx.localDiff.loadDiff({
		...environmentOptions(ctx.runScope),
		...(request.baseRef === undefined ? {} : { baseRef: request.baseRef }),
		excludeGlobs: config.value.diff.exclude,
	});
	if (diff.type === "error") return diff;

	return {
		type: "ok",
		value: {
			source: loaded.value.source,
			definition: loaded.value.definition,
			config: config.value,
			diff: diff.value,
		},
	};
}

export async function writeReviewRunLog(
	ctx: RoasterRuntime,
	options: {
		readonly reviewKey: string;
		readonly result: ReviewRunResult;
		readonly ranAt?: string;
		readonly logBranch?: string;
	},
): Promise<RoasterResult<ReviewLogWriteResult>> {
	const ranAt = options.ranAt ?? new Date().toISOString();
	const metadata = await reviewLogMetadata(ctx, options.logBranch);
	return await ctx.reviewLog.writeReviewLog({
		...environmentOptions(ctx.runScope),
		reviewKey: options.reviewKey,
		ranAt,
		...(options.logBranch === undefined ? {} : { branch: options.logBranch }),
		content: renderReviewLogMarkdown(options.result, { ranAt, ...metadata }),
	});
}

function reviewRunResult(
	reviewName: string,
	reviewPath: string,
	modelProfile: string,
	model: string,
	baseRef: string,
	response: ReviewExecutionResponse,
): ReviewRunResult {
	return reviewRunResultSchema.parse({
		reviewName,
		reviewPath,
		modelProfile,
		model,
		baseRef,
		format: response.payload.format,
		count: response.payload.count,
		findings: response.payload.findings,
		usage: response.usage,
		inputCoverage: response.inputCoverage,
	});
}

function resolveReviewModel(
	request: RunRoasterReviewRequest,
	definition: ReviewDefinition,
	config: RoasterProjectConfig,
): ResolveReviewModelResult {
	const profile = (request.modelProfile ?? definition.modelProfile).trim();
	if (!isRoasterModelProfileKey(profile)) {
		return {
			type: "error",
			error: {
				type: "review-definition-invalid",
				message: `Unknown Roaster model profile ${JSON.stringify(profile)}. Allowed profiles: quick, deep.`,
			},
		};
	}

	const requestModel = request.model?.trim() ?? "";
	if (requestModel !== "")
		return { type: "ok", value: { modelProfile: profile, model: requestModel } };
	return { type: "ok", value: { modelProfile: profile, model: config.modelProfiles[profile] } };
}

async function reviewLogMetadata(
	ctx: RoasterRuntime,
	logBranch: string | undefined,
): Promise<ReviewLogMetadata> {
	const options = environmentOptions(ctx.runScope);
	const currentBranch =
		logBranch === undefined
			? branchMetadataValue(await ctx.gitGateway.currentBranch(options))
			: logBranch;
	const headCommit = await ctx.gitGateway.headCommit(options);
	return {
		branch: currentBranch,
		headCommit: headCommit.ok
			? headCommit.value
			: unavailableMetadataValue(headCommit.error.message),
	};
}

function branchMetadataValue(
	result: Awaited<ReturnType<RoasterRuntime["gitGateway"]["currentBranch"]>>,
): string {
	switch (result.type) {
		case "branch":
			return result.branch;
		case "detached":
			return "unknown";
		case "failure":
			return unavailableMetadataValue(result.error.message);
	}
}

function unavailableMetadataValue(message: string): string {
	return `unavailable: ${message}`;
}

export async function loadProjectConfigFromContext(
	ctx: RoasterRuntime,
): Promise<RoasterResult<RoasterProjectConfig>> {
	const repoRoot = await ctx.gitGateway.repoRoot(catalogOptions(ctx.runScope));
	if (!repoRoot.ok) {
		return {
			type: "error",
			error: { type: "repo-root-unavailable", message: repoRoot.error.message },
		};
	}

	const path = join(repoRoot.value, "ns.toml");
	let source: string;
	try {
		source = await readFile(path, "utf8");
	} catch (caught) {
		if (isMissingFileError(caught)) {
			return {
				type: "ok",
				value: { diff: { exclude: [] }, modelProfiles: DEFAULT_ROASTER_MODEL_PROFILES },
			};
		}
		return {
			type: "error",
			error: {
				type: "project-config-invalid",
				message: `Failed to read ns.toml: ${formatErrorMessage(caught)}`,
			},
		};
	}

	const parsed = parseRoasterProjectConfigToml(source, path);
	if (parsed.type === "error") {
		return {
			type: "error",
			error: { type: "project-config-invalid", message: parsed.error.message },
		};
	}
	return { type: "ok", value: parsed.config };
}
