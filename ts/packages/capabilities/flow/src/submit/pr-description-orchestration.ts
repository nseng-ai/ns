import type { TextGenerator } from "@nseng-ai/capability-kit/text-generation";
import type { GitGateway } from "@nseng-ai/foundation/git";
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";
import { formatModelRef } from "@nseng-ai/foundation/model-slug";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { ErrorInfo } from "@nseng-ai/foundation/result";

import { modelOperation, withActiveOperations } from "../phase-stream/matrix-progress-core.ts";
import type { GithubPrDetails, GithubPrGateway } from "./github-pr-gateway.ts";
import {
	preparePrDescription,
	resolvePrDescriptionGeneration,
	type FlowPrDescriptionDescriptorSource,
	type PrDescriptionGenerationResolution,
	type PromptSource,
	type TimeServices,
} from "./pr-description.ts";
import type { SubmitProgressListeners } from "./submit-progress-listeners.ts";

/** Temporary submit-pipeline compatibility shape. PR 2 removes metadata prewrite entirely. */
export interface PrewrittenPrMetadata {
	branch: string;
	parentBranch: string;
	title: string;
	body: string;
	commitRange: string;
	promptSource: PromptSource;
}

export interface PrDescriptionContent {
	title: string;
	previewBody: string;
}

export type PrMetadataReplacementSource = "submit" | "regenerate-pr";

export type PrDescriptionProgressListeners = Pick<
	SubmitProgressListeners<never>,
	"onProgress" | "onActiveOperations"
>;

export interface PrMetadataReplacementOptions {
	cwd: string;
	env: Record<string, string | undefined>;
	git: GitGateway;
	descriptorSource: FlowPrDescriptionDescriptorSource;
	modelSelection: ModelSelection;
	githubPr: GithubPrGateway;
	textGenerator: TextGenerator;
	pr: GithubPrDetails;
	source: PrMetadataReplacementSource;
	generation?: Extract<PrDescriptionGenerationResolution, { ok: true }>;
	activeOperationDetail?: string;
	progress?: PrDescriptionProgressListeners;
	time?: TimeServices;
}

export type CurrentBranchPrMetadataReplacementOptions = Omit<PrMetadataReplacementOptions, "pr">;

export interface PreparedPrMetadataReplacement {
	type: "prepared";
	pr: GithubPrDetails;
	title: string;
	body: string;
	previewBody: string;
	promptSource: PromptSource;
	modelSelection: ModelSelection;
	source: PrMetadataReplacementSource;
}

export type PrMetadataReplacementResult =
	| PreparedPrMetadataReplacement
	| {
			type: "failed";
			pr?: GithubPrDetails;
			reason: string;
			exitCode?: number;
			diagnostic?: ErrorInfo;
	  };

export type ApplyPrMetadataReplacementResult =
	| { ok: true }
	| { ok: false; reason: string; diagnostic?: ErrorInfo };

export interface PrDescriptionOrchestrationOptions extends Omit<
	PrMetadataReplacementOptions,
	"source"
> {
	/** Temporary adapter for the submit prewrite pipeline; PR 2 deletes this path. */
	prewrittenMetadata?: PrewrittenPrMetadata;
	shouldForce?: boolean;
}

export type PrDescriptionOrchestrationResult =
	| ({ type: "matched_prewritten"; pr: GithubPrDetails } & PrDescriptionContent)
	| ({ type: "updated"; pr: GithubPrDetails } & PrDescriptionContent)
	| ({ type: "generated"; pr: GithubPrDetails; promptSource: PromptSource } & PrDescriptionContent)
	| Extract<PrMetadataReplacementResult, { type: "failed" }>;

export async function preparePrMetadataReplacementForCurrentBranch(
	options: CurrentBranchPrMetadataReplacementOptions,
): Promise<PrMetadataReplacementResult> {
	const pr = await options.githubPr.viewCurrentBranchPr({ cwd: options.cwd });
	if (!pr.ok) {
		return { type: "failed", reason: `Could not resolve current branch PR.\n${pr.error.message}` };
	}
	return preparePrMetadataReplacement({ ...options, pr: pr.value });
}

