import { buildPiLaunchCommand, getPiLaunchOptions } from "../cmux/pi-launch.ts";
import {
	createCmuxSurface,
	identifyCmuxCaller,
	renameCmuxTab,
	sendCmuxText,
	type CmuxSendOptions,
	type CmuxTabOptions,
} from "../cmux/focused-terminal-tab.ts";
import { isRecord, stringField } from "../cmux/primitives.ts";
import {
	HANDOFF_KEY_SUFFIX,
	HANDOFF_NAMESPACE,
	deriveSemanticHandoffSlug,
	formatPickupHandoffCommand,
	handoffSlugToKey,
	parseFlatHandoffSlug,
} from "./identity.ts";
import {
	HANDOFF_TAB_COMMAND_NAME,
	HANDOFF_TAB_LAUNCH_TOOL_NAME,
	HANDOFF_TAB_STATUS_KEY,
	PICKUP_HANDOFF_COMMAND_NAME,
	CREATE_HANDOFF_FALLBACK,
	CREATE_HANDOFF_SKILL_NAME,
	checkHandoffExists,
	currentBranch,
	errorMessage,
	expandHandoffSkill,
	fencedBlock,
	resolveCreateFocus,
	setStatus,
} from "./shared.ts";
import type { CommandContext, ExtensionAPI, ToolContext, ToolDefinition, ToolResult } from "./runtime-types.ts";

export interface HandoffTabRequest {
	branch: string;
	focus: string;
	slug: string;
	key: string;
	pickupCommand: string;
}

export type HandoffTabRequestBuildResult = { type: "valid"; request: HandoffTabRequest } | { type: "invalid"; message: string };

export type HandoffTabLaunchResult =
	| { type: "launched"; branch: string; slug: string; tabTitle: string; surfaceId: string; workspaceId: string; command: string }
	| { type: "failed"; message: string; branch?: string; slug?: string; surfaceId?: string; workspaceId?: string };

interface HandoffTabLaunchParams {
	branch: string;
	slug: string;
	key: string;
	pickupCommand: string;
}

export function buildHandoffTabRequest(options: { branch: string; focus: string }): HandoffTabRequestBuildResult {
	const focus = options.focus.trim();
	const slug = deriveSemanticHandoffSlug(focus);
	if (slug === undefined) {
		return { type: "invalid", message: "Continuation focus must contain at least one letter or number to derive a handoff slug." };
	}
	const parsedSlug = parseFlatHandoffSlug(slug);
	if (parsedSlug.type === "invalid") {
		return { type: "invalid", message: parsedSlug.message };
	}
	return {
		type: "valid",
		request: {
			branch: options.branch,
			focus,
			slug: parsedSlug.slug,
			key: handoffSlugToKey(parsedSlug.slug),
			pickupCommand: formatPickupHandoffCommand(options.branch, parsedSlug.slug),
		},
	};
}

export function buildHandoffTabPrompt(
	options:
		| { skillBlock: string | undefined; request: HandoffTabRequest }
		| { skillBlock: string | undefined; focus: string; branch: string; slug: string },
): string {
	const request = "request" in options ? options.request : legacyHandoffTabRequest(options);
	return `${options.skillBlock ?? CREATE_HANDOFF_FALLBACK}

This is a /${HANDOFF_TAB_COMMAND_NAME} request. Create a directed handoff artifact for the current session, then launch a pickup Pi in a new cmux tab.

Continuation focus:

${fencedBlock("text", request.focus)}

Use exactly this handoff identity:

- Branch: ${request.branch}
- Namespace: ${HANDOFF_NAMESPACE}
- Entry: ${request.key}
- Slug: ${request.slug}

Hard requirements:

1. Write the handoff artifact using the existing handoff-create workflow and the exact branch/key above.
2. Check for an existing artifact first. If it exists, stop; do not overwrite and do not open a cmux tab.
3. Store the final Markdown directly through /dev/stdin; do not create a temporary artifact file.
4. After the \`brmem put\` succeeds, call the ${HANDOFF_TAB_LAUNCH_TOOL_NAME} tool with exactly:

${fencedBlock("json", JSON.stringify({ branch: request.branch, slug: request.slug }, null, 2))}

5. Do not call ${HANDOFF_TAB_LAUNCH_TOOL_NAME} before the handoff is saved successfully.

The pickup tab will run this command:

${fencedBlock("text", request.pickupCommand)}`;
}

