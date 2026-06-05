import { expandSkillBlock } from "../skill-expansion.ts";
import type { AgentEndContext, CommandContext, ExtensionAPI, ModelInfo, NotifyLevel, ThinkingLevel } from "./types.ts";

const PR_SIDEBAR_COMMAND_NAME = "cmux:pr-sidebar";
const OBJECTIVE_SIDEBAR_COMMAND_NAME = "cmux:objective-sidebar";
const SKILL_NAME = "cmux-sidebar";
const PI_SIDEBAR_STATUS_KEY = "pi:cmux-sidebar";
const SIDEBAR_MODEL_ENV = "ASDL_CMUX_SIDEBAR_MODEL";
const DEFAULT_SIDEBAR_MODEL_REF = "openai-codex/gpt-5.4-mini";

interface RestoreState {
	model?: ModelInfo;
	thinkingLevel: ThinkingLevel;
}

export interface CmuxSidebarController {
	handlePrCommand(ctx: CommandContext): Promise<void>;
	handleObjectiveCommand(args: string, ctx: CommandContext): Promise<void>;
}

interface QueueSidebarOptions {
	request: SidebarPromptRequest;
	shouldWaitForIdle: boolean;
	shouldWarnWhenMissingWorkspace: boolean;
}

interface ParsedModelRef {
	provider: string;
	modelId: string;
}

type SidebarPromptRequest =
	| {
			type: "pr";
	  }
	| {
			type: "objective";
			objectiveSelector?: string;
	  };

export function createCmuxSidebarController(pi: ExtensionAPI): CmuxSidebarController {
	let pendingRestore: RestoreState | undefined;

	pi.on("agent_end", async (_event, ctx) => {
		if (pendingRestore === undefined) {
			return;
		}
		const restoreState = pendingRestore;
		pendingRestore = undefined;
		await restoreModelState(pi, ctx, restoreState);
	});

	return {
		async handlePrCommand(ctx): Promise<void> {
			await queueSidebar(pi, ctx, (state) => {
				pendingRestore = state;
			}, {
				request: { type: "pr" },
				shouldWaitForIdle: true,
				shouldWarnWhenMissingWorkspace: true,
			});
		},

		async handleObjectiveCommand(args, ctx): Promise<void> {
			await queueSidebar(pi, ctx, (state) => {
				pendingRestore = state;
			}, {
				request: buildObjectiveRequest(args),
				shouldWaitForIdle: true,
				shouldWarnWhenMissingWorkspace: true,
			});
		},

	};
}

export function registerCmuxSidebarCommands(
	pi: ExtensionAPI,
	controller: CmuxSidebarController,
): void {
	pi.registerCommand(PR_SIDEBAR_COMMAND_NAME, {
		description: "Summarize the current PR work into the caller cmux sidebar.",
		handler: async (_args, ctx) => controller.handlePrCommand(ctx),
	});

	pi.registerCommand(OBJECTIVE_SIDEBAR_COMMAND_NAME, {
		description: "Summarize an asdl Objective into the caller cmux sidebar.",
		argumentHint: "[objective-slug-or-path]",
		handler: async (args, ctx) => controller.handleObjectiveCommand(args, ctx),
	});
}

