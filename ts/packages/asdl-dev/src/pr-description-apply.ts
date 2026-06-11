import type { GitGateway } from "./gateways/git.ts";
import type { GithubPrDetails, GithubPrGateway, PrCommitMessage } from "./gateways/github-pr.ts";
import {
	appendGeneratedMarker,
	hasGeneratedMarker,
	isCommitMessagePrefillBody,
	preparePrDescription,
	resolvePrDescriptionPrompt,
	type PromptSource,
} from "./pr-description.ts";
import { selectPrDescriptionTextGenerationConfig, type TextGenerationGateway } from "./text-generation.ts";

export interface PrDescriptionApplyOptions {
	cwd: string;
	env: Record<string, string | undefined>;
	githubPr: GithubPrGateway;
	textGeneration: TextGenerationGateway;
	git: GitGateway;
}

export type GeneratedPrDescriptionResult =
	| { ok: true; title: string; body: string; promptSource: PromptSource }
	| { ok: false; error: string; exitCode?: number };

export type PrBodyOverwriteDecision =
	| { kind: "generate"; commits: PrCommitMessage[] }
	| { kind: "skip_hand_edited" }
	| { kind: "failed"; error: string };

export async function decidePrBodyOverwrite(params: {
	pr: GithubPrDetails;
	shouldForce: boolean;
	cwd: string;
	githubPr: GithubPrGateway;
}): Promise<PrBodyOverwriteDecision> {
	const commits = await params.githubPr.getPrCommitMessages({ cwd: params.cwd, number: params.pr.number });
	if (!commits.ok) {
		return { kind: "failed", error: commits.error.message };
	}

	const body = params.pr.body;
	const isOverwritable =
		params.shouldForce || body.trim() === "" || hasGeneratedMarker(body) || isCommitMessagePrefillBody(body, commits.value);
	if (!isOverwritable) {
		return { kind: "skip_hand_edited" };
	}
	return { kind: "generate", commits: commits.value };
}

export async function generatePrDescriptionForPr(
	pr: GithubPrDetails,
	commits: readonly PrCommitMessage[],
	options: PrDescriptionApplyOptions,
): Promise<GeneratedPrDescriptionResult> {
	const modelConfig = selectPrDescriptionTextGenerationConfig(options.env);
	if (!modelConfig.ok) {
		return { ok: false, error: modelConfig.error, exitCode: 2 };
	}

	const repoRoot = await options.git.repoRoot({ cwd: options.cwd });
	const prompt = await resolvePrDescriptionPrompt({
		env: options.env,
		cwd: options.cwd,
		...(repoRoot.ok ? { repoRoot: repoRoot.value } : {}),
	});
	if (!prompt.ok) {
		return { ok: false, error: prompt.error, exitCode: 2 };
	}

	const diff = await options.githubPr.getPrDiff({ cwd: options.cwd, number: pr.number });
	if (!diff.ok) {
		return { ok: false, error: diff.error.message };
	}

	const prepared = await preparePrDescription({
		textGeneration: options.textGeneration,
		modelRef: modelConfig.value.modelRef,
		promptText: prompt.text,
		context: {
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
	return { ok: true, title: prepared.title, body: prepared.body, promptSource: prompt.source };
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
