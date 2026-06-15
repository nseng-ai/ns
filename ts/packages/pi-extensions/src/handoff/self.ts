import { formatErrorMessage } from "@asdl/core/primitives";
import { isRecord, stringField } from "../cmux/primitives.ts";
import {
	buildHandoffLaunchPrompt,
	buildHandoffLaunchRequest,
	handoffLaunchToolFailure,
	parseHandoffLaunchParams,
	prepareHandoffLaunchCommand,
	verifyHandoffLaunchTarget,
	type HandoffLaunchCommandSpec,
	type HandoffLaunchParams,
	type HandoffLaunchPromptCopy,
	type HandoffLaunchRequest,
} from "./launch-flow.ts";
import {
	DERIVE_HANDOFF_SLUG_TOOL_NAME,
	HANDOFF_SELF_COMMAND_NAME,
	HANDOFF_SELF_QUEUE_PICKUP_TOOL_NAME,
	HANDOFF_SELF_STATUS_KEY,
	HANDOFF_SELF_WORKFLOW_TIMEOUT_MS,
	createHandoffStartMessage,
	setStatus,
	type HandoffStartMessages,
} from "./shared.ts";
import type { CommandContext, ExtensionAPI, ReplacedSessionContext, ToolDefinition } from "./runtime-types.ts";

export interface HandoffSelfReadyResult {
	type: "self-handoff-ready";
	branch: string;
	slug: string;
	workflowId: string;
}

interface HandoffSelfPromptOptions {
	skillBlock: string | undefined;
	request: HandoffLaunchRequest;
	workflowId?: string;
}

interface HandoffSelfLaunchParams extends HandoffLaunchParams {
	workflowId: string;
}

type HandoffSelfWorkflowState =
	| { type: "idle" }
	| { type: "starting"; workflowId: string }
	| {
			type: "waiting";
			branch: string;
			resolve(completion: HandoffSelfCompletion): void;
			timeout: ReturnType<typeof setTimeout>;
			workflowId: string;
		};

type HandoffSelfCompletion =
	| { type: "completed"; branch: string; slug: string }
	| { type: "timed-out" };

type HandoffSelfLaunchParamsParseResult = { type: "valid"; params: HandoffSelfLaunchParams } | { type: "invalid"; message: string };

export const HANDOFF_SELF_PROMPT_COPY = {
	commandName: HANDOFF_SELF_COMMAND_NAME,
	toolName: HANDOFF_SELF_QUEUE_PICKUP_TOOL_NAME,
	intentSentence: "Create a directed handoff artifact for the current session, then let the command replace this session and send a pickup prompt in the fresh session after the saved handoff is verified.",
	abortClause: "do not clear context or pick up the handoff",
	previewHeading: "After saving and verification, the command will replace this session and the fresh session will receive this pickup prompt:",
	previewBody(branch: string): string {
		return formatHandoffSelfKickoffPrompt(branch, "<returned-slug>");
	},
} satisfies HandoffLaunchPromptCopy;

const HANDOFF_SELF_START_MESSAGES = {
	ready: "Starting handoff:self workflow with content-derived slug…",
	fallbackLabel: "handoff:self workflow prompt for a content-derived slug",
} satisfies HandoffStartMessages;

const HANDOFF_SELF_LAUNCH_COMMAND_SPEC = {
	statusKey: HANDOFF_SELF_STATUS_KEY,
	promptCopy: HANDOFF_SELF_PROMPT_COPY,
	startMessages: HANDOFF_SELF_START_MESSAGES,
} satisfies HandoffLaunchCommandSpec;

export const buildHandoffSelfRequest = buildHandoffLaunchRequest;