export function getCallerWorkspaceId(env: NodeJS.ProcessEnv = process.env): string | undefined {
	const value = env.CMUX_WORKSPACE_ID ?? env.CMUX_TAB_ID;
	const trimmed = value?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function buildCmuxSidebarPrompt(
	skillBlock: string | undefined,
	workspaceId: string,
	request: SidebarPromptRequest,
): string {
	return `${skillBlock ?? buildFallbackSkillPrompt()}

Run the cmux sidebar workflow now for the caller workspace.

Target workspace id/ref from this terminal environment: ${workspaceId}

${formatVariantInstructions(request)}

Use the active Pi conversation context already available to you. Do not include this control prompt as the subject of the sidebar update. Generate compact title and description fields, apply the update with the asdl exec command when the requested source is resolved, then report the applied title briefly.`;
}

function buildObjectiveRequest(args: string): SidebarPromptRequest {
	const objectiveSelector = args.trim();
	if (objectiveSelector.length === 0) {
		return { type: "objective" };
	}
	return { type: "objective", objectiveSelector };
}

function formatVariantInstructions(request: SidebarPromptRequest): string {
	if (request.type === "pr") {
		return [
			"Requested variant: PR sidebar.",
			"Summarize the current PR, branch, or active implementation work.",
			"The Goal line should describe the PR outcome, not the cmux update itself.",
		].join("\n");
	}

	if (request.objectiveSelector === undefined) {
		return [
			"Requested variant: Objective sidebar.",
			"No Objective slug or path was supplied in the command arguments.",
			"Do not infer an Objective from branch, PR, or hidden context.",
			"Ask the user to provide or choose an Objective slug/path, then stop without running asdl exec.",
		].join("\n");
	}

	return [
		"Requested variant: Objective sidebar.",
		`Objective selector from command args: ${request.objectiveSelector}`,
		"Summarize that asdl Objective, not the current PR.",
	].join("\n");
}

function buildFallbackSkillPrompt(): string {
	return `The cmux-sidebar skill was not found. Update the caller cmux workspace title and one-line Goal description for the requested variant using exactly one deterministic command:

\`\`\`bash
asdl exec cmux-workspace-summary \\
  --title '...' \\
  --description 'Goal: ...' \\
  --format json
\`\`\`

The command clears the old cmux status pill. For Objective sidebar without an Objective slug or path, ask the user to choose one and do not run the command. Do not assign shell variables. Do not pass --workspace. Do not run raw cmux commands.`;
}

async function queueSidebar(
	pi: ExtensionAPI,
	ctx: CommandContext,
	setPendingRestore: (state: RestoreState) => void,
	options: QueueSidebarOptions,
): Promise<void> {
	if (options.shouldWaitForIdle) {
		await ctx.waitForIdle();
	}

	const workspaceId = getCallerWorkspaceId();
	if (!workspaceId) {
		if (options.shouldWarnWhenMissingWorkspace) {
			notify(ctx, "Not running inside a cmux caller workspace.", "warning");
		}
		return;
	}

	setStatus(ctx, "preparing cmux sidebar…");
	let restoreState: RestoreState | undefined;
	try {
		const skillBlock = await expandSidebarSkillBlock(pi, ctx);
		restoreState = await switchToFastSidebarModel(pi, ctx);
		if (restoreState !== undefined) {
			setPendingRestore(restoreState);
		}
		notify(
			ctx,
			skillBlock ? formatInvokingMessage(options.request) : "cmux sidebar skill not found; using fallback prompt.",
			skillBlock ? "info" : "warning",
		);
		pi.sendUserMessage(buildCmuxSidebarPrompt(skillBlock, workspaceId, options.request));
	} catch (error) {
		if (restoreState !== undefined) {
			await restoreModelState(pi, ctx, restoreState);
		}
		notify(ctx, `Could not queue cmux sidebar update: ${formatErrorMessage(error)}`, "warning");
	} finally {
		setStatus(ctx, undefined);
	}
}

async function expandSidebarSkillBlock(pi: ExtensionAPI, ctx: CommandContext): Promise<string | undefined> {
	try {
		return (await expandSkillBlock(pi, SKILL_NAME))?.block;
	} catch (error) {
		notify(ctx, `Could not read cmux sidebar skill; using fallback prompt: ${formatErrorMessage(error)}`, "warning");
		return undefined;
	}
}

function formatInvokingMessage(request: SidebarPromptRequest): string {
	return request.type === "pr" ? "Invoking cmux PR sidebar update." : "Invoking cmux Objective sidebar update.";
}

function configuredSidebarModelRef(): string {
	return process.env[SIDEBAR_MODEL_ENV]?.trim() || DEFAULT_SIDEBAR_MODEL_REF;
}

function parseModelRef(modelRef: string): ParsedModelRef | undefined {
	const separator = modelRef.indexOf("/");
	if (separator <= 0 || separator === modelRef.length - 1) {
		return undefined;
	}
	return {
		provider: modelRef.slice(0, separator),
		modelId: modelRef.slice(separator + 1),
	};
}

async function switchToFastSidebarModel(pi: ExtensionAPI, ctx: CommandContext): Promise<RestoreState | undefined> {
	const modelRef = configuredSidebarModelRef();
	const parsed = parseModelRef(modelRef);
	if (parsed === undefined) {
		notify(ctx, `Invalid ${SIDEBAR_MODEL_ENV}=${JSON.stringify(modelRef)}; using current model.`, "warning");
		return undefined;
	}

	const model = ctx.modelRegistry.find(parsed.provider, parsed.modelId);
	if (model === undefined) {
		notify(ctx, `Fast sidebar model ${modelRef} not found; using current model.`, "warning");
		return undefined;
	}

	const restoreState: RestoreState = {
		thinkingLevel: pi.getThinkingLevel(),
	};
	if (ctx.model !== undefined) {
		restoreState.model = ctx.model;
	}

	const switched = await pi.setModel(model);
	if (!switched) {
		notify(ctx, `Fast sidebar model ${modelRef} is unavailable; using current model.`, "warning");
		return undefined;
	}
	pi.setThinkingLevel("minimal");
	return restoreState;
}

async function restoreModelState(pi: ExtensionAPI, ctx: AgentEndContext, restoreState: RestoreState): Promise<void> {
	if (restoreState.model !== undefined) {
		const restored = await pi.setModel(restoreState.model);
		if (!restored) {
			notify(ctx, "Could not restore the previous model after cmux sidebar update.", "warning");
		}
	}
	pi.setThinkingLevel(restoreState.thinkingLevel);
}

function notify(
	ctx: { hasUI?: boolean; ui: { notify(message: string, level?: NotifyLevel): void } },
	message: string,
	level: NotifyLevel = "info",
): void {
	if (ctx.hasUI !== false) {
		ctx.ui.notify(message, level);
	}
}

function setStatus(ctx: CommandContext, value: string | undefined): void {
	if (ctx.hasUI !== false) {
		ctx.ui.setStatus?.(PI_SIDEBAR_STATUS_KEY, value);
	}
}

function formatErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
