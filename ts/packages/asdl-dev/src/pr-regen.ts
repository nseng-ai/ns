import type { GitGateway } from "@asdl/core/git";

import type { GithubPrGateway } from "./gateways/github-pr.ts";
import { applyGeneratedDescription, decidePrBodyOverwrite } from "./pr-description-apply.ts";
import type { PromptSource } from "./pr-description.ts";
import type { TextGenerationGateway } from "./text-generation.ts";

export interface RunPrRegenCommandOptions {
	cwd: string;
	env: Record<string, string | undefined>;
	githubPr: GithubPrGateway;
	textGeneration: TextGenerationGateway;
	git: GitGateway;
	shouldForce: boolean;
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

	const decision = await decidePrBodyOverwrite({
		pr: pr.value,
		shouldForce: options.shouldForce,
		cwd: options.cwd,
		githubPr: options.githubPr,
	});
	if (decision.kind === "failed") {
		return failure(1, decision.error);
	}
	const applied = await applyGeneratedDescription(pr.value, decision.commits, options);
	if (!applied.ok) {
		return failure(applied.exitCode ?? 1, applied.error);
	}

	return success(
		[
			"Regenerated PR description.",
			`PR: #${pr.value.number} ${pr.value.url}`,
			`Title: ${applied.title}`,
			`Prompt: ${formatPromptSourceLabel(applied.promptSource)}`,
		].join("\n"),
	);
}

function formatPromptSourceLabel(source: PromptSource): string {
	return source.type === "builtin" ? "built-in" : source.path;
}

function success(stdout: string): PrRegenCommandResult {
	return { exitCode: 0, stdout: stdout.endsWith("\n") ? stdout : `${stdout}\n`, stderr: "" };
}

function failure(exitCode: number, stderr: string): PrRegenCommandResult {
	return { exitCode, stdout: "", stderr: stderr.endsWith("\n") ? stderr : `${stderr}\n` };
}