export function createHandoffSelfWorkflow(
	pi: ExtensionAPI,
	options: { timeoutMs?: number } = {},
): {
	buildTool(): ToolDefinition;
	handleCommand(args: string, ctx: CommandContext): Promise<void>;
} {
	const timeoutMs = options.timeoutMs ?? HANDOFF_SELF_WORKFLOW_TIMEOUT_MS;
	let state: HandoffSelfWorkflowState = { type: "idle" };

	function resetStarting(workflowId: string): void {
		if (state.type === "starting" && state.workflowId === workflowId) {
			state = { type: "idle" };
		}
	}

	function createWaitingWorkflow(options: { branch: string; workflowId: string }): Promise<HandoffSelfCompletion> {
		return new Promise((resolve) => {
			const timeout = setTimeout(() => {
				if (state.type === "waiting" && state.workflowId === options.workflowId) {
					state = { type: "idle" };
					resolve({ type: "timed-out" });
				}
			}, timeoutMs);
			state = {
				type: "waiting",
				branch: options.branch,
				resolve,
				timeout,
				workflowId: options.workflowId,
			};
		});
	}

	function resolveWaitingWorkflow(waiting: Extract<HandoffSelfWorkflowState, { type: "waiting" }>, completion: Extract<HandoffSelfCompletion, { type: "completed" }>): boolean {
		if (state.type !== "waiting" || state.workflowId !== waiting.workflowId) {
			return false;
		}
		clearTimeout(waiting.timeout);
		state = { type: "idle" };
		waiting.resolve(completion);
		return true;
	}

	function clearWaitingWorkflow(workflowId: string): void {
		if (state.type !== "waiting" || state.workflowId !== workflowId) {
			return;
		}
		clearTimeout(state.timeout);
		const resolve = state.resolve;
		state = { type: "idle" };
		resolve({ type: "timed-out" });
	}

	async function handleCommand(args: string, ctx: CommandContext): Promise<void> {
		if (state.type !== "idle") {
			ctx.ui.notify("handoff:self is already waiting for a saved handoff in this extension instance; finish or let that workflow time out before starting another.", "warning");
			return;
		}

		const workflowId = createWorkflowId();
		state = { type: "starting", workflowId };
		try {
			if (ctx.newSession === undefined) {
				ctx.ui.notify(`/${HANDOFF_SELF_COMMAND_NAME} requires Pi session replacement support.`, "error");
				return;
			}

			const prepared = await prepareHandoffLaunchCommand(pi, args, ctx, HANDOFF_SELF_LAUNCH_COMMAND_SPEC);
			if (prepared === undefined) {
				return;
			}

			const completion = createWaitingWorkflow({ branch: prepared.request.branch, workflowId });
			try {
				ctx.ui.notify(createHandoffStartMessage(HANDOFF_SELF_START_MESSAGES, prepared.skill, prepared.skillReadError), prepared.skill ? "info" : "warning");
				pi.sendUserMessage(buildHandoffSelfPrompt({ skillBlock: prepared.skill?.block, request: prepared.request, workflowId }));
			} catch (error) {
				clearWaitingWorkflow(workflowId);
				throw error;
			}

			const result = await completion;
			if (result.type === "timed-out") {
				ctx.ui.notify("handoff:self timed out waiting for handoff_self_queue_pickup; context was not cleared because the saved handoff was not verified.", "error");
				return;
			}

			await ctx.waitForIdle();
			await replaceSessionForSelfHandoff(ctx, result);
		} finally {
			resetStarting(workflowId);
		}
	}

	function buildTool(): ToolDefinition {
		return {
			name: HANDOFF_SELF_QUEUE_PICKUP_TOOL_NAME,
			label: "Verify Handoff Self Completion",
			description: "Verify a saved handoff exists, then rendezvous with /handoff:self so the command can replace the session and send the pickup prompt.",
			promptSnippet: "Verify a saved /handoff:self artifact, then resolve the active handoff:self rendezvous after the handoff has been saved successfully.",
			promptGuidelines: [
				`Use ${HANDOFF_SELF_QUEUE_PICKUP_TOOL_NAME} only after a /${HANDOFF_SELF_COMMAND_NAME} prompt has saved the requested handoff successfully.`,
				`${HANDOFF_SELF_QUEUE_PICKUP_TOOL_NAME} verifies the handoff exists before resolving session replacement; do not call it before brmem put succeeds.`,
			],
			parameters: {
				type: "object",
				additionalProperties: false,
				properties: {
					branch: {
						type: "string",
						description: "Git branch where the handoff was saved.",
					},
					slug: {
						type: "string",
						description: "Flat semantic handoff slug without .md.",
					},
					workflow_id: {
						type: "string",
						description: "Opaque /handoff:self rendezvous id from the active command prompt.",
					},
				},
				required: ["branch", "slug", "workflow_id"],
			},
			async execute(_toolCallId, params, signal, onUpdate, ctx) {
				if (signal?.aborted) {
					return handoffLaunchToolFailure("handoff:self verification was cancelled; context was not cleared.");
				}

				const parsed = parseHandoffSelfLaunchParams(params);
				if (parsed.type === "invalid") {
					return handoffLaunchToolFailure(parsed.message);
				}

				const waiting = state.type === "waiting" ? state : undefined;
				if (waiting === undefined) {
					return handoffLaunchToolFailure(`${HANDOFF_SELF_QUEUE_PICKUP_TOOL_NAME} was called with no active /${HANDOFF_SELF_COMMAND_NAME} workflow; context was not cleared.`);
				}
				if (parsed.params.workflowId !== waiting.workflowId) {
					return handoffLaunchToolFailure(`${HANDOFF_SELF_QUEUE_PICKUP_TOOL_NAME} received the wrong workflow_id; context was not cleared.`);
				}
				if (parsed.params.branch !== waiting.branch) {
					return handoffLaunchToolFailure(`Saved handoff branch ${parsed.params.branch} does not match active /${HANDOFF_SELF_COMMAND_NAME} branch ${waiting.branch}; context was not cleared.`);
				}

				const verified = await verifyHandoffLaunchTarget(pi, ctx, {
					params: parsed.params,
					statusKey: HANDOFF_SELF_STATUS_KEY,
					verifyStatus: "verifying saved handoff…",
					verifyUpdate: "Verifying saved handoff…",
					missingMessage: (params) => `No handoff ${params.slug} found on branch ${params.branch}; context was not cleared.`,
					onUpdate,
				});
				if (verified.type === "failed") {
					return verified.result;
				}

				if (signal?.aborted) {
					return handoffLaunchToolFailure("handoff:self verification was cancelled; context was not cleared.");
				}
				if (!resolveWaitingWorkflow(waiting, { type: "completed", branch: parsed.params.branch, slug: parsed.params.slug })) {
					return handoffLaunchToolFailure(`${HANDOFF_SELF_QUEUE_PICKUP_TOOL_NAME} verified the handoff after the active workflow changed or timed out; context was not cleared.`);
				}
				return {
					content: [
						{
							type: "text",
							text: `Verified handoff:self artifact ${parsed.params.slug} on branch ${parsed.params.branch}. The current command will replace this session and send the pickup prompt in the fresh session.`,
						},
					],
					details: {
						type: "self-handoff-ready",
						branch: parsed.params.branch,
						slug: parsed.params.slug,
						workflowId: parsed.params.workflowId,
					} satisfies HandoffSelfReadyResult,
					terminate: true,
				};
			},
		};
	}

	return { buildTool, handleCommand };
}

