import type { GitGateway } from "../git/index.ts";

import type { GithubPrDetails, GithubPrGateway, PrCommitMessage } from "./github-pr-gateway.ts";
import {
	appendGeneratedMarker,
	preparePrDescription,
	resolvePrDescriptionGeneration,
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
}

export type GeneratedPrDescriptionResult =
	| { ok: true; title: string; body: string; promptSource: PromptSource }
	| { ok: false; error: string; exitCode?: number };

export type PrBodyOverwriteDecision =
	| { kind: "generate"; commits: PrCommitMessage[] }
	| { kind: "failed"; error: string };

export async function decidePrBodyOverwrite(params: {
	pr: GithubPrDetails;
	cwd: string;
	githubPr: GithubPrGateway;
}): Promise<PrBodyOverwriteDecision> {
	const commits = await params.githubPr.getPrCommitMessages({ cwd: params.cwd, number: params.pr.number });
	if (!commits.ok) {
		return { kind: "failed", error: commits.error.message };
	}

	return { kind: "generate", commits: commits.value };
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
	});
	if (!prepared.ok) {
		return { ok: false, error: prepared.error };
	}
	return { ok: true, title: prepared.title, body: prepared.body, promptSource: generation.promptSource };
}

export async function applyGeneratedDescription(
	pr: GithubPrDetails,
	commits: readonly PrCommitMessage[],
	options: PrDescriptionApplyOptions,
): Promise<{ ok: true; title: string; promptSource: PromptSource } | { ok: false; error: string; exitCode?: number }> {
	const prepared = await generatePrDescriptionForPr(pr, commits, options);
	if (!prepared.ok) return prepared;

	const edited = await options.githubPr.editPr({
		cwd: options.cwd,
		number: pr.number,
		title: prepared.title,
		body: appendGeneratedMarker(prepared.body),
	});
	if (!edited.ok) {
		return { ok: false, error: `Generated a PR description, but failed to update PR #${pr.number}.\n${edited.error.message}` };
	}
	return { ok: true, title: prepared.title, promptSource: prepared.promptSource };
}
