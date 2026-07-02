import { renderResultBlock, renderResultBlockFromMessage } from "@sdl/core/cli-theme";
import {
	defineExtension,
	failed,
	ok,
	z,
	type SdlCommand,
	type SdlExtensionApi,
} from "@sdl/kernel/sdk";

import {
	applyRegeneratedPrDescription,
	createSdlPrDescriptionRuntime,
	formatPromptSourceLabel,
	prepareRegeneratedPrDescriptionForCurrentBranch,
	type RegeneratedPrDescription,
} from "../shared/pr-description.ts";
import { resolveFlowStreamCaps } from "../shared/phase-stream.ts";

const PR_DESCRIPTION_MODEL_ENV = "SDL_DEV_PR_DESCRIPTION_MODEL";
const PR_DESCRIPTION_PROMPT_ENV = "SDL_DEV_PR_DESCRIPTION_PROMPT";
const REPO_PR_DESCRIPTION_PROMPT_PATH = ".sdl/prompts/pr-description.md";
const DEFAULT_PR_DESCRIPTION_MODEL_REF = "openai-codex/gpt-5.4-mini";

const REGENERATE_PR_DESCRIPTION = `Regenerate the current branch PR title and SDL-managed generated body region.

The command reads the current branch PR with gh, generates fresh PR metadata from the PR diff and commit headlines, asks before editing GitHub, then updates the PR title and only the SDL-managed generated description region. Human-authored PR body text outside that managed region is preserved. The --force flag is accepted for compatibility and does not bypass confirmation.

Environment:
  ${PR_DESCRIPTION_MODEL_ENV}  Model reference for generated PR descriptions. Defaults to ${DEFAULT_PR_DESCRIPTION_MODEL_REF}.
  ${PR_DESCRIPTION_PROMPT_ENV}  Optional path to a custom PR description prompt. Overrides ${REPO_PR_DESCRIPTION_PROMPT_PATH} and the built-in prompt.`;

const regeneratePrSchema = z.object({
	force: z
		.boolean()
		.default(false)
		.describe("Compatibility no-op. Accepted for older workflows; does not bypass confirmation."),
});

type RegeneratePrRequest = z.output<typeof regeneratePrSchema>;

export const flowRegeneratePrCommand: SdlCommand<typeof regeneratePrSchema> = {
	name: "regenerate-pr",
	summary: "Regenerate the PR title and SDL-managed body region.",
	description: REGENERATE_PR_DESCRIPTION,
	schema: regeneratePrSchema,
	options: { force: { short: "-f" } },
	async run(ctx: SdlExtensionApi, request: RegeneratePrRequest) {
		// `regenerate-pr` is flow-local (no CCC, no streaming): it reads PR metadata, generates new
		// metadata, and reports one settled outcome whose body is domain-authored prose rather than a
		// single git/Graphite `ExecResult` transcript. So it renders through the shared finite
		// result block (success / failure / refusal), the same house-style block
		// `branch-latest-commit` uses — there is no per-step journey to stream and no subprocess
		// transcript to mine for cause markers. Spec: `.sdl/objectives/cli-ux-north-star/house-style.md`.
		const caps = resolveFlowStreamCaps(ctx);
		const runtime = createSdlPrDescriptionRuntime(ctx);
		const prepared = await prepareRegeneratedPrDescriptionForCurrentBranch({
			cwd: ctx.cwd,
			env: ctx.env,
			githubPr: runtime.githubPr,
			git: runtime.git,
			textGenerator: ctx.textGenerator,
		});
		if (!prepared.ok) {
			// PR lookup / diff / prompt / generation failure: the domain string already leads with a
			// summary sentence, so route its first line to the bold headline and the rest to the body
			// (house-style §7.1 "direct domain message"). The cause stays visible; GitHub was not edited.
			return failed(
				renderResultBlockFromMessage(caps, {
					kind: "failure",
					message: prepared.error === "" ? "Could not regenerate the PR." : prepared.error,
					cwd: ctx.cwd,
				}),
				prepared.exitCode ?? 1,
			);
		}

		// A missing confirmation channel is a declined guardrail, not a subprocess failure: render it
		// as a first-class warn refusal (house-style §7.3). No `gh pr edit` runs.
		if (ctx.confirm === undefined) {
			return failed(
				renderResultBlock(caps, {
					kind: "refusal",
					headline:
						"Confirmation is unavailable; PR metadata was generated but GitHub was not edited.",
					cwd: ctx.cwd,
				}),
				1,
			);
		}

		// Keep the confirmation body plain prose — confirmation surfaces are not guaranteed to render
		// ANSI, and the prompt is not a machine contract (house-style §7.3, plan PR 4 step 3).
		const confirmed = await ctx.confirm(
			"Regenerate PR metadata?",
			formatConfirmationMessage({ generated: prepared.value, force: request.force }),
		);
		if (!confirmed) {
			// Declined confirmation is a warn refusal: the user opted out, GitHub stays untouched.
			return failed(
				renderResultBlock(caps, {
					kind: "refusal",
					headline: "PR metadata regeneration was cancelled; GitHub was not edited.",
					cwd: ctx.cwd,
				}),
				1,
			);
		}

		const edited = await applyRegeneratedPrDescription({
			cwd: ctx.cwd,
			githubPr: runtime.githubPr,
			regenerated: prepared.value,
		});
		if (!edited.ok) {
			return failed(
				renderResultBlock(caps, {
					kind: "failure",
					headline: `Generated a PR description, but failed to update PR #${prepared.value.pr.number}.`,
					cwd: ctx.cwd,
					body: edited.error.trimEnd(),
				}),
				1,
			);
		}

		return ok(
			renderResultBlock(caps, {
				kind: "success",
				headline: "Regenerated PR title and description.",
				cwd: ctx.cwd,
				body: [
					`PR: #${prepared.value.pr.number} ${prepared.value.pr.url}`,
					`Title: ${prepared.value.title}`,
					`Prompt: ${formatPromptSourceLabel(prepared.value.promptSource)}`,
				].join("\n"),
			}),
		);
	},
};

export default defineExtension({
	commands: [flowRegeneratePrCommand],
});

function formatConfirmationMessage(input: {
	generated: RegeneratedPrDescription;
	force: boolean;
}): string {
	const lines = [
		`PR #${input.generated.pr.number}: ${input.generated.pr.url}`,
		`Current title: ${input.generated.pr.title}`,
		`New title: ${input.generated.title}`,
		"",
		"This will update the PR title and SDL-managed generated description region.",
	];
	if (input.force) {
		lines.push(
			"",
			"--force was provided, but it is a compatibility no-op and does not bypass confirmation.",
		);
	}
	return lines.join("\n");
}