export async function handleHandoffTabCommand(pi: ExtensionAPI, args: string, ctx: CommandContext): Promise<void> {
	await ctx.waitForIdle();
	const focus = await resolveCreateFocus(pi, args, ctx);
	if (focus === undefined) {
		return;
	}

	let branch: string;
	try {
		branch = await currentBranch(pi, ctx, "create");
	} catch (error) {
		ctx.ui.notify(errorMessage(error), "error");
		return;
	}

	const builtRequest = buildHandoffTabRequest({ branch, focus });
	if (builtRequest.type === "invalid") {
		ctx.ui.notify(builtRequest.message, "error");
		return;
	}
	const request = builtRequest.request;

	setStatus(ctx, HANDOFF_TAB_STATUS_KEY, "checking handoff and cmux context…");
	try {
		const existing = await checkHandoffExists(pi, ctx.cwd, request.branch, request.key);
		if (existing.type === "exists") {
			ctx.ui.notify(
				`Handoff ${request.slug} already exists on branch ${request.branch}. Rerun /${HANDOFF_TAB_COMMAND_NAME} with a more specific focus so a different slug is derived.`,
				"error",
			);
			return;
		}
		if (existing.type === "failed") {
			ctx.ui.notify(existing.message, "error");
			return;
		}

		const caller = await identifyCmuxCaller(pi, ctx.cwd);
		if (caller.type === "failed") {
			ctx.ui.notify(caller.message, "error");
			return;
		}
	} finally {
		setStatus(ctx, HANDOFF_TAB_STATUS_KEY, undefined);
	}

	let skill: Awaited<ReturnType<typeof expandHandoffSkill>>;
	let skillReadError: string | undefined;
	try {
		skill = await expandHandoffSkill(pi, CREATE_HANDOFF_SKILL_NAME);
	} catch (error) {
		skillReadError = errorMessage(error);
	}

	ctx.ui.notify(createHandoffTabStartMessage(skill, skillReadError, request.slug), skill ? "info" : "warning");
	pi.sendUserMessage(buildHandoffTabPrompt({ skillBlock: skill?.block, request }));
}

export function buildHandoffTabLaunchTool(pi: ExtensionAPI): ToolDefinition {
	return {
		name: HANDOFF_TAB_LAUNCH_TOOL_NAME,
		label: "Launch Handoff Tab",
		description:
			"Verify a saved handoff exists, then open a focused cmux terminal tab in the current workspace and launch Pi to pick up that handoff.",
		promptSnippet: "Open a focused cmux tab to pick up a saved handoff after the handoff has been saved successfully.",
		promptGuidelines: [
			`Use ${HANDOFF_TAB_LAUNCH_TOOL_NAME} only after a /${HANDOFF_TAB_COMMAND_NAME} prompt has saved the requested handoff successfully.`,
			`${HANDOFF_TAB_LAUNCH_TOOL_NAME} verifies the handoff exists before opening cmux; do not call it before brmem put succeeds.`,
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
			},
			required: ["branch", "slug"],
		},
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const parsed = parseHandoffTabLaunchParams(params);
			if (parsed.type === "invalid") {
				return handoffTabToolFailure(parsed.message);
			}

			onUpdate?.({ content: [{ type: "text", text: "Verifying saved handoff…" }] });
			setStatus(ctx, HANDOFF_TAB_STATUS_KEY, "verifying saved handoff…");
			try {
				const launched = await launchHandoffTab(pi, ctx, parsed.params, signal, onUpdate);
				if (launched.type === "failed") {
					return handoffTabToolFailure(launched.message, launched);
				}
				return {
					content: [{ type: "text", text: formatHandoffTabLaunchSuccess(launched) }],
					details: launched,
				};
			} finally {
				setStatus(ctx, HANDOFF_TAB_STATUS_KEY, undefined);
			}
		},
	};
}

