import type { GitGateway } from "../git/index.ts";

import type { GithubPrDetails, GithubPrGateway, PrCommitMessage } from "./github-pr-gateway.ts";
import {
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
import type { TextGenerationGateway } from "./text-generation.ts";

export interface PrDescriptionApplyOptions {
	cwd: string;
	env: Record<string, string | undefined>;
	githubPr: GithubPrGateway;
	textGeneration: TextGenerationGateway;
	git: GitGateway;
	generation?: Extract<PrDescriptionGenerationResolution, { ok: true }>;
	onProgress?: (message: string) => void;
}

export type GeneratedPrDescriptionResult =
	| { ok: true; title: string; body: string; promptSource: PromptSource }
	| { ok: false; error: string; exitCode?: number };

export type PrBodyOverwriteDecision =
	| { kind: "skip"; patchId: string }
	| { kind: "generate"; commits: PrCommitMessage[]; metadata: PrDescriptionFingerprintMetadata }
	| { kind: "failed"; error: string };

export async function decidePrBodyOverwrite(params: {
	pr: GithubPrDetails;
	cwd: string;
	githubPr: GithubPrGateway;
	generation: Extract<PrDescriptionGenerationResolution, { ok: true }>;
	force?: boolean;
}): Promise<PrBodyOverwriteDecision> {
	const patchId = await params.githubPr.stablePatchIdForPr({ cwd: params.cwd, number: params.pr.number });
	if (!patchId.ok) {
		return { kind: "failed", error: patchId.error.message };
	}
	const metadata: PrDescriptionFingerprintMetadata = {
		version: "2",
		patchId: patchId.value,
		promptHash: hashPrDescriptionPrompt(params.generation.promptText),
		generator: PR_DESCRIPTION_GENERATOR_VERSION,
	};
	const parsedRegion = parseManagedGeneratedRegion(params.pr.body);
	if (params.force !== true && parsedRegion.type === "found" && fingerprintsMatch(parsedRegion.metadata, metadata)) {
		return { kind: "skip", patchId: patchId.value };
	}

	const commits = await params.githubPr.getPrCommitMessages({ cwd: params.cwd, number: params.pr.number });
	if (!commits.ok) {
		return { kind: "failed", error: commits.error.message };
	}

	return { kind: "generate", commits: commits.value, metadata };
}

export async function generatePrDescriptionForPr(
	pr: GithubPrDetails,
	commits: readonly PrCommitMessage[],
	options: PrDescriptionApplyOptions,
): Promise<GeneratedPrDescriptionResult> {
	const generation = options.generation ?? await resolvePrDescriptionGeneration(options);
	if (!generation.ok) {
		return generation;
	}

	options.onProgress?.(`reading PR #${pr.number} diff`);
	const diff = await options.githubPr.getPrDiff({ cwd: options.cwd, number: pr.number });
	if (!diff.ok) {
		return { ok: false, error: diff.error.message };
	}

	const prepared = await preparePrDescription({
		textGeneration: options.textGeneration,
		modelRef: generation.modelRef,
		promptText: generation.promptText,
		context: {
			kind: "github",
			number: pr.number,
			url: pr.url,
			title: pr.title,
			headRefName: pr.headRefName,
			baseRefName: pr.baseRefName,
			commitMessages: commits,
			diff: diff.value,
		},
		...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
	});
	if (!prepared.ok) {
		return { ok: false, error: prepared.error };
	}
	return { ok: true, title: prepared.title, body: prepared.body, promptSource: generation.promptSource };
}

export async function applyGeneratedDescription(
	pr: GithubPrDetails,
	commits: readonly PrCommitMessage[],
	metadata: PrDescriptionFingerprintMetadata,
	options: PrDescriptionApplyOptions,
): Promise<{ ok: true; title: string; promptSource: PromptSource } | { ok: false; error: string; exitCode?: number }> {
	const prepared = await generatePrDescriptionForPr(pr, commits, options);
	if (!prepared.ok) return prepared;

	options.onProgress?.(`updating PR #${pr.number} description`);
	const edited = await options.githubPr.editPr({
		cwd: options.cwd,
		number: pr.number,
		title: prepared.title,
		body: replaceOrInsertGeneratedRegion(pr.body, prepared.body, metadata),
	});
	if (!edited.ok) {
		return { ok: false, error: `Generated a PR description, but failed to update PR #${pr.number}.\n${edited.error.message}` };
	}
	return { ok: true, title: prepared.title, promptSource: prepared.promptSource };
}

function fingerprintsMatch(left: PrDescriptionFingerprintMetadata, right: PrDescriptionFingerprintMetadata): boolean {
	return left.version === right.version && left.patchId === right.patchId && left.promptHash === right.promptHash && left.generator === right.generator;
}
