import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { formatErrorMessage, optionalEntry } from "@nseng-ai/foundation/primitives";
import {
	formatModelRef,
	parseModelRef,
	type ModelSelection,
} from "@nseng-ai/foundation/model-slug";

import { catalogOptions, environmentOptions, type ReviewsRuntime } from "../core/context.ts";
import {
	isReviewLogFailure,
	type ReviewLogFailure,
	type ReviewFailure,
	type ReviewResult,
} from "../core/failures.ts";
import { isMissingFileError } from "../gateways/filesystem-errors.ts";
import type { ReviewSource } from "../gateways/review-catalog.ts";
import { renderReviewLogMarkdown, type ReviewLogWriteResult } from "../gateways/review-log.ts";
import {
	reviewRunResultSchema,
	type LocalDiff,
	type PriorFindingsPromptContext,
	type ReviewDefinition,
	type ReviewExecutionResponse,
	type ReviewRunResult,
} from "../core/models.ts";
import {
	parseReviewsProjectConfigToml,
	type ReviewsProjectConfig,
} from "../core/project-config.ts";
import { loadParsedReviewDefinition } from "../core/review-definition-loading.ts";
import { filterLocalDiffForReviewApplicability } from "../core/review-applicability.ts";
import { resolveReviewsModelSelection } from "../core/review-model-reference.ts";

export interface RunReviewRequest {
	readonly key: string;
	readonly model?: string;
	readonly modelProfile?: string;
	readonly baseRef?: string;
	readonly logBranch?: string;
	readonly priorFindingsContext?: PriorFindingsPromptContext;
}

export type RunReviewOutcome =
	| {
			readonly type: "completed";
			readonly result: ReviewRunResult;
			readonly logEntry: ReviewLogWriteResult;
			readonly progress: RunReviewProgress;
	  }
	| {
			readonly type: "completed_log_failed";
			readonly result: ReviewRunResult;
			readonly error: ReviewLogFailure;
			readonly progress: RunReviewProgress;
	  }
	| { readonly type: "failed"; readonly error: ReviewFailure };

export interface RunReviewProgress {
	readonly reviewKey: string;
	readonly reviewPath: string;
	readonly modelProfile: string;
	readonly model: string;
	readonly baseRef: string;
	readonly changedPathCount: number;
}

interface ResolvedReviewModel {
	readonly modelProfile: string;
	readonly modelSelection: ModelSelection;
}

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
	readonly config: ReviewsProjectConfig;
	readonly diff: LocalDiff;
}

export async function runReview(
	ctx: ReviewsRuntime,
	request: RunReviewRequest,
): Promise<RunReviewOutcome> {
	const loaded = await loadReviewExecutionContext(ctx, {
		reviewKey: request.key,
		...(request.baseRef === undefined ? {} : { baseRef: request.baseRef }),
	});
	if (!loaded.ok) return { type: "failed", error: loaded.error };
	const { source, definition, config, diff } = loaded.value;
	const reviewDiff = filterLocalDiffForReviewApplicability(diff, definition.applicability);

	const resolved = resolveReviewModel(request, definition, config);
	if (!resolved.ok) return { type: "failed", error: resolved.error };
	const model = resolved.value;

	const modelRef = formatModelRef(model.modelSelection);
	const progress: RunReviewProgress = {
		reviewKey: source.key,
		reviewPath: source.path,
		modelProfile: model.modelProfile,
		model: modelRef,
		baseRef: reviewDiff.baseRef,
		changedPathCount: reviewDiff.changedPaths.length,
	};

	const response = await ctx.reviewRunner.runReview(
		{
			modelSelection: model.modelSelection,
			reviewDefinition: definition,
			reviewDir: dirname(source.path),
			target: { localDiff: reviewDiff },
			...optionalEntry("priorFindingsContext", request.priorFindingsContext),
		},
		environmentOptions(ctx.runScope),
	);
	if (!response.ok) return { type: "failed", error: response.error };

	const result = reviewRunResult(
		source.key,
		source.path,
		model.modelProfile,
		modelRef,
		reviewDiff.baseRef,
		response.value,
	);
	const logResult = await writeReviewRunLog(ctx, {
		reviewKey: source.key,
		result,
		...(request.logBranch === undefined ? {} : { logBranch: request.logBranch }),
	});
	if (!logResult.ok) {
		if (!isReviewLogFailure(logResult.error)) {
			return { type: "failed", error: logResult.error };
		}
		return { type: "completed_log_failed", result, error: logResult.error, progress };
	}

	return { type: "completed", result, logEntry: logResult.value, progress };
}

