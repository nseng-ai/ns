import { objectiveChoiceMap } from "@asdl/pi-extension-runtime/objective-picker";
import { DEFAULT_FAST_MODEL_REF, resolveModelRef } from "@asdl/plans";
import { expandRepoSkillBlock } from "@asdl/pi-extension-runtime/skill-expansion";
import {
	applyObjectiveSidebarFields,
	formatObjectiveSidebarFields,
	listObjectiveSidebarChoices,
	readCurrentBranchSlug,
	resolveObjectiveSelector,
	validateObjectiveSidebarSlug,
	slotSlugFromCwd,
} from "./objective-sidebar.ts";
import { formatErrorMessage } from "@asdl/core/primitives";
import type {
	AgentEndContext,
	CommandContext,
	ExtensionAPI,
	ModelInfo,
	NotifyLevel,
	ThinkingLevel,
} from "./types.ts";

const SESSION_SIDEBAR_COMMAND_NAME = "ccc:sidebar:session-summary";
const BRANCH_STATE_SIDEBAR_COMMAND_NAME = "ccc:sidebar:branch-state-summary";
const OBJECTIVE_SIDEBAR_COMMAND_NAME = "ccc:sidebar:objective-summary";
const SKILL_NAME = "ccc-sidebar";
const PI_SIDEBAR_STATUS_KEY = "pi:ccc-sidebar";
const SIDEBAR_MODEL_ENV = "ASDL_CCC_SIDEBAR_MODEL";

interface RestoreState {
	model?: ModelInfo;
	thinkingLevel: ThinkingLevel;
}

export interface CccSidebarController {
	handleSessionCommand(ctx: CommandContext): Promise<void>;
	handleBranchStateCommand(ctx: CommandContext): Promise<void>;
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
		async handleSessionCommand(ctx): Promise<void> {
			await queueSessionSidebar(pi, ctx, (state) => {
				pendingRestore = state;
			});
		},

