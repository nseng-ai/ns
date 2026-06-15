import { formatErrorMessage } from "@asdl/core/primitives";
import { handoffSlugToKey, parseFlatHandoffSlug } from "@asdl/handoff/identity";

import { formatPickupHandoffCommand } from "./identity.ts";
import {
	buildHandoffLaunchPrompt,
	buildHandoffLaunchRequest,
	buildHandoffLaunchTool,
	runHandoffCreateCommand,
	type HandoffLaunchPromptCopy,
} from "./launch-flow.ts";
import {
	checkHandoffExists,
	currentBranch,
	HANDOFF_SELF_COMMAND_NAME,
	HANDOFF_SELF_LAUNCH_TOOL_NAME,
	HANDOFF_SELF_PICKUP_COMMAND_NAME,
	HANDOFF_SELF_STATUS_KEY,
	PICKUP_HANDOFF_COMMAND_NAME,
	setStatus,
	type HandoffStartMessages,
} from "./shared.ts";
import type { CommandContext, ExtensionAPI, ReplacedSessionContext, ToolDefinition } from "./runtime-types.ts";

export interface HandoffSelfQueuedPickupResult {
	type: "queued";
	branch: string;
	slug: string;
	command: string;
}

interface HandoffSelfPickupArgs {
	help: boolean;
	branch?: string;
	slug?: string;
}

export type HandoffSelfPickupArgsParseResult =
	| { type: "valid"; args: HandoffSelfPickupArgs }
	| { type: "invalid"; message: string };

export const HANDOFF_SELF_PROMPT_COPY = {
	commandName: HANDOFF_SELF_COMMAND_NAME,
	toolName: HANDOFF_SELF_LAUNCH_TOOL_NAME,
	intentSentence: "Create a directed handoff artifact for the current session, then clear this session's context and pick up that handoff here in a fresh session.",
	abortClause: "do not clear context or pick up the handoff",
	previewHeading: "After saving, the current session will queue this follow-up; that command replaces the session and runs pickup:",
	previewBody(branch: string): string {
		return `${formatHandoffSelfPickupCommand("<returned-slug>")}\n/${PICKUP_HANDOFF_COMMAND_NAME} --branch ${branch} <returned-slug>`;
	},
} satisfies HandoffLaunchPromptCopy;

const HANDOFF_SELF_START_MESSAGES = {
	ready: "Starting handoff:self workflow with content-derived slug…",
	fallbackLabel: "handoff:self workflow prompt for a content-derived slug",
} satisfies HandoffStartMessages;

const HANDOFF_SELF_PICKUP_USAGE = `Usage: /${HANDOFF_SELF_PICKUP_COMMAND_NAME} [--branch <branch>] <semantic-slug>

Verify a saved handoff, replace the current session with a fresh one, and run /${PICKUP_HANDOFF_COMMAND_NAME} for that handoff.

Options:
  --branch <branch>  Pick up a handoff from an explicit branch instead of the current branch.
  --help, -h         Show this help.`;

export const buildHandoffSelfRequest = buildHandoffLaunchRequest;

export function buildHandoffSelfPrompt(options: Parameters<typeof buildHandoffLaunchPrompt>[1]): string {
	return buildHandoffLaunchPrompt(HANDOFF_SELF_PROMPT_COPY, options);
}

export function formatHandoffSelfPickupCommand(slug: string, branch?: string): string {
	return branch === undefined ? `/${HANDOFF_SELF_PICKUP_COMMAND_NAME} ${slug}` : `/${HANDOFF_SELF_PICKUP_COMMAND_NAME} --branch ${branch} ${slug}`;
}

export async function handleHandoffSelfCommand(pi: ExtensionAPI, args: string, ctx: CommandContext): Promise<void> {
	await runHandoffCreateCommand(pi, args, ctx, {
		statusKey: HANDOFF_SELF_STATUS_KEY,
		promptCopy: HANDOFF_SELF_PROMPT_COPY,
		startMessages: HANDOFF_SELF_START_MESSAGES,
	});
}

