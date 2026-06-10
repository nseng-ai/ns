import type { GitGateway } from "./gateways/git.ts";
import type { GithubPrDetails, GithubPrGateway } from "./gateways/github-pr.ts";
import { appendGeneratedMarker, hasGeneratedMarker, preparePrDescription, resolvePrDescriptionPrompt } from "./pr-description.ts";
import { selectPrDescriptionTextGenerationConfig, type TextGenerationGateway } from "./text-generation.ts";

export interface PrDescriptionApplyOptions {
	cwd: string;
	env: Record<string, string | undefined>;
	githubPr: GithubPrGateway;
	textGeneration: TextGenerationGateway;
	git: GitGateway;
}

export type GeneratedPrDescriptionResult = { ok: true; title: string; body: string } | { ok: false; error: string; exitCode?: number };

export function canOverwriteBody(body: string, shouldForce: boolean): boolean {
	return shouldForce || body.trim() === "" || hasGeneratedMarker(body);
}

export async function generatePrDescriptionForPr(
	pr: GithubPrDetails,
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

	const [commits, diff] = await Promise.all([
		options.githubPr.getPrCommitMessages({ cwd: options.cwd, number: pr.number }),
		options.githubPr.getPrDiff({ cwd: options.cwd, number: pr.number }),
	]);
	if (!commits.ok) {
		return { ok: false, error: commits.error.message };
	}
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
			commitMessages: commits.value,
			diff: diff.value,
		},
	});
	if (!prepared.ok) {
		return { ok: false, error: prepared.error };
	}
	return { ok: true, title: prepared.title, body: prepared.body };
}

export async function applyGeneratedDescription(
	pr: GithubPrDetails,
	options: PrDescriptionApplyOptions,
): Promise<{ ok: true; title: string } | { ok: false; error: string; exitCode?: number }> {
	const prepared = await generatePrDescriptionForPr(pr, options);
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
	return { ok: true, title: prepared.title };
}
