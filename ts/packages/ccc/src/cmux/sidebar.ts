import { objectiveChoiceMap } from "@asdl/pi-extension-runtime/objective-picker";
import { DEFAULT_FAST_MODEL_REF, parseModelRef } from "@asdl/plans";
import { expandSkillBlock } from "@asdl/pi-extension-runtime/skill-expansion";
import {
	applyObjectiveSidebarFields,
	formatObjectiveSidebarFields,
	listObjectiveSidebarChoices,
	readCurrentBranchSlug,
	resolveObjectiveSelector,
	validateObjectiveSidebarSlug,
	slotSlugFromCwd,
} from "./objective-sidebar.ts";
import { formatErrorMessage } from "./primitives.ts";
import type { AgentEndContext, CommandContext, ExtensionAPI, ModelInfo, NotifyLevel, ThinkingLevel } from "./types.ts";

const PR_SIDEBAR_COMMAND_NAME = "ccc:sidebar:pr-summary";
const OBJECTIVE_SIDEBAR_COMMAND_NAME = "ccc:sidebar:objective-summary";
const SKILL_NAME = "ccc-sidebar";
const PI_SIDEBAR_STATUS_KEY = "pi:ccc-sidebar";
const SIDEBAR_MODEL_ENV = "ASDL_CCC_SIDEBAR_MODEL";

interface RestoreState {
	model?: ModelInfo;
	thinkingLevel: ThinkingLevel;
}

export interface CccSidebarController {
	handlePrCommand(ctx: CommandContext): Promise<void>;
	handleObjectiveCommand(args: string, ctx: CommandContext): Promise<void>;
}

export function createCccSidebarController(pi: ExtensionAPI): CccSidebarController {
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
			});
		},

		async handleObjectiveCommand(args, ctx): Promise<void> {
			await handleDeterministicObjectiveSidebar(pi, args, ctx);
		},

	};
}

export function registerCccSidebarCommands(
	pi: ExtensionAPI,
	controller: CccSidebarController,
): void {
	pi.registerCommand(PR_SIDEBAR_COMMAND_NAME, {
		description: "Summarize current PR work into the caller cmux sidebar.",
		handler: async (_args, ctx) => controller.handlePrCommand(ctx),
	});

	pi.registerCommand(OBJECTIVE_SIDEBAR_COMMAND_NAME, {
		description: "Pick or format an asdl Objective into the caller cmux sidebar.",
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
): string {
	return `${skillBlock ?? buildFallbackSkillPrompt()}

Run the cmux PR sidebar workflow now for the caller workspace.

Target workspace id/ref from this terminal environment: ${workspaceId}

Requested variant: PR sidebar.
Summarize the current PR, branch, or active implementation work.
The Goal line should describe the PR outcome, not the cmux update itself.

Use the active Pi conversation context already available to you. Do not include this control prompt as the subject of the sidebar update. Generate compact title and description fields, apply the update with the asdl exec command when the PR source is resolved, then report the applied title briefly.`;
}

function buildFallbackSkillPrompt(): string {
	return `The ccc-sidebar skill was not found. Update the caller cmux workspace title and one-line Goal description for the current PR work using exactly one deterministic command:

\`\`\`bash
asdl exec cmux-workspace-summary \\
  --title '...' \\
  --description 'Goal: ...' \\
  --format json
\`\`\`

The command clears the old cmux status pill. Do not assign shell variables. Do not pass --workspace. Do not run raw cmux commands.`;
}

async function handleDeterministicObjectiveSidebar(pi: ExtensionAPI, args: string, ctx: CommandContext): Promise<void> {
	await ctx.waitForIdle();

	const workspaceId = getCallerWorkspaceId();
	if (!workspaceId) {
		notify(ctx, "Not running inside a cmux caller workspace.", "warning");
		return;
	}

	const slug = await resolveObjectiveSidebarSlug(pi, args, ctx);
	if (slug === undefined) {
		return;
	}

	setStatus(ctx, "preparing cmux Objective sidebar…");
	try {
		const validationResult = await validateObjectiveSidebarSlug(pi, ctx.cwd, slug);
		if (validationResult.type === "failed") {
			notify(ctx, validationResult.message, "error");
			return;
		}

		const branchResult = await readCurrentBranchSlug(pi, ctx.cwd);
		if (branchResult.type === "failed") {
			notify(ctx, branchResult.message, "error");
			return;
		}

		const fields = formatObjectiveSidebarFields({
			objectiveSlug: slug,
			slotSlug: slotSlugFromCwd(ctx.cwd),
			branchSlug: branchResult.branchSlug,
		});
		const applyResult = await applyObjectiveSidebarFields(pi, ctx.cwd, fields);
		if (applyResult.type === "failed") {
			notify(ctx, applyResult.message, "error");
			return;
		}

		notify(ctx, `Applied cmux Objective sidebar: ${fields.title}`, "success");
	} finally {
		setStatus(ctx, undefined);
	}
}

async function resolveObjectiveSidebarSlug(pi: ExtensionAPI, args: string, ctx: CommandContext): Promise<string | undefined> {
	if (args.trim().length > 0) {
		const selector = resolveObjectiveSelector(args, ctx.cwd);
		if (selector.type === "invalid") {
			notify(ctx, selector.message, "warning");
			return undefined;
		}
		return selector.slug;
	}

	if (ctx.hasUI === false || ctx.ui.select === undefined) {
		notify(ctx, "Pass an Objective slug or .asdl/objectives/<slug> path.", "warning");
		return undefined;
	}

	setStatus(ctx, "listing active Objectives…");
	try {
		const choicesResult = await listObjectiveSidebarChoices(pi, ctx.cwd);
		if (choicesResult.type === "failed") {
			notify(ctx, choicesResult.message, "error");
			return undefined;
		}

		if (choicesResult.records.length === 0) {
			notify(ctx, "No active Objectives. Create one with /skill:objective-create.", "info");
			return undefined;
		}

		const choices = objectiveChoiceMap(choicesResult.records);
		const selected = await ctx.ui.select("Select an active Objective for cmux sidebar", [...choices.keys()]);
		if (!selected) {
			notify(ctx, "Objective selection cancelled.", "info");
			return undefined;
		}

		const slug = choices.get(selected);
		if (slug === undefined) {
			notify(ctx, "Objective selection could not be resolved.", "error");
			return undefined;
		}

		return slug;
	} finally {
		setStatus(ctx, undefined);
	}
}

async function queueSidebar(
	pi: ExtensionAPI,
	ctx: CommandContext,
	setPendingRestore: (state: RestoreState) => void,
): Promise<void> {
	await ctx.waitForIdle();

	const workspaceId = getCallerWorkspaceId();
	if (!workspaceId) {
		notify(ctx, "Not running inside a cmux caller workspace.", "warning");
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
			skillBlock ? "Invoking cmux PR summary." : "cmux sidebar skill not found; using fallback prompt.",
			skillBlock ? "info" : "warning",
		);
		pi.sendUserMessage(buildCmuxSidebarPrompt(skillBlock, workspaceId));
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

function configuredSidebarModelRef(): string {
	return process.env[SIDEBAR_MODEL_ENV]?.trim() || DEFAULT_FAST_MODEL_REF;
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
