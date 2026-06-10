import type { GitGateway } from "./gateways/git.ts";
import type { GithubPrGateway, GithubPrDetails } from "./gateways/github-pr.ts";
import {
	appendGeneratedMarker,
	hasGeneratedMarker,
	preparePrDescription,
	resolvePrDescriptionPrompt,
	type PrDescriptionCommitMessage,
} from "./pr-description.ts";
import { selectPrDescriptionTextGenerationConfig, type TextGenerationGateway } from "./text-generation.ts";

export interface RunPrRegenCommandOptions {
	cwd: string;
	env: Record<string, string | undefined>;
	githubPr: GithubPrGateway;
	textGeneration: TextGenerationGateway;
	git: GitGateway;
	force: boolean;
}

export interface PrRegenCommandResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

export async function runPrRegenCommand(options: RunPrRegenCommandOptions): Promise<PrRegenCommandResult> {
	const pr = await options.githubPr.viewCurrentBranchPr({ cwd: options.cwd });
	if (!pr.ok) {
		return failure(1, `Could not resolve current branch PR.\n${pr.error.message}`);
	}

	if (!canOverwriteBody(pr.value.body, options.force)) {
		return failure(
			1,
			[
				`Refusing to overwrite PR #${pr.value.number} because its body does not contain the asdl generated-body marker.`,
				"Run `asdl-dev pr-regen --force` to overwrite a manually edited body.",
			].join("\n"),
		);
	}

	const prepared = await generatePrDescriptionForPr(pr.value, options);
	if (!prepared.ok) {
		return failure(prepared.exitCode ?? 1, prepared.error);
	}

	const updatedBody = appendGeneratedMarker(prepared.body);
	const edited = await options.githubPr.editPr({ cwd: options.cwd, number: pr.value.number, title: prepared.title, body: updatedBody });
	if (!edited.ok) {
		return failure(1, `Generated a PR description, but failed to update PR #${pr.value.number}.\n${edited.error.message}`);
	}

	return success(["Regenerated PR description.", `PR: #${pr.value.number} ${pr.value.url}`, `Title: ${prepared.title}`].join("\n"));
}

export async function generatePrDescriptionForPr(
	pr: GithubPrDetails,
	options: Pick<RunPrRegenCommandOptions, "cwd" | "env" | "githubPr" | "textGeneration" | "git">,
): Promise<{ ok: true; title: string; body: string } | { ok: false; error: string; exitCode?: number }> {
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

	const commits = await options.githubPr.getPrCommitMessages({ cwd: options.cwd, number: pr.number });
	if (!commits.ok) {
		return { ok: false, error: commits.error.message };
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
			commitMessages: commits.value as readonly PrDescriptionCommitMessage[],
			diff: diff.value,
		},
	});
	if (!prepared.ok) {
		return { ok: false, error: prepared.error };
	}
	return { ok: true, title: prepared.title, body: prepared.body };
}

function canOverwriteBody(body: string, force: boolean): boolean {
	return force || body.trim() === "" || hasGeneratedMarker(body);
}

function success(stdout: string): PrRegenCommandResult {
	return { exitCode: 0, stdout: stdout.endsWith("\n") ? stdout : `${stdout}\n`, stderr: "" };
}

function failure(exitCode: number, stderr: string): PrRegenCommandResult {
	return { exitCode, stdout: "", stderr: stderr.endsWith("\n") ? stderr : `${stderr}\n` };
}
