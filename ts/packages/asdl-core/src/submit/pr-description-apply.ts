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
	| { kind: "generate"; commits: PrCommitMessage[]; diff: string; metadata: PrDescriptionFingerprintMetadata }
	| { kind: "failed"; error: string };

export async function decidePrBodyOverwrite(params: {
	pr: GithubPrDetails;
	cwd: string;
	githubPr: GithubPrGateway;
	generation: Extract<PrDescriptionGenerationResolution, { ok: true }>;
	shouldForce?: boolean;
}): Promise<PrBodyOverwriteDecision> {
	const patchId = await params.githubPr.stablePatchIdForPr({ cwd: params.cwd, number: params.pr.number });
	if (!patchId.ok) {
		return { kind: "failed", error: patchId.error.message };
	}
	const metadata: PrDescriptionFingerprintMetadata = {
		version: "2",
		patchId: patchId.value.patchId,
		promptHash: hashPrDescriptionPrompt(params.generation.promptText),
		generator: PR_DESCRIPTION_GENERATOR_VERSION,
	};
	const parsedRegion = parseManagedGeneratedRegion(params.pr.body);
	if (params.shouldForce !== true && parsedRegion.type === "found" && fingerprintsMatch(parsedRegion.metadata, metadata)) {
		return { kind: "skip", patchId: patchId.value.patchId };
	}

	const commits = await params.githubPr.getPrCommitMessages({ cwd: params.cwd, number: params.pr.number });
	if (!commits.ok) {
		return { kind: "failed", error: commits.error.message };
	}

	return { kind: "generate", commits: commits.value, diff: patchId.value.diff, metadata };
}

export async function generatePrDescriptionForPr(
	pr: GithubPrDetails,
	commits: readonly PrCommitMessage[],
	options: PrDescriptionApplyOptions & { diff?: string },
): Promise<GeneratedPrDescriptionResult> {
	const generation = options.generation ?? await resolvePrDescriptionGeneration(options);
	if (!generation.ok) {
		return generation;
	}

	const diff = options.diff ?? await readPrDiff({ pr, options });
	if (typeof diff !== "string") return diff;

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
			diff,
		},
		...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
	});
	if (!prepared.ok) {
		return { ok: false, error: prepared.error };
	}
	return { ok: true, title: prepared.title, body: prepared.body, promptSource: generation.promptSource };
}

export async function applyGeneratedDescription(params: {
	pr: GithubPrDetails;
	commits: readonly PrCommitMessage[];
	diff?: string;
	metadata: PrDescriptionFingerprintMetadata;
	options: PrDescriptionApplyOptions;
}): Promise<{ ok: true; title: string; promptSource: PromptSource } | { ok: false; error: string; exitCode?: number }> {
	const prepared = await generatePrDescriptionForPr(params.pr, params.commits, { ...params.options, ...(params.diff === undefined ? {} : { diff: params.diff }) });
	if (!prepared.ok) return prepared;

	params.options.onProgress?.(`updating PR #${params.pr.number} description`);
	const edited = await params.options.githubPr.editPr({
		cwd: params.options.cwd,
		number: params.pr.number,
		title: prepared.title,
		body: replaceOrInsertGeneratedRegion(params.pr.body, prepared.body, params.metadata),
	});
	if (!edited.ok) {
		return { ok: false, error: `Generated a PR description, but failed to update PR #${params.pr.number}.\n${edited.error.message}` };
	}
	return { ok: true, title: prepared.title, promptSource: prepared.promptSource };
}

async function readPrDiff(params: {
	pr: GithubPrDetails;
	options: PrDescriptionApplyOptions;
}): Promise<string | { ok: false; error: string }> {
	params.options.onProgress?.(`reading PR #${params.pr.number} diff`);
	const diff = await params.options.githubPr.getPrDiff({ cwd: params.options.cwd, number: params.pr.number, baseRefName: params.pr.baseRefName, headRefName: params.pr.headRefName });
	if (!diff.ok) {
		return { ok: false, error: diff.error.message };
	}
	return diff.value;
}

function fingerprintsMatch(left: PrDescriptionFingerprintMetadata, right: PrDescriptionFingerprintMetadata): boolean {
	return left.version === right.version && left.patchId === right.patchId && left.promptHash === right.promptHash && left.generator === right.generator;
}