export async function handleHandoffSelfPickupCommand(pi: ExtensionAPI, rawArgs: string, ctx: CommandContext): Promise<void> {
	await ctx.waitForIdle();

	const parsedArgs = parseHandoffSelfPickupArgs(rawArgs);
	if (parsedArgs.type === "invalid") {
		ctx.ui.notify(`Usage error: ${parsedArgs.message}\n\n${HANDOFF_SELF_PICKUP_USAGE}`, "error");
		return;
	}

	const args = parsedArgs.args;
	if (args.help) {
		ctx.ui.notify(HANDOFF_SELF_PICKUP_USAGE, "info");
		return;
	}

	if (ctx.newSession === undefined) {
		ctx.ui.notify(
			`/${HANDOFF_SELF_PICKUP_COMMAND_NAME} requires Pi session replacement support. Run /${PICKUP_HANDOFF_COMMAND_NAME} manually instead.`,
			"error",
		);
		return;
	}

	const rawSlug = args.slug;
	if (rawSlug === undefined) {
		ctx.ui.notify(`Usage error: Missing semantic slug.\n\n${HANDOFF_SELF_PICKUP_USAGE}`, "error");
		return;
	}

	const parsedSlug = parseFlatHandoffSlug(rawSlug, `${HANDOFF_SELF_PICKUP_COMMAND_NAME} slug`);
	if (parsedSlug.type === "invalid") {
		ctx.ui.notify(`Usage error: ${parsedSlug.message}\n\n${HANDOFF_SELF_PICKUP_USAGE}`, "error");
		return;
	}

	let branch: string;
	try {
		branch = args.branch ?? (await currentBranch(pi, ctx, "pick up"));
	} catch (error) {
		ctx.ui.notify(formatErrorMessage(error), "error");
		return;
	}

	const key = handoffSlugToKey(parsedSlug.slug);
	setStatus(ctx, HANDOFF_SELF_STATUS_KEY, "verifying saved handoff…");
	try {
		const exists = await checkHandoffExists(pi, ctx.cwd, branch, key);
		if (exists.type === "missing") {
			ctx.ui.notify(`No handoff ${parsedSlug.slug} found on branch ${branch}; context was not cleared.`, "error");
			return;
		}
		if (exists.type === "failed") {
			ctx.ui.notify(exists.message, "error");
			return;
		}
	} finally {
		setStatus(ctx, HANDOFF_SELF_STATUS_KEY, undefined);
	}

	const pickupCommand = formatPickupHandoffCommand(branch, parsedSlug.slug);
	const parentSession = ctx.sessionManager?.getSessionFile?.();

	const withSession = async (replacementCtx: ReplacedSessionContext): Promise<void> => {
		replacementCtx.ui.notify(`Picking up handoff ${parsedSlug.slug} from branch ${branch}…`, "info");
		await replacementCtx.sendUserMessage(pickupCommand);
	};

	setStatus(ctx, HANDOFF_SELF_STATUS_KEY, "clearing context…");
	try {
		const result = await ctx.newSession(parentSession === undefined ? { withSession } : { parentSession, withSession });
		if (result.cancelled) {
			ctx.ui.notify("handoff:self context clear was cancelled; handoff was not picked up.", "info");
		}
	} catch (error) {
		ctx.ui.notify(`Failed to clear context for handoff:self. ${formatErrorMessage(error)}`, "error");
	} finally {
		setStatus(ctx, HANDOFF_SELF_STATUS_KEY, undefined);
	}
}

export function buildHandoffSelfLaunchTool(pi: ExtensionAPI): ToolDefinition {
	return buildHandoffLaunchTool(pi, {
		name: HANDOFF_SELF_LAUNCH_TOOL_NAME,
		label: "Queue Handoff Self Pickup",
		description: "Verify a saved handoff exists, then queue Pi to clear this session's context and pick up that handoff.",
		promptSnippet: "Queue a follow-up command to clear context and pick up a saved handoff after the handoff has been saved successfully.",
		promptGuidelines: [
			`Use ${HANDOFF_SELF_LAUNCH_TOOL_NAME} only after a /${HANDOFF_SELF_COMMAND_NAME} prompt has saved the requested handoff successfully.`,
			`${HANDOFF_SELF_LAUNCH_TOOL_NAME} verifies the handoff exists before queueing context clearing; do not call it before brmem put succeeds.`,
		],
		statusKey: HANDOFF_SELF_STATUS_KEY,
		verifyStatus: () => "verifying saved handoff…",
		verifyUpdate: "Verifying saved handoff…",
		missingMessage: (params) => `No handoff ${params.slug} found on branch ${params.branch}; context was not cleared.`,
		verifyFailureDetails(message, params) {
			return { type: "failed", branch: params.branch, slug: params.slug, message };
		},
		async launch({ params, ctx }) {
			const commandBranch = await resolveQueuedPickupBranch(pi, ctx, params.branch);
			const command = formatHandoffSelfPickupCommand(params.slug, commandBranch);
			pi.sendUserMessage(command, { deliverAs: "followUp" });
			return {
				content: [
					{
						type: "text",
						text: `Queued handoff:self pickup.\nCommand: ${command}\nThe follow-up command will clear context and pick up ${params.slug}.`,
					},
				],
				details: { type: "queued", branch: params.branch, slug: params.slug, command } satisfies HandoffSelfQueuedPickupResult,
			};
		},
	});
}

export function parseHandoffSelfPickupArgs(rawArgs: string): HandoffSelfPickupArgsParseResult {
	const parsed: HandoffSelfPickupArgs = { help: false };
	const selectors: string[] = [];
	const tokens = tokenizeArgs(rawArgs);

	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (token === undefined) {
			continue;
		}

		if (token === "--help" || token === "-h") {
			parsed.help = true;
			continue;
		}
		if (token === "--branch") {
			const value = tokens[index + 1];
			if (value === undefined || value.startsWith("--")) {
				return { type: "invalid", message: "Missing value for --branch." };
			}
			parsed.branch = value;
			index += 1;
			continue;
		}
		if (token.startsWith("--branch=")) {
			const value = token.slice("--branch=".length);
			if (value.length === 0) {
				return { type: "invalid", message: "Missing value for --branch." };
			}
			parsed.branch = value;
			continue;
		}
		if (token.startsWith("-")) {
			return { type: "invalid", message: `Unknown flag: ${token}` };
		}
		if (token.includes("/")) {
			return { type: "invalid", message: "Handoff slug cannot contain '/'." };
		}
		selectors.push(token);
	}

	if (selectors.length > 1) {
		return { type: "invalid", message: "Expected exactly one semantic slug." };
	}
	if (selectors.length === 1) {
		const slug = selectors[0];
		if (slug !== undefined) {
			parsed.slug = slug;
		}
	}

	return { type: "valid", args: parsed };
}

async function resolveQueuedPickupBranch(pi: ExtensionAPI, ctx: Pick<CommandContext, "cwd">, savedBranch: string): Promise<string | undefined> {
	try {
		const branch = await currentBranch(pi, ctx, "pick up");
		return branch === savedBranch ? undefined : savedBranch;
	} catch (_error) {
		return savedBranch;
	}
}

function tokenizeArgs(rawArgs: string): string[] {
	return rawArgs
		.trim()
		.split(/\s+/)
		.filter((token) => token.length > 0);
}
