import { MODEL_OPERATION_IDS } from "@nseng-ai/extension-kit/model-policy";
import { createNsClinkrInteraction } from "@nseng-ai/extension-kit";
import { confirmInteractiveOrUsageError } from "@nseng-ai/clinkr";
import {
	renderResultBlock,
	renderResultBlockFromMessage,
	resolveThemeCaps,
} from "@nseng-ai/foundation/cli-theme";
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
	createNsPrInventoryRuntime,
	formatPromptSourceLabel,
	preparePrMetadataReplacementForCurrentBranch,
	type PrMetadataReplacementResult,
} from "../../submit/index.ts";
import { flowExtensionDescriptorSource } from "../extension.ts";
import { resolveFlowModelSelection } from "../model-policy.ts";
import { createTextPhaseProgress } from "../../phase-stream/text-phase-progress.ts";

const generatePrInventorySchema = z.object({
	yes: z
		.boolean()
		.default(false)
		.describe("Generate and replace the complete PR title and body without prompting."),
});

type GeneratePrInventoryRequest = z.output<typeof generatePrInventorySchema>;

const generatePrInventoryResultSchema = z.object({
	cwd: z.string(),
	pr: z.object({ number: z.number().int().positive(), url: z.string() }),
	title: z.string(),
	promptSource: z.string(),
});

export const flowGeneratePrInventoryCommand: NsCommand<typeof generatePrInventorySchema> =
	defineCommand({
		schema: generatePrInventorySchema,
		resultSchema: generatePrInventoryResultSchema,
		options: { yes: { short: "-y" } },
		renderHuman: (result, caps) =>
			renderResultBlock(resolveThemeCaps(caps), {
				kind: "success",
				headline: "Replaced complete PR title and body.",
				cwd: result.cwd,
				body: [
					`PR: #${result.pr.number} ${result.pr.url}`,
					`Title: ${result.title}`,
					`Prompt: ${result.promptSource}`,
				].join("\n"),
			}),
		handler: async (ctx: NsExtensionApi, request: GeneratePrInventoryRequest) => {
			const progress = createTextPhaseProgress(ctx, {
				title: "ns flow generate-pr-inventory",
				phases: [
					{ key: "prepare", name: "Prepare", label: "Preparing complete PR metadata replacement…" },
					{ key: "generate", name: "Generate", label: "Generating PR inventory…" },
					{ key: "replace", name: "Replace", label: "Replacing PR title and body on GitHub…" },
				],
			});
			const commandResult = await runWithNsCommandIo(commandIoFromNsExtensionApi(ctx), async () => {
				const caps = resolveFlowStreamCaps(ctx);
				if (!request.yes) {
					const confirmationMessage = [
						"This generates a fresh PR inventory with the configured model, then replaces the complete PR title and body.",
						"All existing PR body content will be removed, including human prose and other ns-managed regions.",
					].join("\n");
					const confirmation = await confirmInteractiveOrUsageError(
						createNsClinkrInteraction(ctx, {
							title: "Generate and replace complete PR metadata?",
							formatMessage: () => confirmationMessage,
						}),
						{
							nonInteractive: {
								message:
									"Confirmation is unavailable; pass --yes to generate and replace the complete PR title and body non-interactively.",
								missingFlag: "--yes",
								howToSupply:
									"Pass --yes/-y to approve generation and complete replacement without prompting.",
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
								headline:
									"PR inventory generation and metadata replacement were cancelled; no model or GitHub request was made.",
								cwd: ctx.cwd,
							}),
						);
					}
				}

				const runtime = createNsPrInventoryRuntime(ctx);
				const model = await resolveFlowModelSelection(ctx, MODEL_OPERATION_IDS.flowPrInventory);
				if (!model.ok) {
					return negative(
						renderResultBlockFromMessage(caps, {
							kind: "failure",
							message: model.error,
							cwd: ctx.cwd,
						}),
					);
				}

				progress.phase("prepare", "Preparing complete PR metadata replacement…");
				const prepared: PrMetadataReplacementResult =
					await preparePrMetadataReplacementForCurrentBranch({
						cwd: ctx.cwd,
						env: ctx.env,
						githubPr: runtime.githubPr,
						git: runtime.git,
						descriptorSource: flowExtensionDescriptorSource,
						modelSelection: model.modelSelection,
						textGenerator: ctx.textGenerator,
						source: "generate-pr-inventory",
						progress: { onProgress: (message) => progress.phase("generate", message) },
					});
				if (prepared.type === "failed") {
					return negative(
						renderResultBlockFromMessage(caps, {
							kind: "failure",
							message:
								prepared.reason === "" ? "Could not generate the PR inventory." : prepared.reason,
							cwd: ctx.cwd,
						}),
					);
				}

				progress.phase("replace", `Replacing PR #${prepared.pr.number} title and body on GitHub…`);
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

				return ok({
					cwd: ctx.cwd,
					pr: { number: prepared.pr.number, url: prepared.pr.url },
					title: prepared.title,
					promptSource: formatPromptSourceLabel(prepared.promptSource),
				});
			});
			progress.finish(commandResult.status !== "success");
			return commandResult;
		},
	});

export default flowGeneratePrInventoryCommand;
