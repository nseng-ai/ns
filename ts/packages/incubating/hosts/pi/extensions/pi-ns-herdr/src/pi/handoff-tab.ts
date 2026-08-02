import { formatShellArg } from "@nseng-ai/foundation/exec";
import { HERDR_TAB_HANDOFF_COMMAND_NAME, type HerdrGateway } from "@nseng-ai/herdr/api";
import { registerCommandWithImmediateAck } from "@nseng-ai/pi-runtime/commands/ack";
import type {
	HandoffExtensionAPI,
	HandoffPromptCreateIntegration,
	HandoffLaunchPromptCopy,
	HandoffStartMessages,
} from "@nseng-ai/pi-ns-handoffs/handoff-launch";

const HERDR_TAB_HANDOFF_STATUS_KEY = HERDR_TAB_HANDOFF_COMMAND_NAME;
const HERDR_TAB_HANDOFF_LAUNCH_COMMAND = "ns herdr exec handoff-tab launch";

const PROMPT_COPY = {
	commandName: HERDR_TAB_HANDOFF_COMMAND_NAME,
	toolName: HERDR_TAB_HANDOFF_LAUNCH_COMMAND,
	intentSentence:
		"Create a directed handoff artifact for the current session, then launch a pickup Pi in a focused Herdr tab by durable reference.",
	abortClause: "do not open a Herdr tab",
	previewHeading: "The pickup tab will run:",
	previewBody(branch: string): string {
		return `/ns:handoff:pickup --branch ${branch} <returned-slug>`;
	},
} satisfies HandoffLaunchPromptCopy;

const START_MESSAGES = {
	ready: `Starting ${HERDR_TAB_HANDOFF_COMMAND_NAME} workflow with content-derived slug…`,
} satisfies HandoffStartMessages;

export function registerHerdrHandoffTab(
	pi: HandoffExtensionAPI,
	integration: HandoffPromptCreateIntegration,
	herdr: Pick<HerdrGateway, "resolveCallerContext">,
): void {
	if (pi.registerTool === undefined) return;
	pi.on?.("session_start", () => integration.registerContentSlugToolIfMissing());
	registerCommandWithImmediateAck({
		host: pi,
		commandName: HERDR_TAB_HANDOFF_COMMAND_NAME,
		commandDefinition: {
			description: "Create a handoff and open a focused Herdr tab to pick it up.",
			handler: async (args, ctx) =>
				integration.runCreateCommand(args, ctx, {
					statusKey: HERDR_TAB_HANDOFF_STATUS_KEY,
					promptCopy: PROMPT_COPY,
					startMessages: START_MESSAGES,
					preflight: async ({ request }) => {
						const callerContext = await herdr.resolveCallerContext();
						if (callerContext.type === "failed") {
							return {
								type: "failed",
								message: `A Herdr caller space is required before creating a handoff for a Herdr tab.\n${callerContext.message}`,
							};
						}
						const workspaceId = callerContext.context.workspaceId;
						if (ctx.model === undefined) {
							return {
								type: "failed",
								message:
									"An active Pi model is required before creating a handoff for a Herdr tab.",
							};
						}
						const thinking = pi.getThinkingLevel?.() ?? "medium";
						const launchRequestJson = JSON.stringify({
							branch: request.branch,
							slug: "<returned-slug>",
							workspaceId,
							provider: ctx.model.provider,
							model: ctx.model.id,
							thinking,
						});
						const launchCommand = [
							`printf '%s\\n' ${formatShellArg(launchRequestJson)}`,
							`${HERDR_TAB_HANDOFF_LAUNCH_COMMAND} --input-json --format json`,
						].join(" | ");
						return {
							type: "ok",
							promptOptions: {
								extraTargetSections: [
									`Caller Herdr workspace: ${workspaceId}`,
									`Caller Pi launch profile: provider ${ctx.model.provider}, model ${ctx.model.id}, thinking ${thinking}`,
									`Caller working directory: ${ctx.cwd}`,
								],
								toolCallInstruction: `After \`ns handoff create\` succeeds, run \`${launchCommand}\`. Replace only \`<returned-slug>\` with the exact slug returned by derive_handoff_slug_from_content.`,
								extraRequirements: [
									"The Herdr launch command reads and verifies the stored Handoff Artifact by branch and slug; do not pipe, quote, or otherwise send the Markdown artifact to it.",
									"Run the Herdr launch command from the captured caller working directory; do not change the branch, workspace ID, provider, model, or thinking values.",
								],
							},
						};
					},
				}),
		},
	});
}