export async function preparePrMetadataReplacement(
	options: PrMetadataReplacementOptions,
): Promise<PrMetadataReplacementResult> {
	const pr = options.pr;
	const generation =
		options.generation ??
		(await resolvePrDescriptionGeneration({
			env: options.env,
			cwd: options.cwd,
			git: options.git,
			descriptorSource: options.descriptorSource,
			modelSelection: options.modelSelection,
		}));
	if (!generation.ok) {
		return {
			type: "failed",
			pr,
			reason: generation.error,
			...(generation.exitCode === undefined ? {} : { exitCode: generation.exitCode }),
		};
	}

	options.progress?.onProgress?.(`loading PR #${pr.number} diff`);
	const diff = await options.githubPr.getPrDiff({
		cwd: options.cwd,
		number: pr.number,
		baseRefName: pr.baseRefName,
		headRefName: pr.headRefName,
	});
	if (!diff.ok) return { type: "failed", pr, reason: diff.error.message, diagnostic: diff.error };

	const commits = await options.githubPr.getPrCommitMessages({
		cwd: options.cwd,
		number: pr.number,
	});
	if (!commits.ok) {
		return { type: "failed", pr, reason: commits.error.message, diagnostic: commits.error };
	}

	const prepared = await withActiveOperations(
		options.progress?.onActiveOperations,
		[
			modelOperation(
				"generating PR description",
				formatModelRef(generation.modelSelection),
				options.activeOperationDetail ?? `PR #${pr.number}`,
			),
		],
		() =>
			preparePrDescription({
				textGenerator: options.textGenerator,
				modelSelection: generation.modelSelection,
				promptText: generation.promptText,
				context: {
					kind: "github",
					number: pr.number,
					url: pr.url,
					headRefName: pr.headRefName,
					baseRefName: pr.baseRefName,
					commitMessages: commits.value,
					diff: diff.value,
				},
				...optionalEntry("onProgress", options.progress?.onProgress),
				...(options.time === undefined ? {} : { time: options.time }),
			}),
	);
	if (!prepared.ok) return { type: "failed", pr, reason: prepared.error };

	return {
		type: "prepared",
		pr,
		title: prepared.title,
		body: appendPrMetadataProvenance({
			body: prepared.body,
			source: options.source,
			promptSource: generation.promptSource,
			modelSelection: generation.modelSelection,
		}),
		previewBody: prepared.body,
		promptSource: generation.promptSource,
		modelSelection: generation.modelSelection,
		source: options.source,
	};
}

export async function applyPreparedPrMetadataReplacement(input: {
	cwd: string;
	githubPr: GithubPrGateway;
	replacement: PreparedPrMetadataReplacement;
}): Promise<ApplyPrMetadataReplacementResult> {
	const edited = await input.githubPr.editPr({
		cwd: input.cwd,
		number: input.replacement.pr.number,
		title: input.replacement.title,
		body: input.replacement.body,
	});
	if (edited.ok) return { ok: true };
	return { ok: false, reason: edited.error.message, diagnostic: edited.error };
}

export function formatPromptSourceLabel(source: PromptSource): string {
	switch (source.type) {
		case "builtin":
			return "built-in flow.submit.pr-description";
		case "repo":
			return "repository flow.submit.pr-description";
		case "env":
			return "environment override flow.submit.pr-description";
	}
}

export function appendPrMetadataProvenance(input: {
	body: string;
	source: PrMetadataReplacementSource;
	promptSource: PromptSource;
	modelSelection: ModelSelection;
}): string {
	return `${input.body.trim()}\n\n---\n\n_Generated by \`ns flow ${input.source}\`. Prompt: ${formatPromptSourceLabel(input.promptSource)}. Model: \`${formatModelRef(input.modelSelection)}\`._`;
}

/** Temporary compile-preserving submit adapter. PR 2 replaces this orchestration. */
export async function orchestratePrDescription(
	options: PrDescriptionOrchestrationOptions,
): Promise<PrDescriptionOrchestrationResult> {
	if (options.prewrittenMetadata !== undefined) {
		if (
			options.pr.title === options.prewrittenMetadata.title &&
			options.pr.body === options.prewrittenMetadata.body
		) {
			return {
				type: "matched_prewritten",
				pr: options.pr,
				title: options.prewrittenMetadata.title,
				previewBody: options.prewrittenMetadata.body,
			};
		}
		const edited = await options.githubPr.editPr({
			cwd: options.cwd,
			number: options.pr.number,
			title: options.prewrittenMetadata.title,
			body: options.prewrittenMetadata.body,
		});
		if (!edited.ok) {
			return {
				type: "failed",
				pr: options.pr,
				reason: `Generated initial metadata, but failed to update PR #${options.pr.number} after Graphite created metadata.\n${edited.error.message}`,
				diagnostic: edited.error,
			};
		}
		return {
			type: "updated",
			pr: options.pr,
			title: options.prewrittenMetadata.title,
			previewBody: options.prewrittenMetadata.body,
		};
	}

	const prepared = await preparePrMetadataReplacement({
		...options,
		source: "submit",
	});
	if (prepared.type === "failed") return prepared;

	options.progress?.onProgress?.(`updating PR #${options.pr.number} title and body`);
	const edited = await applyPreparedPrMetadataReplacement({
		cwd: options.cwd,
		githubPr: options.githubPr,
		replacement: prepared,
	});
	if (!edited.ok) {
		return {
			type: "failed",
			pr: options.pr,
			reason: `Generated PR metadata, but failed to update PR #${options.pr.number}.\n${edited.reason}`,
			...(edited.diagnostic === undefined ? {} : { diagnostic: edited.diagnostic }),
		};
	}
	return {
		type: "generated",
		pr: options.pr,
		title: prepared.title,
		previewBody: prepared.previewBody,
		promptSource: prepared.promptSource,
	};
}
