import { createNsClinkrInteraction } from "@nseng-ai/capability-kit";
import { confirmInteractiveOrUsageError } from "@nseng-ai/clinkr";
import { renderResultBlock, renderResultBlockFromMessage } from "@nseng-ai/foundation/cli-theme";
import { commandIoFromNsExtensionApi, runWithNsCommandIo } from "@nseng-ai/kernel/command-io";
import {
	defineCommand,
	negative,
	ok,
	z,
	type NsCommand,
	type NsExtensionApi,
} from "@nseng-ai/kernel/sdk";

import {
	applyPreparedPrDescriptionUpdate,
	DEFAULT_PR_DESCRIPTION_MODEL_REF,
	PR_DESCRIPTION_MODEL_ENV,
	PR_DESCRIPTION_PROMPT_ENV,
	REPO_PR_DESCRIPTION_PROMPT_PATH,
	createNsPrDescriptionRuntime,
	formatPromptSourceLabel,
	prDescriptionFingerprintPolicyForForce,
	preparePrDescriptionUpdateForCurrentBranch,
	type PreparedPrDescriptionUpdate,
	type PrDescriptionUpdateResult,
} from "../../submit/index.ts";
import { resolveFlowStreamCaps } from "../../phase-stream/phase-stream.ts";

const REGENERATE_PR_DESCRIPTION = `Regenerate the current branch PR title and ns-managed generated body region.

The command reads the current branch PR with gh, generates fresh PR metadata from the PR diff and commit headlines, then updates the PR title and only the ns-managed generated description region. By default it asks before editing GitHub. Human-authored PR body text outside that managed region is preserved. Use --force to regenerate even when the generated fingerprint is current and bypass confirmation.

Environment:
  ${PR_DESCRIPTION_MODEL_ENV}  Model reference for generated PR descriptions. Defaults to ${DEFAULT_PR_DESCRIPTION_MODEL_REF}.
  ${PR_DESCRIPTION_PROMPT_ENV}  Optional path to a custom PR description prompt. Overrides ${REPO_PR_DESCRIPTION_PROMPT_PATH} and the built-in prompt.`;

const regeneratePrSchema = z.object({
	force: z
		.boolean()
		.default(false)
		.describe("Regenerate even when the fingerprint is current and bypass confirmation."),
});

type RegeneratePrRequest = z.output<typeof regeneratePrSchema>;

export const flowRegeneratePrCommand: NsCommand<typeof regeneratePrSchema> = defineCommand({
	name: "regenerate-pr",
	summary: "Regenerate the PR title and ns-managed body region.",
	description: REGENERATE_PR_DESCRIPTION,
	schema: regeneratePrSchema,
	resultSchema: z.string(),
	options: { force: { short: "-f" } },
	handler: async (ctx: NsExtensionApi, request: RegeneratePrRequest) => {
		return await runWithNsCommandIo(commandIoFromNsExtensionApi(ctx), async (io) => {
			// `regenerate-pr` is flow-local (no CCC, no streaming): it reads PR metadata, generates new
			// metadata, and reports one settled outcome whose body is domain-authored prose rather than a
			// single git/Graphite `ExecResult` transcript. So it renders through the shared finite
			// result block (success / failure / refusal), the same house-style block
			// `branch-latest-commit` uses. It still emits coarse transient phase text so the user is not
			// left staring at a blank terminal while GitHub/model work happens before confirmation.
			const caps = resolveFlowStreamCaps(ctx);
			const runtime = createNsPrDescriptionRuntime(ctx);
			io.phase("Preparing PR metadata update…");
			const prepared: PrDescriptionUpdateResult = await preparePrDescriptionUpdateForCurrentBranch({
				cwd: ctx.cwd,
				env: ctx.env,
				githubPr: runtime.githubPr,
				git: runtime.git,
				textGenerator: ctx.textGenerator,
				fingerprintPolicy: prDescriptionFingerprintPolicyForForce(request.force),
				progress: { onProgress: (message) => io.phase(message) },
			});
			if (prepared.type === "failed") {
				// PR lookup / diff / prompt / generation failure: the domain string already leads with a
				// summary sentence, so route its first line to the bold headline and the rest to the body
				// (house-style §7.1 "direct domain message"). The cause stays visible; GitHub was not edited.
				return negative(
					renderResultBlockFromMessage(caps, {
						kind: "failure",
						message: prepared.reason === "" ? "Could not regenerate the PR." : prepared.reason,
						cwd: ctx.cwd,
					}),
				);
			}

			if (prepared.type === "skipped") {
				return ok(
					renderResultBlock(caps, {
						kind: "success",
						headline: "PR title and description are already current.",
						cwd: ctx.cwd,
						body: [
							`PR: #${prepared.pr.number} ${prepared.pr.url}`,
							`Prompt: ${formatPromptSourceLabel(prepared.promptSource)}`,
						].join("\n"),
					}),
				);
			}

			if (!request.force) {
				const confirmationMessage = formatConfirmationMessage({ generated: prepared });
				const confirmation = await confirmInteractiveOrUsageError(
					createNsClinkrInteraction(ctx, {
						title: "Regenerate PR metadata?",
						formatMessage: () => confirmationMessage,
					}),
					{
						nonInteractive: {
							message:
								"Confirmation is unavailable; pass --force to edit GitHub non-interactively.",
							missingFlag: "--force",
							howToSupply: "Pass --force to regenerate and edit GitHub without prompting.",
						},
						confirmation: {
							message: confirmationMessage,
							defaultAnswer: "yes",
						},
					},
				);
				if ("errorType" in confirmation) {
					return negative(
						renderResultBlock(caps, {
							kind: "refusal",
							headline: confirmation.message,
							cwd: ctx.cwd,
						}),
					);
				}
				if (confirmation.type !== "confirmed") {
					// Declined/aborted confirmation is a warn refusal: GitHub stays untouched.
					return negative(
						renderResultBlock(caps, {
							kind: "refusal",
							headline: "PR metadata regeneration was cancelled; GitHub was not edited.",
							cwd: ctx.cwd,
						}),
					);
				}
			}

			io.phase(`Updating PR #${prepared.pr.number} metadata on GitHub…`);
			const edited = await applyPreparedPrDescriptionUpdate({
				cwd: ctx.cwd,
				githubPr: runtime.githubPr,
				update: prepared,
			});
			if (!edited.ok) {
				return negative(
					renderResultBlock(caps, {
						kind: "failure",
						headline: `Generated a PR description, but failed to update PR #${prepared.pr.number}.`,
						cwd: ctx.cwd,
						body: edited.reason.trimEnd(),
					}),
				);
			}

			return ok(
				renderResultBlock(caps, {
					kind: "success",
					headline: "Regenerated PR title and description.",
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

function formatConfirmationMessage(input: { generated: PreparedPrDescriptionUpdate }): string {
	return [
		`PR #${input.generated.pr.number}: ${input.generated.pr.url}`,
		`Current title: ${input.generated.pr.title}`,
		`New title: ${input.generated.title}`,
		"",
		"This will update the PR title and ns-managed generated description region.",
	].join("\n");
}
