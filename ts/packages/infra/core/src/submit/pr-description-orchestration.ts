import type { GitGateway } from "../git/index.ts";

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
} from "./pr-description.ts";
import type { TextGenerator } from "./text-generation.ts";

export interface PrewrittenPrMetadata {
	branch: string;
	parentBranch: string;
	title: string;
	body: string;
	commitRange: string;
	promptSource: PromptSource;
}

export interface PrDescriptionOrchestrationOptions {
	cwd: string;
	env: Record<string, string | undefined>;
	git: GitGateway;
	githubPr: GithubPrGateway;
	textGenerator: TextGenerator;
	pr: GithubPrDetails;
	generation?: Extract<PrDescriptionGenerationResolution, { ok: true }>;
	prewrittenMetadata?: PrewrittenPrMetadata;
	shouldForce?: boolean;
	onProgress?: (message: string) => void;
}

export type PrDescriptionOrchestrationResult =
	| { type: "skipped"; pr: GithubPrDetails; patchId: string }
	| { type: "matched_prewritten"; pr: GithubPrDetails }
	| { type: "updated"; pr: GithubPrDetails; title: string }
	| { type: "generated"; pr: GithubPrDetails; title: string; promptSource: PromptSource }
	| { type: "failed"; pr?: GithubPrDetails; reason: string; exitCode?: number };

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
	if (!patchId.ok) return { type: "failed", pr, reason: patchId.error.message };

	const metadata: PrDescriptionFingerprintMetadata = {
		version: "2",
		patchId: patchId.value.patchId,
		promptHash: hashPrDescriptionPrompt(generation.promptText),
		generator: PR_DESCRIPTION_GENERATOR_VERSION,
	};
	const parsedRegion = parseManagedGeneratedRegion(pr.body);
	if (
		options.shouldForce !== true &&
		parsedRegion.type === "found" &&
		fingerprintsMatch(parsedRegion.metadata, metadata)
	) {
		return {
			type: "skipped",
			pr,
			patchId: patchId.value.patchId,
		};
	}

	const commits = await options.githubPr.getPrCommitMessages({
		cwd: options.cwd,
		number: pr.number,
	});
	if (!commits.ok) return { type: "failed", pr, reason: commits.error.message };

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
	});
	if (!prepared.ok) return { type: "failed", pr, reason: prepared.error };

	options.onProgress?.(`updating PR #${pr.number} description`);
	const edited = await options.githubPr.editPr({
		cwd: options.cwd,
		number: pr.number,
		title: prepared.title,
		body: replaceOrInsertGeneratedRegion(pr.body, prepared.body, metadata),
	});
	if (!edited.ok) {
		return {
			type: "failed",
			pr,
			reason: `Generated a PR description, but failed to update PR #${pr.number}.\n${edited.error.message}`,
		};
	}

	return {
		type: "generated",
		pr,
		title: prepared.title,
		promptSource: generation.promptSource,
	};
}

async function reconcilePrewrittenPr(params: {
	options: Pick<PrDescriptionOrchestrationOptions, "cwd" | "githubPr" | "onProgress">;
	pr: GithubPrDetails;
	metadata: PrewrittenPrMetadata;
}): Promise<PrDescriptionOrchestrationResult> {
	params.options.onProgress?.(`validating prewritten metadata for PR #${params.pr.number}`);
	if (prMetadataMatches(params.pr.title, params.pr.body, params.metadata)) {
		return { type: "matched_prewritten", pr: params.pr };
	}

	params.options.onProgress?.(`updating PR #${params.pr.number} with prewritten metadata`);
	const edited = await params.options.githubPr.editPr({
		cwd: params.options.cwd,
		number: params.pr.number,
		title: params.metadata.title,
		body: appendGeneratedMarker(params.metadata.body),
	});
	if (edited.ok) {
		return { type: "updated", pr: params.pr, title: params.metadata.title };
	}

	return {
		type: "failed",
		pr: params.pr,
		reason: `Generated initial metadata, but failed to update PR #${params.pr.number} after Graphite created mismatched metadata.\n${edited.error.message}`,
	};
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
