import { MODEL_OPERATION_IDS } from "@nseng-ai/capability-kit/model-policy";
import { createNsClinkrInteraction } from "@nseng-ai/capability-kit";
import { confirmInteractiveOrUsageError } from "@nseng-ai/clinkr";
import { renderResultBlock, renderResultBlockFromMessage } from "@nseng-ai/foundation/cli-theme";
import { commandIoFromNsExtensionApi, runWithNsCommandIo } from "@nseng-ai/sdk/command-io";
import {
	defineCommand,
	negative,
	ok,
	usageError,
	z,
	type NsCommand,
	type NsExtensionApi,
} from "@nseng-ai/sdk";

import { resolveFlowStreamCaps } from "../../phase-stream/phase-stream.ts";
import {
	applyPreparedPrMetadataReplacement,
	createNsPrDescriptionRuntime,
	formatPromptSourceLabel,
	preparePrMetadataReplacementForCurrentBranch,
	PR_DESCRIPTION_PROMPT_ENV,
	REPO_PR_DESCRIPTION_PROMPT_PATH,
	type PreparedPrMetadataReplacement,
	type PrMetadataReplacementResult,
} from "../../submit/index.ts";
import { flowExtensionDescriptorSource } from "../extension.ts";
import { resolveFlowModelSelection } from "../model-policy.ts";

const REGENERATE_PR_DESCRIPTION = `Regenerate and completely replace the current branch PR title and body.

The command reads the current branch PR with gh, generates fresh PR metadata from the PR diff and commit headlines, then replaces the complete PR title and body. All existing body content is removed, including human prose and other ns-managed regions. By default it asks before editing GitHub. Use --yes/-y to approve the destructive replacement non-interactively.

Environment:
  ${PR_DESCRIPTION_PROMPT_ENV}  Optional path to a custom PR description prompt. Overrides ${REPO_PR_DESCRIPTION_PROMPT_PATH} and the built-in prompt.`;

const regeneratePrSchema = z.object({
	yes: z
		.boolean()
		.default(false)
		.describe("Replace the complete PR title and body without prompting."),
});

type RegeneratePrRequest = z.output<typeof regeneratePrSchema>;

export const flowRegeneratePrCommand: NsCommand<typeof regeneratePrSchema> = defineCommand({
	name: "regenerate-pr",
	summary: "Regenerate and replace the complete PR title and body.",
	description: REGENERATE_PR_DESCRIPTION,
	schema: regeneratePrSchema,
	resultSchema: z.string(),
	options: { yes: { short: "-y" } },
	handler: async (ctx: NsExtensionApi, request: RegeneratePrRequest) => {
		return await runWithNsCommandIo(commandIoFromNsExtensionApi(ctx), async (io) => {
			const caps = resolveFlowStreamCaps(ctx);
			const runtime = createNsPrDescriptionRuntime(ctx);
			const model = await resolveFlowModelSelection(ctx, MODEL_OPERATION_IDS.flowPrDescription);
			if (!model.ok) {
				return negative(
					renderResultBlockFromMessage(caps, {
						kind: "failure",
						message: model.error,
						cwd: ctx.cwd,
					}),
				);
			}

			io.phase("Preparing complete PR metadata replacement…");
			const prepared: PrMetadataReplacementResult =
				await preparePrMetadataReplacementForCurrentBranch({
					cwd: ctx.cwd,
					env: ctx.env,
					githubPr: runtime.githubPr,
					git: runtime.git,
					descriptorSource: flowExtensionDescriptorSource,
					modelSelection: model.modelSelection,
					textGenerator: ctx.textGenerator,
					source: "regenerate-pr",
					progress: { onProgress: (message) => io.phase(message) },
				});
			if (prepared.type === "failed") {
				return negative(
					renderResultBlockFromMessage(caps, {
						kind: "failure",
						message: prepared.reason === "" ? "Could not regenerate the PR." : prepared.reason,
						cwd: ctx.cwd,
					}),
				);
			}

			if (!request.yes) {
				const confirmationMessage = formatConfirmationMessage({ generated: prepared });
				const confirmation = await confirmInteractiveOrUsageError(
					createNsClinkrInteraction(ctx, {
						title: "Replace complete PR metadata and remove all existing body content?",
						formatMessage: () => confirmationMessage,
					}),
					{
						nonInteractive: {
							message:
								"Confirmation is unavailable; pass --yes to replace the complete PR title and body non-interactively.",
							missingFlag: "--yes",
							howToSupply: "Pass --yes/-y to approve the complete replacement without prompting.",
						},
						confirmation: { message: confirmationMessage, defaultAnswer: "no" },
					},
				);
				if ("errorType" in confirmation) {
					return usageError(confirmation.message, confirmation.data);
				}
				if (confirmation.type !== "confirmed") {
					return negative(
						renderResultBlock(caps, {
							kind: "refusal",
							headline: "PR metadata replacement was cancelled; GitHub was not edited.",
							cwd: ctx.cwd,
						}),
					);
				}
			}

			io.phase(`Replacing PR #${prepared.pr.number} title and body on GitHub…`);
			const edited = await applyPreparedPrMetadataReplacement({
				cwd: ctx.cwd,
				githubPr: runtime.githubPr,
				replacement: prepared,
			});
			if (!edited.ok) {
				return negative(
					renderResultBlock(caps, {
						kind: "failure",
						headline: `Generated PR metadata, but failed to update PR #${prepared.pr.number}.`,
						cwd: ctx.cwd,
						body: edited.reason.trimEnd(),
					}),
				);
			}

			return ok(
				renderResultBlock(caps, {
					kind: "success",
					headline: "Replaced complete PR title and body.",
					cwd: ctx.cwd,
					body: [
						`PR: #${prepared.pr.number} ${prepared.pr.url}`,
						`Title: ${prepared.title}`,
						`Prompt: ${formatPromptSourceLabel(prepared.promptSource)}`,
					].join("\n"),
				}),
			);
		});
	},
});

export default flowRegeneratePrCommand;

function formatConfirmationMessage(input: { generated: PreparedPrMetadataReplacement }): string {
	return [
		`PR #${input.generated.pr.number}: ${input.generated.pr.url}`,
		`Current title: ${input.generated.pr.title}`,
		`New title: ${input.generated.title}`,
		`Prompt: ${formatPromptSourceLabel(input.generated.promptSource)}`,
		"",
		"This replaces the complete PR title and body.",
		"All existing PR body content will be removed, including human prose and other ns-managed regions.",
	].join("\n");
}
