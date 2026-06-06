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
import { HANDOFF_NAMESPACE, formatPickupHandoffCommand, handoffSlugToKey, parseFlatHandoffSlug } from "./identity.ts";
import { deriveHandoffContentSlug } from "./content-slug.ts";
import {
	DERIVE_HANDOFF_SLUG_TOOL_NAME,
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

interface LaunchHandoffTabOptions {
	pi: ExtensionAPI;
	ctx: ToolContext;
	params: HandoffTabLaunchParams;
	signal: AbortSignal | undefined;
	onUpdate: ((update: Partial<ToolResult>) => void) | undefined;
}

export function buildHandoffTabRequest(options: { branch: string; focus: string }): HandoffTabRequestBuildResult {
	const focus = options.focus.trim();
	if (!/[a-z0-9]/i.test(focus)) {
		return { type: "invalid", message: "Continuation focus must contain at least one letter or number." };
	}
	return {
		type: "valid",
		request: {
			branch: options.branch,
			focus,
		},
	};
}

export function buildHandoffTabPrompt(options: { skillBlock: string | undefined; request: HandoffTabRequest }): string {
	const request = options.request;
	return `${options.skillBlock ?? CREATE_HANDOFF_FALLBACK}

This is a /${HANDOFF_TAB_COMMAND_NAME} request. Create a directed handoff artifact for the current session, then launch a pickup Pi in a new cmux tab.

Continuation focus:

${fencedBlock("text", request.focus)}

Use this storage target:

- Branch: ${request.branch}
- Namespace: ${HANDOFF_NAMESPACE}
- Entry: derive from the final Markdown handoff content with ${DERIVE_HANDOFF_SLUG_TOOL_NAME}

Hard requirements:

1. Compose the final Markdown handoff artifact content first, using the existing handoff-create workflow.
2. Call ${DERIVE_HANDOFF_SLUG_TOOL_NAME} with exactly that final Markdown content.
3. Use the returned slug/key. Do not derive the entry name from the raw continuation focus.
4. Check for an existing artifact with \`brmem check <returned-key> --namespace ${HANDOFF_NAMESPACE} --branch ${request.branch}\`. If it exists, stop; do not overwrite and do not open a cmux tab.
5. If missing, store the exact final Markdown content directly through /dev/stdin with \`brmem put <returned-key> --namespace ${HANDOFF_NAMESPACE} --branch ${request.branch} --file /dev/stdin\`. Do not create a temporary artifact file.
6. After \`brmem put\` succeeds, call ${HANDOFF_TAB_LAUNCH_TOOL_NAME} with \`branch\` set to \`${request.branch}\` and \`slug\` set to the slug returned by ${DERIVE_HANDOFF_SLUG_TOOL_NAME}.
7. Do not call ${HANDOFF_TAB_LAUNCH_TOOL_NAME} before the handoff is saved successfully.

The pickup tab will run:

${fencedBlock("text", `/${PICKUP_HANDOFF_COMMAND_NAME} --branch ${request.branch} <returned-slug>`)}`;
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

	setStatus(ctx, HANDOFF_TAB_STATUS_KEY, "checking cmux context…");
	try {
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

	ctx.ui.notify(createHandoffTabStartMessage(skill, skillReadError), skill ? "info" : "warning");
	pi.sendUserMessage(buildHandoffTabPrompt({ skillBlock: skill?.block, request }));
}

export function buildDeriveHandoffSlugTool(pi: ExtensionAPI): ToolDefinition {
	return {
		name: DERIVE_HANDOFF_SLUG_TOOL_NAME,
		label: "Derive Handoff Slug",
		description: "Derive a flat semantic handoff slug from final Markdown handoff content.",
		promptSnippet: "Derive a flat semantic handoff slug from the final Markdown handoff content before checking or writing Branch Memory.",
		promptGuidelines: [
			`Use ${DERIVE_HANDOFF_SLUG_TOOL_NAME} after composing the final Markdown handoff artifact content.`,
			"Do not derive the handoff entry name from the raw continuation focus when this tool is available.",
		],
		parameters: {
			type: "object",
			additionalProperties: false,
			properties: {
				content: {
					type: "string",
					description: "Final Markdown handoff artifact content.",
				},
			},
			required: ["content"],
		},
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const content = parseDeriveHandoffSlugParams(params);
			if (content.type === "invalid") {
				return handoffTabToolFailure(content.message);
			}

			onUpdate?.({ content: [{ type: "text", text: "Deriving handoff slug from final artifact content…" }] });
			setStatus(ctx, HANDOFF_TAB_STATUS_KEY, "deriving handoff slug…");
			try {
				const evidence = await deriveHandoffContentSlug(pi, { content: content.content, cwd: ctx.cwd, signal });
				const key = handoffSlugToKey(evidence.slug);
				return {
					content: [{ type: "text", text: [`Slug: ${evidence.slug}`, `Entry: ${key}`].join("\n") }],
					details: {
						type: "derived",
						slug: evidence.slug,
						key,
						provider: evidence.provider,
						model: evidence.model,
					},
				};
			} catch (error) {
				return handoffTabToolFailure(errorMessage(error));
			} finally {
				setStatus(ctx, HANDOFF_TAB_STATUS_KEY, undefined);
			}
		},
	};
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
				const launched = await launchHandoffTab({ pi, ctx, params: parsed.params, signal, onUpdate });
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

async function launchHandoffTab(options: LaunchHandoffTabOptions): Promise<HandoffTabLaunchResult> {
	const exists = await checkHandoffExists(options.pi, options.ctx.cwd, options.params.branch, options.params.key);
	if (exists.type === "missing") {
		return {
			type: "failed",
			branch: options.params.branch,
			slug: options.params.slug,
			message: `No handoff ${options.params.slug} found on branch ${options.params.branch}; no cmux tab was opened.`,
		};
	}
	if (exists.type === "failed") {
		return { type: "failed", branch: options.params.branch, slug: options.params.slug, message: exists.message };
	}

	options.onUpdate?.({ content: [{ type: "text", text: "Resolving cmux caller context…" }] });
	setStatus(options.ctx, HANDOFF_TAB_STATUS_KEY, "resolving cmux caller…");
	const identified = await identifyCmuxCaller(options.pi, options.ctx.cwd);
	if (identified.type === "failed") {
		return { type: "failed", branch: options.params.branch, slug: options.params.slug, message: identified.message };
	}

	options.onUpdate?.({ content: [{ type: "text", text: "Creating focused cmux tab…" }] });
	setStatus(options.ctx, HANDOFF_TAB_STATUS_KEY, "creating cmux tab…");
	const created = await createCmuxSurface({ host: options.pi, cwd: options.ctx.cwd, caller: identified.caller, signal: options.signal });
	if (created.type === "failed") {
		return { type: "failed", branch: options.params.branch, slug: options.params.slug, message: created.message };
	}

	const tabTitle = `handoff: ${options.params.slug}`;
	const workspaceId = created.surface.workspaceId ?? identified.caller.workspaceId;
	options.onUpdate?.({ content: [{ type: "text", text: "Naming cmux tab…" }] });
	setStatus(options.ctx, HANDOFF_TAB_STATUS_KEY, "naming cmux tab…");
	const renameOptions: CmuxTabOptions = {
		workspaceId,
		surfaceId: created.surface.surfaceId,
		tabTitle,
		signal: options.signal,
	};
	if (identified.caller.windowId !== undefined) {
		renameOptions.windowId = identified.caller.windowId;
	}
	const renamed = await renameCmuxTab(options.pi, options.ctx.cwd, renameOptions);
	if (renamed.type === "failed") {
		return {
			type: "failed",
			branch: options.params.branch,
			slug: options.params.slug,
			surfaceId: created.surface.surfaceId,
			workspaceId,
			message: `${renamed.message}\n\nCreated cmux surface: ${created.surface.surfaceId}\nManual recovery: ${options.params.pickupCommand}`,
		};
	}

	const command = buildPiLaunchCommand(options.params.pickupCommand, getPiLaunchOptions(piLaunchHost(options.pi), options.ctx));
	options.onUpdate?.({ content: [{ type: "text", text: "Launching pickup Pi…" }] });
	setStatus(options.ctx, HANDOFF_TAB_STATUS_KEY, "launching pickup Pi…");
	const sendOptions: CmuxSendOptions = {
		workspaceId,
		surfaceId: created.surface.surfaceId,
		text: `${command}\n`,
		signal: options.signal,
	};
	if (identified.caller.windowId !== undefined) {
		sendOptions.windowId = identified.caller.windowId;
	}
	const sent = await sendCmuxText(options.pi, options.ctx.cwd, sendOptions);
	if (sent.type === "failed") {
		return {
			type: "failed",
			branch: options.params.branch,
			slug: options.params.slug,
			surfaceId: created.surface.surfaceId,
			workspaceId,
			message: `${sent.message}\n\nCreated cmux surface: ${created.surface.surfaceId}\nManual recovery: run ${command}`,
		};
	}

	return {
		type: "launched",
		branch: options.params.branch,
		slug: options.params.slug,
		tabTitle,
		surfaceId: created.surface.surfaceId,
		workspaceId,
		command,
	};
}

function parseDeriveHandoffSlugParams(params: unknown): { type: "valid"; content: string } | { type: "invalid"; message: string } {
	if (!isRecord(params)) {
		return { type: "invalid", message: `${DERIVE_HANDOFF_SLUG_TOOL_NAME} parameters must be an object.` };
	}
	const content = stringField(params, "content");
	if (content === undefined || content.trim().length === 0) {
		return { type: "invalid", message: `${DERIVE_HANDOFF_SLUG_TOOL_NAME} requires non-empty final Markdown content.` };
	}
	return { type: "valid", content };
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

function piLaunchHost(pi: ExtensionAPI): { getThinkingLevel(): "off" | "minimal" | "low" | "medium" | "high" | "xhigh" } {
	return {
		getThinkingLevel(): "off" | "minimal" | "low" | "medium" | "high" | "xhigh" {
			return pi.getThinkingLevel?.() ?? "medium";
		},
	};
}

function createHandoffTabStartMessage(skill: Awaited<ReturnType<typeof expandHandoffSkill>>, skillReadError: string | undefined): string {
	if (skill !== undefined) {
		return "Starting handoff-tab workflow with content-derived slug…";
	}
	if (skillReadError !== undefined) {
		return `Could not read handoff-create skill; using fallback handoff-tab workflow prompt for a content-derived slug. ${skillReadError}`;
	}
	return "handoff-create skill was not found; using fallback handoff-tab workflow prompt for a content-derived slug.";
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