export function buildHandoffSelfPrompt(options: HandoffSelfPromptOptions): string {
	const request = options.request;
	const workflowId = options.workflowId ?? "<workflow-id>";
	return buildHandoffLaunchPrompt(HANDOFF_SELF_PROMPT_COPY, {
		skillBlock: options.skillBlock,
		request,
		extraTargetSections: [`Session replacement rendezvous:\n\n- Tool: ${HANDOFF_SELF_QUEUE_PICKUP_TOOL_NAME}\n- workflow_id: ${workflowId}`],
		toolCallInstruction: `After \`brmem put\` succeeds, call ${HANDOFF_SELF_QUEUE_PICKUP_TOOL_NAME} with \`branch\` set to \`${request.branch}\`, \`slug\` set to the slug returned by ${DERIVE_HANDOFF_SLUG_TOOL_NAME}, and \`workflow_id\` set to \`${workflowId}\`.`,
		extraRequirements: ["Do not queue slash commands such as /handoff:self-resume, /handoff:self-pickup, or /new as user messages. The command owns session replacement after this tool resolves."],
	});
}

export function formatHandoffSelfKickoffPrompt(branch: string, slug: string): string {
	return `Pick up handoff ${slug} on branch ${branch}. Summarize it and wait for my direction before continuing.`;
}

async function replaceSessionForSelfHandoff(ctx: CommandContext, completion: { branch: string; slug: string }): Promise<void> {
	// handleCommand preflights this, but keep a local capability read for host-provided
	// context narrowing and defensive recovery if the context shape changes.
	const newSession = ctx.newSession;
	if (newSession === undefined) {
		ctx.ui.notify(`/${HANDOFF_SELF_COMMAND_NAME} requires Pi session replacement support.`, "error");
		return;
	}

	const kickoffPrompt = formatHandoffSelfKickoffPrompt(completion.branch, completion.slug);
	const parentSession = ctx.sessionManager?.getSessionFile?.();

	const withSession = async (replacementCtx: ReplacedSessionContext): Promise<void> => {
		replacementCtx.ui.notify(`Picking up handoff ${completion.slug} from branch ${completion.branch}…`, "info");
		await replacementCtx.sendUserMessage(kickoffPrompt);
	};

	setStatus(ctx, HANDOFF_SELF_STATUS_KEY, "clearing context…");
	await newSession(parentSession === undefined ? { withSession } : { parentSession, withSession }).catch((error: unknown) => {
		throw new Error(`Failed to clear context for handoff:self. ${formatErrorMessage(error)}`);
	});
}

function parseHandoffSelfLaunchParams(params: unknown): HandoffSelfLaunchParamsParseResult {
	if (!isRecord(params)) {
		return { type: "invalid", message: `${HANDOFF_SELF_QUEUE_PICKUP_TOOL_NAME} parameters must be an object.` };
	}
	const parsedLaunch = parseHandoffLaunchParams(params, HANDOFF_SELF_QUEUE_PICKUP_TOOL_NAME);
	if (parsedLaunch.type === "invalid") {
		return parsedLaunch;
	}
	const workflowId = stringField(params, "workflow_id");
	if (workflowId === undefined) {
		return { type: "invalid", message: `${HANDOFF_SELF_QUEUE_PICKUP_TOOL_NAME} requires a non-empty workflow_id.` };
	}
	return { type: "valid", params: { ...parsedLaunch.params, workflowId } };
}

function createWorkflowId(): string {
	return `handoff-self-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
