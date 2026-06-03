import { expandSkillBlock, type SkillCommandInfo } from "../../ts/packages/pi-extensions/src/skill-expansion.ts";

const COMMAND_NAME = "cmux:set-workspace-summary";
const SKILL_NAME = "cmux-set-workspace-summary";
const STATUS_KEY = COMMAND_NAME;
const SUMMARY_MODEL_ENV = "ASDL_CMUX_SUMMARY_MODEL";
const DEFAULT_SUMMARY_MODEL_REF = "openai-codex/gpt-5.4-mini";

type NotifyLevel = "info" | "warning" | "error";
type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

type ModelInfo = {
	provider: string;
	id: string;
};

type ModelRegistry = {
	find(provider: string, modelId: string): ModelInfo | undefined;
};

type UiContext = {
	hasUI: boolean;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		setStatus(key: string, value: string | undefined): void;
	};
};

type CommandContext = UiContext & {
	cwd: string;
	model?: ModelInfo;
	modelRegistry: ModelRegistry;
	waitForIdle(): Promise<void>;
};

type AgentEndContext = UiContext;

type ExtensionAPI = {
	on(event: "agent_end", handler: (_event: unknown, ctx: AgentEndContext) => Promise<void> | void): void;
	registerCommand(
		name: string,
		options: {
			description?: string;
			handler(args: string, ctx: CommandContext): Promise<void> | void;
		},
	): void;
	getCommands(): readonly SkillCommandInfo[];
	getThinkingLevel(): ThinkingLevel;
	setThinkingLevel(level: ThinkingLevel): void;
	setModel(model: ModelInfo): Promise<boolean>;
	sendUserMessage(content: string): void;
};

type RestoreState = {
	model?: ModelInfo;
	thinkingLevel: ThinkingLevel;
};

function notify(ctx: UiContext, message: string, level: NotifyLevel = "info"): void {
	if (ctx.hasUI) {
		ctx.ui.notify(message, level);
	}
}

function setStatus(ctx: UiContext, value: string | undefined): void {
	if (ctx.hasUI) {
		ctx.ui.setStatus(STATUS_KEY, value);
	}
}

function getCallerWorkspaceId(): string | undefined {
	const value = process.env.CMUX_WORKSPACE_ID ?? process.env.CMUX_TAB_ID;
	const trimmed = value?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function configuredSummaryModelRef(): string {
	return process.env[SUMMARY_MODEL_ENV]?.trim() || DEFAULT_SUMMARY_MODEL_REF;
}

function parseModelRef(modelRef: string): { provider: string; modelId: string } | undefined {
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

function buildPrompt(skillBlock: string | undefined, workspaceId: string): string {
	const fallback =
		"The cmux-set-workspace-summary skill was not found. Update the caller cmux workspace title, description, and status from the current Pi context using `asdl exec cmux-workspace-summary`.";

	return `${skillBlock ?? fallback}

Run the cmux workspace-summary workflow now for the caller workspace.

Target workspace id/ref from this terminal environment: ${workspaceId}

Use the active Pi conversation context already available to you. Do not include this control prompt as the subject of the summary. Generate compact fields, apply the update immediately with the asdl exec command, then report the applied title and status briefly.`;
}

async function handleCommand(pi: ExtensionAPI, ctx: CommandContext, setPendingRestore: (state: RestoreState) => void): Promise<void> {
	await ctx.waitForIdle();

	const workspaceId = getCallerWorkspaceId();
	if (!workspaceId) {
		notify(ctx, "Not running inside a cmux caller workspace.", "warning");
		return;
	}

	setStatus(ctx, "preparing fast cmux summary…");
	try {
		const skill = await expandSkillBlock(pi, SKILL_NAME);
		const restoreState = await switchToFastSummaryModel(pi, ctx);
		if (restoreState !== undefined) {
			setPendingRestore(restoreState);
		}
		notify(
			ctx,
			skill ? "Invoking cmux workspace summary." : "cmux summary skill not found; using fallback prompt.",
			skill ? "info" : "warning",
		);
		pi.sendUserMessage(buildPrompt(skill?.block, workspaceId));
	} finally {
		setStatus(ctx, undefined);
	}
}

export default function cmuxSetWorkspaceSummaryExtension(pi: ExtensionAPI): void {
	let pendingRestore: RestoreState | undefined;

	pi.on("agent_end", async (_event, ctx) => {
		if (pendingRestore === undefined) {
			return;
		}
		const restoreState = pendingRestore;
		pendingRestore = undefined;
		await restoreModelState(pi, ctx, restoreState);
	});

	pi.registerCommand(COMMAND_NAME, {
		description: "Summarize this Pi session into the caller cmux workspace title, description, and status.",
		handler: async (_args, ctx) => handleCommand(pi, ctx, (state) => {
			pendingRestore = state;
		}),
	});
}
