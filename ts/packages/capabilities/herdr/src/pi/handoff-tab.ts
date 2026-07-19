import { registerCommandWithImmediateAck } from "@nseng-ai/pi/commands/ack";
import { createCliHerdrGateway } from "../core/cli-gateway.ts";
import {
	formatHerdrHandoffTabLaunchSuccess,
	formatHerdrHandoffTabRunFailure,
	launchHerdrHandoffTab,
	type HerdrHandoffTabLaunchResult,
} from "../core/handoff-tab.ts";
import { getCallerWorkspaceId } from "../core/sidebar.ts";
import { HERDR_HANDOFF_TAB_COMMAND_NAME } from "../core/command-surfaces.ts";
import type { HerdrGateway } from "../core/herdr-gateway.ts";
import { createPiCommandExecApi } from "@nseng-ai/pi/shared/command-exec";
import type {
	HandoffExtensionAPI,
	HandoffLaunchIntegration,
	HandoffLaunchParams,
	HandoffLaunchParamsParseResult,
	HandoffLaunchPromptCopy,
	HandoffStartMessages,
	ToolResult,
} from "@nseng-ai/handoffs/pi/handoff-launch";
import { parseHandoffLaunchParams } from "@nseng-ai/handoffs/pi/handoff-launch";
import { isRecord, stringField } from "@nseng-ai/pi/runtime/primitives";

export const HERDR_HANDOFF_TAB_LAUNCH_TOOL_NAME = "herdr_handoff_tab_launch";
const HERDR_HANDOFF_TAB_STATUS_KEY = HERDR_HANDOFF_TAB_COMMAND_NAME;

const PROMPT_COPY = {
	commandName: HERDR_HANDOFF_TAB_COMMAND_NAME,
	toolName: HERDR_HANDOFF_TAB_LAUNCH_TOOL_NAME,
	intentSentence:
		"Create a directed handoff artifact for the current session, then launch a pickup Pi in a focused Herdr tab.",
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

interface HerdrHandoffTabLaunchParams extends HandoffLaunchParams {
	workspaceId: string;
}

export function registerHerdrHandoffTab(
	pi: HandoffExtensionAPI,
	integration: HandoffLaunchIntegration,
	env: NodeJS.ProcessEnv = process.env,
	herdr?: HerdrGateway,
): void {
	if (pi.registerTool === undefined) return;
	const commands = createPiCommandExecApi(pi);
	const herdrGateway = herdr ?? createCliHerdrGateway(commands);
	pi.on?.("session_start", () => integration.registerContentSlugToolIfMissing());
	pi.registerTool(
		integration.buildVerifiedLaunchTool<HerdrHandoffTabLaunchParams>({
			name: HERDR_HANDOFF_TAB_LAUNCH_TOOL_NAME,
			label: "Launch Herdr Handoff Tab",
			description:
				"Verify a saved handoff exists, then open a focused Herdr tab in the caller workspace and launch Pi to pick it up.",
			promptSnippet: "Open a focused Herdr tab to pick up a successfully saved handoff.",
			promptGuidelines: [
				`Use ${HERDR_HANDOFF_TAB_LAUNCH_TOOL_NAME} only after a /${HERDR_HANDOFF_TAB_COMMAND_NAME} prompt saves the handoff successfully.`,
				`${HERDR_HANDOFF_TAB_LAUNCH_TOOL_NAME} verifies the handoff before creating a Herdr tab.`,
			],
			statusKey: HERDR_HANDOFF_TAB_STATUS_KEY,
			verifyStatus: () => "verifying saved handoff…",
			verifyUpdate: "Verifying saved handoff…",
			missingMessage: (params) =>
				`No handoff ${params.slug} found on branch ${params.branch}; no Herdr tab was opened.`,
			extraParameters: {
				properties: {
					workspaceId: {
						type: "string",
						description: "Exact caller Herdr workspace ID captured by the command prompt.",
					},
				},
				required: ["workspaceId"],
			},
			parseParams: parseHerdrHandoffTabLaunchParams,
			async launch({ params, ctx }): Promise<ToolResult> {
				const launched = await launchHerdrHandoffTab({
					herdr: herdrGateway,
					pi: { getThinkingLevel: () => pi.getThinkingLevel?.() ?? "medium" },
					ctx,
					workspaceId: params.workspaceId,
					slug: params.slug,
					pickupCommand: params.pickupCommand,
				});
				return launchResult(launched);
			},
		}),
	);
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
						return {
							type: "ok",
							promptOptions: {
								extraTargetSections: [`Caller Herdr workspace: ${workspaceId}`],
								toolCallInstruction: `After \`ns handoff create\` succeeds, call ${HERDR_HANDOFF_TAB_LAUNCH_TOOL_NAME} with \`branch\` set exactly to \`${request.branch}\`, \`slug\` set to the slug returned by derive_handoff_slug_from_content, and \`workspaceId\` set exactly to \`${workspaceId}\`.`,
								extraRequirements: [
									`Do not change or infer the captured caller workspace ID \`${workspaceId}\`.`,
								],
							},
						};
					},
				}),
		},
	});
}

function parseHerdrHandoffTabLaunchParams(
	params: unknown,
): HandoffLaunchParamsParseResult<HerdrHandoffTabLaunchParams> {
	if (!isRecord(params)) {
		return {
			type: "invalid",
			message: `${HERDR_HANDOFF_TAB_LAUNCH_TOOL_NAME} parameters must be an object.`,
		};
	}
	const rawWorkspaceId = stringField(params, "workspaceId");
	const workspaceId = rawWorkspaceId?.trim();
	if (workspaceId === undefined || workspaceId.length === 0) {
		return {
			type: "invalid",
			message: `${HERDR_HANDOFF_TAB_LAUNCH_TOOL_NAME} requires a non-empty workspaceId.`,
		};
	}
	const parsed = parseHandoffLaunchParams(params, HERDR_HANDOFF_TAB_LAUNCH_TOOL_NAME);
	if (parsed.type === "invalid") return parsed;
	return { type: "valid", params: { ...parsed.params, workspaceId } };
}

function launchResult(result: HerdrHandoffTabLaunchResult): ToolResult {
	if (result.type === "launched") {
		return {
			content: [{ type: "text", text: formatHerdrHandoffTabLaunchSuccess(result) }],
			details: result,
		};
	}
	const message =
		result.stage === "run-in-pane" ? formatHerdrHandoffTabRunFailure(result) : result.message;
	return toolFailure(message, result);
}

function toolFailure(message: string, details?: unknown): ToolResult {
	return { content: [{ type: "text", text: message }], details, isError: true };
}
