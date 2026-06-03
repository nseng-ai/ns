import { expandSkillBlock } from "../skill-expansion.ts";
import type { AgentEndContext, CommandContext, ExtensionAPI, ModelInfo, NotifyLevel, ThinkingLevel } from "./types.ts";

const COMMAND_NAME = "cmux:set-workspace-summary";
const SKILL_NAME = "cmux-set-workspace-summary";
const STATUS_KEY = COMMAND_NAME;
const SUMMARY_MODEL_ENV = "ASDL_CMUX_SUMMARY_MODEL";
const DEFAULT_SUMMARY_MODEL_REF = "openai-codex/gpt-5.4-mini";

interface RestoreState {
	model?: ModelInfo;
	thinkingLevel: ThinkingLevel;
}

export interface CmuxWorkspaceSummaryController {
	handleCommand(ctx: CommandContext): Promise<void>;
	queueFromHook(ctx: CommandContext): Promise<void>;
}

interface QueueSummaryOptions {
	waitForIdle: boolean;
	warnWhenMissingWorkspace: boolean;
}

interface ParsedModelRef {
	provider: string;
	modelId: string;
}

export function createCmuxWorkspaceSummaryController(pi: ExtensionAPI): CmuxWorkspaceSummaryController {
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
		async handleCommand(ctx): Promise<void> {
			await queueSummary(pi, ctx, (state) => {
				pendingRestore = state;
			}, { waitForIdle: true, warnWhenMissingWorkspace: true });
		},

		async queueFromHook(ctx): Promise<void> {
			await queueSummary(pi, ctx, (state) => {
				pendingRestore = state;
			}, { waitForIdle: false, warnWhenMissingWorkspace: true });
		},
	};
}

export function registerCmuxWorkspaceSummaryCommand(
	pi: ExtensionAPI,
	controller: CmuxWorkspaceSummaryController,
): void {
	pi.registerCommand(COMMAND_NAME, {
		description: "Summarize this Pi session into the caller cmux workspace title, description, and status.",
		handler: async (_args, ctx) => controller.handleCommand(ctx),
	});
}

export function getCallerWorkspaceId(env: NodeJS.ProcessEnv = process.env): string | undefined {
	const value = env.CMUX_WORKSPACE_ID ?? env.CMUX_TAB_ID;
	const trimmed = value?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function buildWorkspaceSummaryPrompt(skillBlock: string | undefined, workspaceId: string): string {
	return `${skillBlock ?? buildFallbackSkillPrompt()}

Run the cmux workspace-summary workflow now for the caller workspace.

Target workspace id/ref from this terminal environment: ${workspaceId}

Use the active Pi conversation context already available to you. Do not include this control prompt as the subject of the summary. Generate compact fields, apply the update immediately with the asdl exec command, then report the applied title and status briefly.`;
}

function buildFallbackSkillPrompt(): string {
	return `The cmux-set-workspace-summary skill was not found. Update the caller cmux workspace title, direct multiline description, and status from the current Pi context using exactly one deterministic command:

\`\`\`bash
asdl exec cmux-workspace-summary \\
  --title '...' \\
  --description 'Goal: ...
State: ...
Next: ...' \\
  --status '...' \\
  --format json
\`\`\`

Do not assign shell variables. Do not pass --workspace. Do not run raw cmux commands.`;
}

async function queueSummary(
	pi: ExtensionAPI,
	ctx: CommandContext,
	setPendingRestore: (state: RestoreState) => void,
	options: QueueSummaryOptions,
): Promise<void> {
	if (options.waitForIdle) {
		await ctx.waitForIdle();
	}

	const workspaceId = getCallerWorkspaceId();
	if (!workspaceId) {
		if (options.warnWhenMissingWorkspace) {
			notify(ctx, "Not running inside a cmux caller workspace.", "warning");
		}
		return;
	}

	setStatus(ctx, "preparing fast cmux summary…");
	let restoreState: RestoreState | undefined;
	try {
		const skillBlock = await expandSummarySkillBlock(pi, ctx);
		restoreState = await switchToFastSummaryModel(pi, ctx);
		if (restoreState !== undefined) {
			setPendingRestore(restoreState);
		}
		notify(
			ctx,
			skillBlock ? "Invoking cmux workspace summary." : "cmux summary skill not found; using fallback prompt.",
			skillBlock ? "info" : "warning",
		);
		pi.sendUserMessage(buildWorkspaceSummaryPrompt(skillBlock, workspaceId));
	} catch (error) {
		if (restoreState !== undefined) {
			await restoreModelState(pi, ctx, restoreState);
		}
		notify(ctx, `Could not queue cmux workspace summary: ${formatErrorMessage(error)}`, "warning");
	} finally {
		setStatus(ctx, undefined);
	}
}

async function expandSummarySkillBlock(pi: ExtensionAPI, ctx: CommandContext): Promise<string | undefined> {
	try {
		return (await expandSkillBlock(pi, SKILL_NAME))?.block;
	} catch (error) {
		notify(ctx, `Could not read cmux summary skill; using fallback prompt: ${formatErrorMessage(error)}`, "warning");
		return undefined;
	}
}

function configuredSummaryModelRef(): string {
	return process.env[SUMMARY_MODEL_ENV]?.trim() || DEFAULT_SUMMARY_MODEL_REF;
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

async function switchToFastSummaryModel(pi: ExtensionAPI, ctx: CommandContext): Promise<RestoreState | undefined> {
	const modelRef = configuredSummaryModelRef();
	const parsed = parseModelRef(modelRef);
	if (parsed === undefined) {
		notify(ctx, `Invalid ${SUMMARY_MODEL_ENV}=${JSON.stringify(modelRef)}; using current model.`, "warning");
		return undefined;
	}

	const model = ctx.modelRegistry.find(parsed.provider, parsed.modelId);
	if (model === undefined) {
		notify(ctx, `Fast summary model ${modelRef} not found; using current model.`, "warning");
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
		notify(ctx, `Fast summary model ${modelRef} is unavailable; using current model.`, "warning");
		return undefined;
	}
	pi.setThinkingLevel("minimal");
	return restoreState;
}

async function restoreModelState(pi: ExtensionAPI, ctx: AgentEndContext, restoreState: RestoreState): Promise<void> {
	if (restoreState.model !== undefined) {
		const restored = await pi.setModel(restoreState.model);
		if (!restored) {
			notify(ctx, "Could not restore the previous model after cmux summary.", "warning");
		}
	}
	pi.setThinkingLevel(restoreState.thinkingLevel);
}

function notify(ctx: { hasUI?: boolean; ui: { notify(message: string, level?: NotifyLevel): void } }, message: string, level: NotifyLevel = "info"): void {
	if (ctx.hasUI !== false) {
		ctx.ui.notify(message, level);
	}
}

function setStatus(ctx: CommandContext, value: string | undefined): void {
	if (ctx.hasUI !== false) {
		ctx.ui.setStatus?.(STATUS_KEY, value);
	}
}

function formatErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
