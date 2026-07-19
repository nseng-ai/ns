import { registerCommandWithImmediateAck } from "@nseng-ai/pi/commands/ack";
import { formatShellArg } from "@nseng-ai/foundation/exec";
import type {
	HandoffExtensionAPI,
	HandoffPromptCreateIntegration,
	HandoffLaunchPromptCopy,
	HandoffStartMessages,
} from "@nseng-ai/handoffs/pi/handoff-launch";

import { HERDR_HANDOFF_TAB_COMMAND_NAME } from "../core/command-surfaces.ts";
import { getCallerWorkspaceId } from "../core/sidebar.ts";

const HERDR_HANDOFF_TAB_STATUS_KEY = HERDR_HANDOFF_TAB_COMMAND_NAME;
const HERDR_HANDOFF_TAB_LAUNCH_COMMAND = "ns herdr exec handoff-tab launch";

const PROMPT_COPY = {
	commandName: HERDR_HANDOFF_TAB_COMMAND_NAME,
	toolName: HERDR_HANDOFF_TAB_LAUNCH_COMMAND,
	intentSentence:
		"Create a directed handoff artifact for the current session, then launch a pickup Pi in a focused Herdr tab by durable reference.",
	abortClause: "do not open a Herdr tab",
	previewHeading: "The pickup tab will run:",
	previewBody(branch: string): string {
		return `/ns:handoff:pickup --branch ${branch} <returned-slug>`;
	},
} satisfies HandoffLaunchPromptCopy;

const START_MESSAGES = {
	ready: `Starting ${HERDR_HANDOFF_TAB_COMMAND_NAME} workflow with content-derived slug…`,
	fallbackLabel: `${HERDR_HANDOFF_TAB_COMMAND_NAME} workflow prompt for a content-derived slug`,
} satisfies HandoffStartMessages;

export function registerHerdrHandoffTab(
	pi: HandoffExtensionAPI,
	integration: HandoffPromptCreateIntegration,
	env: NodeJS.ProcessEnv = process.env,
): void {
	if (pi.registerTool === undefined) return;
	pi.on?.("session_start", () => integration.registerContentSlugToolIfMissing());
	registerCommandWithImmediateAck({
		host: pi,
		commandName: HERDR_HANDOFF_TAB_COMMAND_NAME,
		commandDefinition: {
			description: "Create a handoff and open a focused Herdr tab to pick it up.",
			handler: async (args, ctx) =>
				integration.runCreateCommand(args, ctx, {
					statusKey: HERDR_HANDOFF_TAB_STATUS_KEY,
					promptCopy: PROMPT_COPY,
					startMessages: START_MESSAGES,
					preflight: async ({ request }) => {
						const workspaceId = getCallerWorkspaceId(env);
						if (workspaceId === undefined) {
							return {
								type: "failed",
								message:
									"HERDR_WORKSPACE_ID is required before creating a handoff for a Herdr tab.",
							};
						}
						if (ctx.model === undefined) {
							return {
								type: "failed",
								message:
									"An active Pi model is required before creating a handoff for a Herdr tab.",
							};
						}
						const thinking = pi.getThinkingLevel?.() ?? "medium";
						const launchCommand = [
							HERDR_HANDOFF_TAB_LAUNCH_COMMAND,
							`--branch ${formatShellArg(request.branch)}`,
							"--slug <returned-slug>",
							`--workspace-id ${formatShellArg(workspaceId)}`,
							`--provider ${formatShellArg(ctx.model.provider)}`,
							`--model ${formatShellArg(ctx.model.id)}`,
							`--thinking ${formatShellArg(thinking)}`,
							"--format json",
						].join(" ");
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