async function launchHandoffTab(
	pi: ExtensionAPI,
	ctx: ToolContext,
	params: HandoffTabLaunchParams,
	signal: AbortSignal | undefined,
	onUpdate: ((update: Partial<ToolResult>) => void) | undefined,
): Promise<HandoffTabLaunchResult> {
	const exists = await checkHandoffExists(pi, ctx.cwd, params.branch, params.key);
	if (exists.type === "missing") {
		return {
			type: "failed",
			branch: params.branch,
			slug: params.slug,
			message: `No handoff ${params.slug} found on branch ${params.branch}; no cmux tab was opened.`,
		};
	}
	if (exists.type === "failed") {
		return { type: "failed", branch: params.branch, slug: params.slug, message: exists.message };
	}

	onUpdate?.({ content: [{ type: "text", text: "Resolving cmux caller context…" }] });
	setStatus(ctx, HANDOFF_TAB_STATUS_KEY, "resolving cmux caller…");
	const identified = await identifyCmuxCaller(pi, ctx.cwd);
	if (identified.type === "failed") {
		return { type: "failed", branch: params.branch, slug: params.slug, message: identified.message };
	}

	onUpdate?.({ content: [{ type: "text", text: "Creating focused cmux tab…" }] });
	setStatus(ctx, HANDOFF_TAB_STATUS_KEY, "creating cmux tab…");
	const created = await createCmuxSurface(pi, ctx.cwd, identified.caller, signal);
	if (created.type === "failed") {
		return { type: "failed", branch: params.branch, slug: params.slug, message: created.message };
	}

	const tabTitle = `handoff: ${params.slug}`;
	const workspaceId = created.surface.workspaceId ?? identified.caller.workspaceId;
	onUpdate?.({ content: [{ type: "text", text: "Naming cmux tab…" }] });
	setStatus(ctx, HANDOFF_TAB_STATUS_KEY, "naming cmux tab…");
	const renameOptions: CmuxTabOptions = {
		workspaceId,
		surfaceId: created.surface.surfaceId,
		tabTitle,
		signal,
	};
	if (identified.caller.windowId !== undefined) {
		renameOptions.windowId = identified.caller.windowId;
	}
	const renamed = await renameCmuxTab(pi, ctx.cwd, renameOptions);
	if (renamed.type === "failed") {
		return {
			type: "failed",
			branch: params.branch,
			slug: params.slug,
			surfaceId: created.surface.surfaceId,
			workspaceId,
			message: `${renamed.message}\n\nCreated cmux surface: ${created.surface.surfaceId}\nManual recovery: ${params.pickupCommand}`,
		};
	}

	const command = buildPiLaunchCommand(params.pickupCommand, getPiLaunchOptions(piLaunchHost(pi), ctx));
	onUpdate?.({ content: [{ type: "text", text: "Launching pickup Pi…" }] });
	setStatus(ctx, HANDOFF_TAB_STATUS_KEY, "launching pickup Pi…");
	const sendOptions: CmuxSendOptions = {
		workspaceId,
		surfaceId: created.surface.surfaceId,
		text: `${command}\n`,
		signal,
	};
	if (identified.caller.windowId !== undefined) {
		sendOptions.windowId = identified.caller.windowId;
	}
	const sent = await sendCmuxText(pi, ctx.cwd, sendOptions);
	if (sent.type === "failed") {
		return {
			type: "failed",
			branch: params.branch,
			slug: params.slug,
			surfaceId: created.surface.surfaceId,
			workspaceId,
			message: `${sent.message}\n\nCreated cmux surface: ${created.surface.surfaceId}\nManual recovery: run ${command}`,
		};
	}

	return {
		type: "launched",
		branch: params.branch,
		slug: params.slug,
		tabTitle,
		surfaceId: created.surface.surfaceId,
		workspaceId,
		command,
	};
}

function parseHandoffTabLaunchParams(params: unknown): { type: "valid"; params: HandoffTabLaunchParams } | { type: "invalid"; message: string } {
	if (!isRecord(params)) {
		return { type: "invalid", message: "handoff_tab_launch parameters must be an object." };
	}
	const branch = stringField(params, "branch");
	const rawSlug = stringField(params, "slug");
	if (branch === undefined) {
		return { type: "invalid", message: "handoff_tab_launch requires a non-empty branch." };
	}
	if (rawSlug === undefined) {
		return { type: "invalid", message: "handoff_tab_launch requires a non-empty slug." };
	}
	const parsedSlug = parseFlatHandoffSlug(rawSlug, "handoff_tab_launch slug");
	if (parsedSlug.type === "invalid") {
		return { type: "invalid", message: parsedSlug.message };
	}
	return {
		type: "valid",
		params: {
			branch,
			slug: parsedSlug.slug,
			key: handoffSlugToKey(parsedSlug.slug),
			pickupCommand: formatPickupHandoffCommand(branch, parsedSlug.slug),
		},
	};
}

function legacyHandoffTabRequest(options: { focus: string; branch: string; slug: string }): HandoffTabRequest {
	return {
		branch: options.branch,
		focus: options.focus.trim(),
		slug: options.slug,
		key: `${options.slug}${HANDOFF_KEY_SUFFIX}`,
		pickupCommand: formatPickupHandoffCommand(options.branch, options.slug),
	};
}

function piLaunchHost(pi: ExtensionAPI): { getThinkingLevel(): "off" | "minimal" | "low" | "medium" | "high" | "xhigh" } {
	return {
		getThinkingLevel(): "off" | "minimal" | "low" | "medium" | "high" | "xhigh" {
			return pi.getThinkingLevel?.() ?? "medium";
		},
	};
}

function createHandoffTabStartMessage(skill: Awaited<ReturnType<typeof expandHandoffSkill>>, skillReadError: string | undefined, slug: string): string {
	if (skill !== undefined) {
		return `Starting handoff-tab workflow for ${slug}…`;
	}
	if (skillReadError !== undefined) {
		return `Could not read handoff-create skill; using fallback handoff-tab workflow prompt for ${slug}. ${skillReadError}`;
	}
	return `handoff-create skill was not found; using fallback handoff-tab workflow prompt for ${slug}.`;
}

function handoffTabToolFailure(message: string, details?: unknown): ToolResult {
	return {
		content: [{ type: "text", text: message }],
		details,
		isError: true,
	};
}

function formatHandoffTabLaunchSuccess(result: Extract<HandoffTabLaunchResult, { type: "launched" }>): string {
	return [
		"Opened handoff pickup tab.",
		`Handoff: ${result.slug}`,
		`Branch: ${result.branch}`,
		`Tab title: ${result.tabTitle}`,
		`Surface: ${result.surfaceId}`,
		`Workspace: ${result.workspaceId}`,
		`Command: ${result.command}`,
	].join("\n");
}
