import type { GitGateway } from "./gateways/git.ts";
import type { GithubPrGateway } from "./gateways/github-pr.ts";
import { applyGeneratedDescription, canOverwriteBody } from "./pr-description-apply.ts";
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

	if (!canOverwriteBody(pr.value.body, options.shouldForce)) {
		return failure(
			1,
			[
				`Refusing to overwrite PR #${pr.value.number} because its body does not contain the asdl generated-body marker.`,
				"Run `asdl-dev pr-regen --force` to overwrite a manually edited body.",
			].join("\n"),
		);
	}

	const applied = await applyGeneratedDescription(pr.value, options);
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
