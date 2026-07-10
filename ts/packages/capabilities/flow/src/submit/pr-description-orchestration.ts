import type { GitGateway } from "@nseng-ai/capability-kit/git";
import type { TextGenerator } from "@nseng-ai/capability-kit/text-generation";
import type { ErrorInfo } from "@nseng-ai/foundation/result";

import type { GithubPrDetails, GithubPrGateway } from "./github-pr-gateway.ts";
import {
	appendGeneratedMarker,
	PR_DESCRIPTION_GENERATOR_VERSION,
	hashPrDescriptionPrompt,
	parseManagedGeneratedRegion,
	preparePrDescription,
	replaceOrInsertGeneratedRegion,
	resolvePrDescriptionGeneration,
	type PrDescriptionFingerprintMetadata,
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

export type PrDescriptionFingerprintPolicy = "skip-current" | "force";

export type PrDescriptionModelGenerationEvent =
	| { type: "started"; modelRef: string; prNumber: number }
	| { type: "finished"; modelRef: string; prNumber: number };

export interface PrDescriptionUpdateOptions {
	cwd: string;
	env: Record<string, string | undefined>;
	git: GitGateway;
	githubPr: GithubPrGateway;
	textGenerator: TextGenerator;
	pr: GithubPrDetails;
	generation?: Extract<PrDescriptionGenerationResolution, { ok: true }>;
	fingerprintPolicy?: PrDescriptionFingerprintPolicy;
	onProgress?: (message: string) => void;
	time?: TimeServices;
	onModelGeneration?: (event: PrDescriptionModelGenerationEvent) => void;
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

	options.onProgress?.(`checking PR #${pr.number} description fingerprint`);
	const patchId = await options.githubPr.stablePatchIdForPr({
		cwd: options.cwd,
		number: pr.number,
		...(pr.baseRefName === undefined ? {} : { baseRefName: pr.baseRefName }),
		...(pr.headRefName === undefined ? {} : { headRefName: pr.headRefName }),
	});
	if (!patchId.ok) {
		return { type: "failed", pr, reason: patchId.error.message, diagnostic: patchId.error };
	}

	const metadata: PrDescriptionFingerprintMetadata = {
		version: "2",
		patchId: patchId.value.patchId,
		promptHash: hashPrDescriptionPrompt(generation.promptText),
		generator: PR_DESCRIPTION_GENERATOR_VERSION,
	};
	const parsedRegion = parseManagedGeneratedRegion(pr.body);
	if (
		(options.fingerprintPolicy ?? "skip-current") === "skip-current" &&
		parsedRegion.type === "found" &&
		fingerprintsMatch(parsedRegion.metadata, metadata)
	) {
		options.onProgress?.(
			`skipping PR #${pr.number} description; generated fingerprint is unchanged`,
		);
		return {
			type: "skipped",
			pr,
			patchId: patchId.value.patchId,
			promptSource: generation.promptSource,
		};
	}

	options.onProgress?.(
		`recomputing PR #${pr.number} description (${formatFingerprintMismatchReason(parsedRegion.type)})`,
	);
	const commits = await options.githubPr.getPrCommitMessages({
		cwd: options.cwd,
		number: pr.number,
	});
	if (!commits.ok) {
		return { type: "failed", pr, reason: commits.error.message, diagnostic: commits.error };
	}

	options.onModelGeneration?.({
		type: "started",
		modelRef: generation.modelRef,
		prNumber: pr.number,
	});
	const prepared = await preparePrDescription({
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
		...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
		...(options.time === undefined ? {} : { time: options.time }),
	});
	options.onModelGeneration?.({
		type: "finished",
		modelRef: generation.modelRef,
		prNumber: pr.number,
	});
	if (!prepared.ok) return { type: "failed", pr, reason: prepared.error };

	return {
		type: "prepared",
		pr,
		title: prepared.title,
		mergedBody: replaceOrInsertGeneratedRegion(pr.body, prepared.body, metadata),
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
		githubPr: options.githubPr,
		textGenerator: options.textGenerator,
		pr,
		...(options.generation === undefined ? {} : { generation: options.generation }),
		fingerprintPolicy: prDescriptionFingerprintPolicyForForce(options.shouldForce === true),
		...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
		...(options.time === undefined ? {} : { time: options.time }),
		...(options.onModelGeneration === undefined
			? {}
			: { onModelGeneration: options.onModelGeneration }),
	});
	if (prepared.type === "failed") return prepared;
	if (prepared.type === "skipped") {
		return {
			type: "skipped",
			pr,
			patchId: prepared.patchId,
		};
	}

	options.onProgress?.(`updating PR #${pr.number} description`);
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
	options: Pick<PrDescriptionOrchestrationOptions, "cwd" | "githubPr" | "onProgress">;
	pr: GithubPrDetails;
	metadata: PrewrittenPrMetadata;
}): Promise<PrDescriptionOrchestrationResult> {
	params.options.onProgress?.(`validating prewritten metadata for PR #${params.pr.number}`);
	if (prMetadataMatches(params.pr.title, params.pr.body, params.metadata)) {
		return {
			type: "matched_prewritten",
			pr: params.pr,
			title: params.metadata.title,
			previewBody: params.metadata.body,
		};
	}

	params.options.onProgress?.(`updating PR #${params.pr.number} with prewritten metadata`);
	const edited = await params.options.githubPr.editPr({
		cwd: params.options.cwd,
		number: params.pr.number,
		title: params.metadata.title,
		body: appendGeneratedMarker(params.metadata.body),
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

function formatFingerprintMismatchReason(
	type: ReturnType<typeof parseManagedGeneratedRegion>["type"],
): string {
	switch (type) {
		case "missing":
			return "no generated fingerprint found";
		case "malformed":
			return "generated fingerprint is malformed";
		case "found":
			return "generated fingerprint changed";
	}
}

function prMetadataMatches(title: string, body: string, metadata: PrewrittenPrMetadata): boolean {
	return title.trim() === metadata.title.trim() && body.trim() === metadata.body.trim();
}

function fingerprintsMatch(
	left: PrDescriptionFingerprintMetadata,
	right: PrDescriptionFingerprintMetadata,
): boolean {
	return (
		left.version === right.version &&
		left.patchId === right.patchId &&
		left.promptHash === right.promptHash &&
		left.generator === right.generator
	);
}
