import { RealGitGateway } from "@sdl/core/git";
import {
	DEFAULT_PR_DESCRIPTION_MODEL_REF,
	orchestratePrDescription,
	PR_DESCRIPTION_MODEL_ENV,
	PR_DESCRIPTION_PROMPT_ENV,
	RealGithubPrGateway,
	REPO_PR_DESCRIPTION_PROMPT_PATH,
	type PromptSource,
} from "@sdl/core/submit";

import { failed, ok, z, type SdlCommand, type SdlContext } from "../sdk.ts";
import { createSdlCommandRunner, SdlCommandExecApi } from "./command-runner.ts";

const regeneratePrSchema = z.object({
	force: z
		.boolean()
		.default(false)
		.describe(
			"Compatibility flag from older guarded PR regeneration workflows; regenerate-pr now always replaces the PR body.",
		),
});

export const defaultRegeneratePrCommand = {
	name: "regenerate-pr",
	description: `Regenerate the current branch PR's title and description with the sdl PR-description prompt.

By default this regenerates both the PR title and body, replacing any existing body. The --force flag is accepted for compatibility with older guarded PR regeneration workflows.

Environment:
  ${PR_DESCRIPTION_MODEL_ENV}  Model reference for the generated PR description. Defaults to ${DEFAULT_PR_DESCRIPTION_MODEL_REF}.
  ${PR_DESCRIPTION_PROMPT_ENV}  Prompt file path. Overrides ${REPO_PR_DESCRIPTION_PROMPT_PATH} and the built-in prompt.

The command owns its output and exit code. It does not support --format.`,
	schema: regeneratePrSchema,
	async run(ctx: SdlContext, _request: z.output<typeof regeneratePrSchema>) {
		const runner = createSdlCommandRunner(ctx);
		const githubPr = new RealGithubPrGateway(runner);
		const git = new RealGitGateway(new SdlCommandExecApi(ctx));
		const pr = await githubPr.viewCurrentBranchPr({ cwd: ctx.cwd });
		if (!pr.ok) {
			const message = `Could not resolve current branch PR.\n${pr.error.message}\n`;
			ctx.stderr?.(message);
			return failed("", 1);
		}

		const result = await orchestratePrDescription({
			cwd: ctx.cwd,
			env: ctx.env,
			git,
			githubPr,
			textGeneration: ctx.model,
			target: { type: "details", pr: pr.value },
			shouldForce: true,
		});
		if (result.type === "failed") {
			ctx.stderr?.(ensureTrailingNewline(result.reason));
			return failed("", result.exitCode ?? 1);
		}
		if (result.type === "matched" && result.match === "generated_fingerprint") {
			ctx.stdout?.(
				`PR title and description are already up to date.\nPR: #${pr.value.number} ${pr.value.url}\n`,
			);
			return ok("");
		}
		if (result.type !== "generated") {
			ctx.stderr?.("PR title and description were not regenerated.\n");
			return failed("", 1);
		}

		ctx.stdout?.(
			[
				"Regenerated PR title and description.",
				`PR: #${pr.value.number} ${pr.value.url}`,
				`Title: ${result.title}`,
				`Prompt: ${formatPromptSourceLabel(result.promptSource)}`,
			].join("\n") + "\n",
		);
		return ok("");
	},
} satisfies SdlCommand<typeof regeneratePrSchema>;

function formatPromptSourceLabel(source: PromptSource): string {
	return source.type === "builtin" ? "built-in" : source.path;
}

function ensureTrailingNewline(text: string): string {
	return text.endsWith("\n") ? text : `${text}\n`;
}
