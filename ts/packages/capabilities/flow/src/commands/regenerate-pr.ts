import {
	applyRegeneratedPrDescription,
	createSdlPrDescriptionRuntime,
	formatPromptSourceLabel,
	prepareRegeneratedPrDescriptionForCurrentBranch,
	type RegeneratedPrDescription,
} from "../shared/pr-description.ts";
import { defineExtension, failed, ok, z, type SdlCommand, type SdlExtensionApi } from "sdl-sdk";

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
	async run(ctx: SdlExtensionApi, request: RegeneratePrRequest) {
		const runtime = createSdlPrDescriptionRuntime(ctx);
		const prepared = await prepareRegeneratedPrDescriptionForCurrentBranch({
			cwd: ctx.cwd,
			env: ctx.env,
			githubPr: runtime.githubPr,
			git: runtime.git,
			textGenerator: ctx.textGenerator,
		});
		if (!prepared.ok) {
			return failed(prepared.error, prepared.exitCode ?? 1);
		}

		if (ctx.confirm === undefined) {
			return failed(
				"Confirmation is unavailable; PR metadata was generated but GitHub was not edited.",
				1,
			);
		}

		const confirmed = await ctx.confirm(
			"Regenerate PR metadata?",
			formatConfirmationMessage({ generated: prepared.value, force: request.force }),
		);
		if (!confirmed) {
			return failed("PR metadata regeneration was cancelled; GitHub was not edited.", 1);
		}

		const edited = await applyRegeneratedPrDescription({
			cwd: ctx.cwd,
			githubPr: runtime.githubPr,
			regenerated: prepared.value,
		});
		if (!edited.ok) {
			return failed(
				`Generated a PR description, but failed to update PR #${prepared.value.pr.number}.\n${edited.error}`,
				1,
			);
		}

		return ok(
			[
				"Regenerated PR title and description.",
				`PR: #${prepared.value.pr.number} ${prepared.value.pr.url}`,
				`Title: ${prepared.value.title}`,
				`Prompt: ${formatPromptSourceLabel(prepared.value.promptSource)}`,
			].join("\n"),
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