		async handleBranchStateCommand(ctx): Promise<void> {
			await queueBranchStateSidebar(pi, ctx, (state) => {
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
	pi.registerCommand(SESSION_SIDEBAR_COMMAND_NAME, {
		description: "Summarize this Pi session into the caller cmux sidebar.",
		handler: async (_args, ctx) => controller.handleSessionCommand(ctx),
	});

	pi.registerCommand(BRANCH_STATE_SIDEBAR_COMMAND_NAME, {
		description:
			"Summarize the current branch state versus its parent into the caller cmux sidebar.",
		handler: async (_args, ctx) => controller.handleBranchStateCommand(ctx),
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

export function buildCmuxSessionSidebarPrompt(
	skillBlock: string | undefined,
	workspaceId: string,
): string {
	return `${skillBlock ?? buildFallbackSessionSkillPrompt()}

Run the cmux session sidebar workflow now for the caller workspace.

Target workspace id/ref from this terminal environment: ${workspaceId}

Requested command: ccc:sidebar:session-summary.
Summarize this Pi session's current task, progress, and likely next action.
The title must be exactly summary:<slug>, where <slug> is a concise lowercase hyphen slug for the session topic and the full title is max 45 chars.
The Goal line should describe what this session is trying to accomplish, not the cmux update itself.

Use the active Pi conversation context already available to you. Do not include this control prompt as the subject of the sidebar update. Generate compact title and description fields, apply the update with the asdl exec command when the source is resolved, then report the applied title briefly.`;
}

export function buildCmuxBranchStateSidebarPrompt(
	skillBlock: string | undefined,
	workspaceId: string,
): string {
	return `${skillBlock ?? buildFallbackBranchStateSkillPrompt()}

Run the cmux branch-state sidebar workflow now for the caller workspace.

Target workspace id/ref from this terminal environment: ${workspaceId}

Requested command: ccc:sidebar:branch-state-summary.
Summarize the current Git branch's implementation state relative to its parent branch.
Use read-only repository evidence: current branch, parent branch, porcelain status, branch-local commits, and a compact diffstat or short diff summary versus the parent. Prefer Graphite parent evidence when available, such as \`gt parent --no-interactive\`; if Graphite parent evidence is unavailable, explain the fallback basis tersely and use the best Git merge-base/upstream evidence you can resolve.
The title must be exactly state:<slug>, where <slug> is a concise lowercase hyphen slug for the branch topic and the full title is max 45 chars.
The State line should describe what the branch currently changes or needs next relative to its parent, not the cmux update itself.

Do not include this control prompt as the subject of the sidebar update. Run only read-only Git/Graphite inspection before applying the cmux update. Generate compact title and description fields, apply the update with the asdl exec command when the branch state is resolved, then report the applied title briefly.`;
}

function buildFallbackSessionSkillPrompt(): string {
	return `The ccc-sidebar skill was not found. Update the caller cmux workspace title and one-line Goal description for this Pi session using exactly one deterministic command. The title must be exactly summary:<slug>, where <slug> is a concise lowercase hyphen slug:

\`\`\`bash
asdl exec cmux-workspace-summary \\
  --title 'summary:<slug>' \\
  --description 'Goal: ...' \\
  --format json
\`\`\`

The command clears the old cmux status pill. Do not assign shell variables. Do not pass --workspace. Do not run raw cmux commands.`;
}

function buildFallbackBranchStateSkillPrompt(): string {
	return `The ccc-sidebar skill was not found. Update the caller cmux workspace title and one-line State description for the current branch relative to its parent using exactly one deterministic apply command after read-only Git/Graphite inspection. The title must be exactly state:<slug>, where <slug> is a concise lowercase hyphen slug:

\`\`\`bash
asdl exec cmux-workspace-summary \\
  --title 'state:<slug>' \\
  --description 'State: ...' \\
  --format json
\`\`\`

The command clears the old cmux status pill. Do not assign shell variables. Do not pass --workspace. Do not run raw cmux commands.`;
}

async function handleDeterministicObjectiveSidebar(
	pi: ExtensionAPI,
	args: string,
	ctx: CommandContext,
): Promise<void> {
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

async function resolveObjectiveSidebarSlug(
	pi: ExtensionAPI,
	args: string,
	ctx: CommandContext,
): Promise<string | undefined> {
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
			notify(ctx, "No active Objectives. Create one with /objective:create.", "info");
			return undefined;
		}

		const choices = objectiveChoiceMap(choicesResult.records);
		const selected = await ctx.ui.select("Select an active Objective for cmux sidebar", [
			...choices.keys(),
		]);
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

async function queueSessionSidebar(
	pi: ExtensionAPI,
	ctx: CommandContext,
	setPendingRestore: (state: RestoreState) => void,
): Promise<void> {
	await queueModelAssistedSidebar(pi, ctx, setPendingRestore, {
		status: "preparing cmux sidebar…",
		successMessage: "Invoking cmux session sidebar summary.",
		fallbackMessage: "cmux sidebar skill not found; using fallback prompt.",
		buildPrompt: buildCmuxSessionSidebarPrompt,
	});
}

async function queueBranchStateSidebar(
	pi: ExtensionAPI,
	ctx: CommandContext,
	setPendingRestore: (state: RestoreState) => void,
): Promise<void> {
	await queueModelAssistedSidebar(pi, ctx, setPendingRestore, {
		status: "preparing cmux branch-state sidebar…",
		successMessage: "Invoking cmux branch-state sidebar summary.",
		fallbackMessage: "cmux sidebar skill not found; using branch-state fallback prompt.",
		buildPrompt: buildCmuxBranchStateSidebarPrompt,
	});
}

async function queueModelAssistedSidebar(
	pi: ExtensionAPI,
	ctx: CommandContext,
	setPendingRestore: (state: RestoreState) => void,
	options: {
		status: string;
		successMessage: string;
		fallbackMessage: string;
		buildPrompt(skillBlock: string | undefined, workspaceId: string): string;
	},
): Promise<void> {
	await ctx.waitForIdle();

	const workspaceId = getCallerWorkspaceId();
	if (!workspaceId) {
		notify(ctx, "Not running inside a cmux caller workspace.", "warning");
		return;
	}

	setStatus(ctx, options.status);
	let restoreState: RestoreState | undefined;
	try {
		const skillBlock = await expandSidebarSkillBlock(ctx);
		restoreState = await switchToFastSidebarModel(pi, ctx);
		if (restoreState !== undefined) {
			setPendingRestore(restoreState);
		}
		notify(
			ctx,
			skillBlock ? options.successMessage : options.fallbackMessage,
			skillBlock ? "info" : "warning",
		);
		pi.sendUserMessage(options.buildPrompt(skillBlock, workspaceId));
	} catch (error) {
		if (restoreState !== undefined) {
			await restoreModelState(pi, ctx, restoreState);
		}
		notify(ctx, `Could not queue cmux sidebar update: ${formatErrorMessage(error)}`, "warning");
	} finally {
		setStatus(ctx, undefined);
	}
}

async function expandSidebarSkillBlock(ctx: CommandContext): Promise<string | undefined> {
	try {
		return (await expandRepoSkillBlock({ cwd: ctx.cwd, skillName: SKILL_NAME })).block;
	} catch (error) {
		notify(
			ctx,
			`Could not read cmux sidebar skill; using fallback prompt: ${formatErrorMessage(error)}`,
			"warning",
		);
		return undefined;
	}
}

async function switchToFastSidebarModel(
	pi: ExtensionAPI,
	ctx: CommandContext,
): Promise<RestoreState | undefined> {
	const resolution = resolveModelRef(process.env, SIDEBAR_MODEL_ENV, DEFAULT_FAST_MODEL_REF);
	if (!resolution.ok) {
		notify(ctx, `${resolution.error} Using current model.`, "warning");
		return undefined;
	}

	const { provider, modelId } = resolution.value;
	const modelRef = `${provider}/${modelId}`;
	const model = ctx.modelRegistry.find(provider, modelId);
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

async function restoreModelState(
	pi: ExtensionAPI,
	ctx: AgentEndContext,
	restoreState: RestoreState,
): Promise<void> {
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
