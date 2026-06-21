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
import type { PreparedSubmitPrMetadata } from "./submit-pr-metadata-prewrite.ts";
import type { TextGenerationGateway } from "./text-generation.ts";

export type PrDescriptionTarget =
	| { type: "number"; number: number }
	| { type: "details"; pr: GithubPrDetails };

export interface PrDescriptionOrchestrationOptions {
	cwd: string;
	env: Record<string, string | undefined>;
	git: GitGateway;
	githubPr: GithubPrGateway;
	textGeneration: TextGenerationGateway;
	target: PrDescriptionTarget;
	generation?: Extract<PrDescriptionGenerationResolution, { ok: true }>;
	prewrittenMetadata?: PreparedSubmitPrMetadata;
	shouldForce?: boolean;
	onProgress?: (message: string) => void;
}

export type PrDescriptionOrchestrationResult =
	| {
			type: "matched";
			match: "generated_fingerprint";
			pr: GithubPrDetails;
			patchId: string;
	  }
	| { type: "matched"; match: "prewritten_metadata"; pr: GithubPrDetails }
	| { type: "updated"; source: "prewritten"; pr: GithubPrDetails; title: string }
	| { type: "generated"; pr: GithubPrDetails; title: string; promptSource: PromptSource }
	| { type: "failed"; pr?: GithubPrDetails; reason: string; exitCode?: number };

export async function orchestratePrDescription(
	options: PrDescriptionOrchestrationOptions,
): Promise<PrDescriptionOrchestrationResult> {
	const pr = await resolvePrDescriptionTarget(options);
	if (!pr.ok) return { type: "failed", reason: pr.error };

	if (options.prewrittenMetadata !== undefined) {
		return await reconcilePrewrittenPr({
			options,
			pr: pr.value,
			metadata: options.prewrittenMetadata,
		});
	}

	const generation = options.generation ?? (await resolvePrDescriptionGeneration(options));
	if (!generation.ok) {
		return {
			type: "failed",
			pr: pr.value,
			reason: generation.error,
			...(generation.exitCode === undefined ? {} : { exitCode: generation.exitCode }),
		};
	}

	options.onProgress?.(`checking PR #${pr.value.number} description fingerprint`);
	const patchId = await options.githubPr.stablePatchIdForPr({
		cwd: options.cwd,
		number: pr.value.number,
		...(pr.value.baseRefName === undefined ? {} : { baseRefName: pr.value.baseRefName }),
		...(pr.value.headRefName === undefined ? {} : { headRefName: pr.value.headRefName }),
	});
	if (!patchId.ok) return { type: "failed", pr: pr.value, reason: patchId.error.message };

	const metadata: PrDescriptionFingerprintMetadata = {
		version: "2",
		patchId: patchId.value.patchId,
		promptHash: hashPrDescriptionPrompt(generation.promptText),
		generator: PR_DESCRIPTION_GENERATOR_VERSION,
	};
	const parsedRegion = parseManagedGeneratedRegion(pr.value.body);
	if (
		options.shouldForce !== true &&
		parsedRegion.type === "found" &&
		fingerprintsMatch(parsedRegion.metadata, metadata)
	) {
		return {
			type: "matched",
			match: "generated_fingerprint",
			pr: pr.value,
			patchId: patchId.value.patchId,
		};
	}

	const commits = await options.githubPr.getPrCommitMessages({
		cwd: options.cwd,
		number: pr.value.number,
	});
	if (!commits.ok) return { type: "failed", pr: pr.value, reason: commits.error.message };

	const prepared = await preparePrDescription({
		textGeneration: options.textGeneration,
		modelRef: generation.modelRef,
		promptText: generation.promptText,
		context: {
			kind: "github",
			number: pr.value.number,
			url: pr.value.url,
			title: pr.value.title,
			headRefName: pr.value.headRefName,
			baseRefName: pr.value.baseRefName,
			commitMessages: commits.value,
			diff: patchId.value.diff,
		},
		...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
	});
	if (!prepared.ok) return { type: "failed", pr: pr.value, reason: prepared.error };

	options.onProgress?.(`updating PR #${pr.value.number} description`);
	const edited = await options.githubPr.editPr({
		cwd: options.cwd,
		number: pr.value.number,
		title: prepared.title,
		body: replaceOrInsertGeneratedRegion(pr.value.body, prepared.body, metadata),
	});
	if (!edited.ok) {
		return {
			type: "failed",
			pr: pr.value,
			reason: `Generated a PR description, but failed to update PR #${pr.value.number}.\n${edited.error.message}`,
		};
	}

	return {
		type: "generated",
		pr: pr.value,
		title: prepared.title,
		promptSource: generation.promptSource,
	};
}

async function resolvePrDescriptionTarget(
	options: Pick<PrDescriptionOrchestrationOptions, "cwd" | "githubPr" | "target">,
): Promise<{ ok: true; value: GithubPrDetails } | { ok: false; error: string }> {
	if (options.target.type === "details") return { ok: true, value: options.target.pr };
	const viewed = await options.githubPr.viewPr({ cwd: options.cwd, number: options.target.number });
	if (!viewed.ok) return { ok: false, error: viewed.error.message };
	return { ok: true, value: viewed.value };
}

async function reconcilePrewrittenPr(params: {
	options: Pick<PrDescriptionOrchestrationOptions, "cwd" | "githubPr" | "onProgress">;
	pr: GithubPrDetails;
	metadata: PreparedSubmitPrMetadata;
}): Promise<PrDescriptionOrchestrationResult> {
	params.options.onProgress?.(`validating prewritten metadata for PR #${params.pr.number}`);
	if (prMetadataMatches(params.pr.title, params.pr.body, params.metadata)) {
		return { type: "matched", match: "prewritten_metadata", pr: params.pr };
	}

	params.options.onProgress?.(`updating PR #${params.pr.number} with prewritten metadata`);
	const edited = await params.options.githubPr.editPr({
		cwd: params.options.cwd,
		number: params.pr.number,
		title: params.metadata.title,
		body: appendGeneratedMarker(params.metadata.body),
	});
	if (edited.ok) {
		return { type: "updated", source: "prewritten", pr: params.pr, title: params.metadata.title };
	}

	return {
		type: "failed",
		pr: params.pr,
		reason: `Generated initial metadata, but failed to update PR #${params.pr.number} after Graphite created mismatched metadata.\n${edited.error.message}`,
	};
}

function prMetadataMatches(
	title: string,
	body: string,
	metadata: PreparedSubmitPrMetadata,
): boolean {
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