export async function loadReviewExecutionContext(
	ctx: ReviewsRuntime,
	request: LoadReviewExecutionContextRequest,
): Promise<ReviewResult<ReviewExecutionContext>> {
	const loaded = await loadParsedReviewDefinition({
		...catalogOptions(ctx.runScope),
		reviewCatalog: ctx.reviewCatalog,
		key: request.reviewKey,
	});
	if (!loaded.ok) return loaded;

	const config = await loadProjectConfigFromContext(ctx);
	if (!config.ok) return config;

	const diff = await ctx.localDiff.loadDiff({
		...environmentOptions(ctx.runScope),
		...(request.baseRef === undefined ? {} : { baseRef: request.baseRef }),
		excludeGlobs: config.value.diff.exclude,
	});
	if (!diff.ok) return diff;

	return {
		ok: true,
		value: {
			source: loaded.value.source,
			definition: loaded.value.definition,
			config: config.value,
			diff: diff.value,
		},
	};
}

export async function writeReviewRunLog(
	ctx: ReviewsRuntime,
	options: {
		readonly reviewKey: string;
		readonly result: ReviewRunResult;
		readonly ranAt?: string;
		readonly logBranch?: string;
	},
): Promise<ReviewResult<ReviewLogWriteResult>> {
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
	request: RunReviewRequest,
	definition: ReviewDefinition,
	config: ReviewsProjectConfig,
): ReviewResult<ResolvedReviewModel> {
	const profile = (request.modelProfile ?? definition.modelProfile).trim();
	const configuredModel = config.modelPolicy.profiles[profile];
	if (configuredModel === undefined) {
		const configuredProfiles = Object.keys(config.modelPolicy.profiles).sort();
		return {
			ok: false,
			error: {
				code: "project-config-invalid",
				message: `Reviews model profile ${JSON.stringify(profile)} is not configured in [models.profiles]. Configured profiles: ${configuredProfiles.join(", ")}. Add [models.profiles.${profile}] with model = "provider/model-id" and thinking = "low|medium|high|xhigh", or choose a configured profile with --model-profile.`,
			},
		};
	}
	let selection = configuredModel;
	if (request.model !== undefined) {
		const modelRef = request.model.trim();
		const parsed = parseModelRef(modelRef, configuredModel.thinking);
		if (parsed === undefined) {
			return {
				ok: false,
				error: {
					code: modelRef === "" ? "model-not-provided" : "model-not-supported-by-harness",
					message:
						modelRef === ""
							? "A Reviews model must be provided. Expected a qualified provider/model reference."
							: `Reviews model ${JSON.stringify(modelRef)} is not supported by a local review harness. Expected a qualified provider/model reference.`,
				},
			};
		}
		selection = parsed;
	}
	const resolved = resolveReviewsModelSelection(selection);
	if (!resolved.ok) return resolved;
	return {
		ok: true,
		value: { modelProfile: profile, modelSelection: resolved.value.selection },
	};
}

async function reviewLogMetadata(
	ctx: ReviewsRuntime,
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
	result: Awaited<ReturnType<ReviewsRuntime["gitGateway"]["currentBranch"]>>,
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
	ctx: ReviewsRuntime,
): Promise<ReviewResult<ReviewsProjectConfig>> {
	const repoRoot = await ctx.gitGateway.repoRoot(catalogOptions(ctx.runScope));
	if (!repoRoot.ok) {
		return {
			ok: false,
			error: { code: "repo-root-unavailable", message: repoRoot.error.message },
		};
	}

	const path = join(repoRoot.value, "ns.toml");
	let source: string;
	try {
		source = await readFile(path, "utf8");
	} catch (caught) {
		if (isMissingFileError(caught)) {
			const emptyConfig = parseReviewsProjectConfigToml("");
			if (!emptyConfig.ok) {
				return {
					ok: false,
					error: { code: "project-config-invalid", message: emptyConfig.error.message },
				};
			}
			return { ok: true, value: emptyConfig.value };
		}
		return {
			ok: false,
			error: {
				code: "project-config-invalid",
				message: `Failed to read ns.toml: ${formatErrorMessage(caught)}`,
			},
		};
	}

	const parsed = parseReviewsProjectConfigToml(source, path);
	if (!parsed.ok) {
		return {
			ok: false,
			error: { code: "project-config-invalid", message: parsed.error.message },
		};
	}
	return { ok: true, value: parsed.value };
}
