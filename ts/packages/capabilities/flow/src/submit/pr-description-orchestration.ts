import type { GitGateway } from "@nseng-ai/foundation/git";
import type { TextGenerator } from "@nseng-ai/capability-kit/text-generation";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { ErrorInfo } from "@nseng-ai/foundation/result";

import { modelOperation, withActiveOperations } from "../phase-stream/matrix-progress-core.ts";
import type { SubmitProgressListeners } from "./submit-progress-listeners.ts";
import type { GithubPrDetails, GithubPrGateway } from "./github-pr-gateway.ts";
import {
	buildFingerprint,
	decidePrBodyUpdate,
	mergeGeneratedBody,
	prewrittenFallbackBody,
	prewrittenMetadataMatches,
	type PrDescriptionFingerprintPolicy,
} from "./pr-description-body.ts";
import {
	preparePrDescription,
	resolvePrDescriptionGeneration,
	type FlowPrDescriptionDescriptorSource,
	type PrDescriptionGenerationResolution,
	type PromptSource,
	type TimeServices,
} from "./pr-description.ts";
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

export type { PrDescriptionFingerprintPolicy } from "./pr-description-body.ts";

export type PrDescriptionProgressListeners = Pick<
	SubmitProgressListeners<never>,
	"onProgress" | "onActiveOperations"
>;

export interface PrDescriptionUpdateOptions {
	cwd: string;
	env: Record<string, string | undefined>;
	git: GitGateway;
	descriptorSource: FlowPrDescriptionDescriptorSource;
	githubPr: GithubPrGateway;
	textGenerator: TextGenerator;
	pr: GithubPrDetails;
	generation?: Extract<PrDescriptionGenerationResolution, { ok: true }>;
	fingerprintPolicy?: PrDescriptionFingerprintPolicy;
	activeOperationDetail?: string;
	progress?: PrDescriptionProgressListeners;
	time?: TimeServices;
}

export type CurrentBranchPrDescriptionUpdateOptions = Omit<PrDescriptionUpdateOptions, "pr">;

export type PreparedPrDescriptionUpdate = Extract<PrDescriptionUpdateResult, { type: "prepared" }>;

export type PrDescriptionUpdateResult =
	| { type: "skipped"; pr: GithubPrDetails; patchId: string; promptSource: PromptSource }
	| ({
			type: "prepared";
			pr: GithubPrDetails;
			mergedBody: string;
			promptSource: PromptSource;
	  } & PrDescriptionContent)
	| {
			type: "failed";
			pr?: GithubPrDetails;
			reason: string;
			exitCode?: number;
			diagnostic?: ErrorInfo;
	  };

export type ApplyPrDescriptionUpdateResult =
	| { ok: true }
	| { ok: false; reason: string; diagnostic?: ErrorInfo };

export function prDescriptionFingerprintPolicyForForce(
	shouldForce: boolean,
): PrDescriptionFingerprintPolicy {
	return shouldForce ? "force" : "skip-current";
}

export interface PrDescriptionOrchestrationOptions extends PrDescriptionUpdateOptions {
	prewrittenMetadata?: PrewrittenPrMetadata;
	shouldForce?: boolean;
}

export type PrDescriptionOrchestrationResult =
	| { type: "skipped"; pr: GithubPrDetails; patchId: string }
	| ({ type: "matched_prewritten"; pr: GithubPrDetails } & PrDescriptionContent)
	| ({ type: "updated"; pr: GithubPrDetails } & PrDescriptionContent)
	| ({
			type: "generated";
			pr: GithubPrDetails;
			promptSource: PromptSource;
	  } & PrDescriptionContent)
	| Extract<PrDescriptionUpdateResult, { type: "failed" }>;

export async function preparePrDescriptionUpdateForCurrentBranch(
	options: CurrentBranchPrDescriptionUpdateOptions,
): Promise<PrDescriptionUpdateResult> {
	const pr = await options.githubPr.viewCurrentBranchPr({ cwd: options.cwd });
	if (!pr.ok) {
		return { type: "failed", reason: `Could not resolve current branch PR.\n${pr.error.message}` };
	}
	return preparePrDescriptionUpdate({ ...options, pr: pr.value });
}

export async function preparePrDescriptionUpdate(
	options: PrDescriptionUpdateOptions,
): Promise<PrDescriptionUpdateResult> {
	const pr = options.pr;
	const generation = options.generation ?? (await resolvePrDescriptionGeneration(options));
	if (!generation.ok) {
		return {
			type: "failed",
			pr,
			reason: generation.error,
			...(generation.exitCode === undefined ? {} : { exitCode: generation.exitCode }),
		};
	}

	options.progress?.onProgress?.(`checking PR #${pr.number} description fingerprint`);
	const patchId = await options.githubPr.stablePatchIdForPr({
		cwd: options.cwd,
		number: pr.number,
		...(pr.baseRefName === undefined ? {} : { baseRefName: pr.baseRefName }),
		...(pr.headRefName === undefined ? {} : { headRefName: pr.headRefName }),
	});
	if (!patchId.ok) {
		return { type: "failed", pr, reason: patchId.error.message, diagnostic: patchId.error };
	}

	const fingerprint = buildFingerprint({
		patchId: patchId.value.patchId,
		promptText: generation.promptText,
	});
	const decision = decidePrBodyUpdate({
		existingBody: pr.body,
		fingerprint,
		policy: options.fingerprintPolicy ?? "skip-current",
	});
	if (decision.type === "skip") {
		options.progress?.onProgress?.(
			`skipping PR #${pr.number} description; generated fingerprint is unchanged`,
		);
		return {
			type: "skipped",
			pr,
			patchId: patchId.value.patchId,
			promptSource: generation.promptSource,
		};
	}

	options.progress?.onProgress?.(`recomputing PR #${pr.number} description (${decision.reason})`);
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
				generation.modelRef,
				options.activeOperationDetail ?? `PR #${pr.number}`,
			),
		],
		() =>
			preparePrDescription({
				textGenerator: options.textGenerator,
				modelRef: generation.modelRef,
				promptText: generation.promptText,
				context: {
					kind: "github",
					number: pr.number,
					url: pr.url,
					title: pr.title,
					headRefName: pr.headRefName,
					baseRefName: pr.baseRefName,
					commitMessages: commits.value,
					diff: patchId.value.diff,
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
		mergedBody: mergeGeneratedBody({
			existingBody: pr.body,
			generatedBody: prepared.body,
			fingerprint,
		}),
		previewBody: prepared.body,
		promptSource: generation.promptSource,
	};
}

export async function applyPreparedPrDescriptionUpdate(input: {
	cwd: string;
	githubPr: GithubPrGateway;
	update: PreparedPrDescriptionUpdate;
}): Promise<ApplyPrDescriptionUpdateResult> {
	const edited = await input.githubPr.editPr({
		cwd: input.cwd,
		number: input.update.pr.number,
		title: input.update.title,
		body: input.update.mergedBody,
	});
	if (edited.ok) return { ok: true };
	return { ok: false, reason: edited.error.message, diagnostic: edited.error };
}

export async function orchestratePrDescription(
	options: PrDescriptionOrchestrationOptions,
): Promise<PrDescriptionOrchestrationResult> {
	const pr = options.pr;

	if (options.prewrittenMetadata !== undefined) {
		return await reconcilePrewrittenPr({
			options,
			pr,
			metadata: options.prewrittenMetadata,
		});
	}

	const prepared = await preparePrDescriptionUpdate({
		cwd: options.cwd,
		env: options.env,
		git: options.git,
		descriptorSource: options.descriptorSource,
		githubPr: options.githubPr,
		textGenerator: options.textGenerator,
		pr,
		...(options.generation === undefined ? {} : { generation: options.generation }),
		fingerprintPolicy: prDescriptionFingerprintPolicyForForce(options.shouldForce === true),
		...(options.activeOperationDetail === undefined
			? {}
			: { activeOperationDetail: options.activeOperationDetail }),
		...optionalEntry("progress", options.progress),
		...(options.time === undefined ? {} : { time: options.time }),
	});
	if (prepared.type === "failed") return prepared;
	if (prepared.type === "skipped") {
		return {
			type: "skipped",
			pr,
			patchId: prepared.patchId,
		};
	}

	options.progress?.onProgress?.(`updating PR #${pr.number} description`);
	const edited = await applyPreparedPrDescriptionUpdate({
		cwd: options.cwd,
		githubPr: options.githubPr,
		update: prepared,
	});
	if (!edited.ok) {
		return {
			type: "failed",
			pr,
			reason: `Generated a PR description, but failed to update PR #${pr.number}.\n${edited.reason}`,
			...(edited.diagnostic === undefined ? {} : { diagnostic: edited.diagnostic }),
		};
	}

	return {
		type: "generated",
		pr,
		title: prepared.title,
		previewBody: prepared.previewBody,
		promptSource: prepared.promptSource,
	};
}

async function reconcilePrewrittenPr(params: {
	options: Pick<PrDescriptionOrchestrationOptions, "cwd" | "githubPr" | "progress">;
	pr: GithubPrDetails;
	metadata: PrewrittenPrMetadata;
}): Promise<PrDescriptionOrchestrationResult> {
	params.options.progress?.onProgress?.(
		`validating prewritten metadata for PR #${params.pr.number}`,
	);
	if (prewrittenMetadataMatches(params.pr.title, params.pr.body, params.metadata)) {
		return {
			type: "matched_prewritten",
			pr: params.pr,
			title: params.metadata.title,
			previewBody: params.metadata.body,
		};
	}

	params.options.progress?.onProgress?.(
		`updating PR #${params.pr.number} with prewritten metadata`,
	);
	const edited = await params.options.githubPr.editPr({
		cwd: params.options.cwd,
		number: params.pr.number,
		title: params.metadata.title,
		body: prewrittenFallbackBody(params.metadata.body),
	});
	if (edited.ok) {
		return {
			type: "updated",
			pr: params.pr,
			title: params.metadata.title,
			previewBody: params.metadata.body,
		};
	}

	return {
		type: "failed",
		pr: params.pr,
		reason: `Generated initial metadata, but failed to update PR #${params.pr.number} after Graphite created mismatched metadata.\n${edited.error.message}`,
		diagnostic: edited.error,
	};
}
