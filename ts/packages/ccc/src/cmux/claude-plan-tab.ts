import { homedir } from "node:os";
import { join } from "node:path";

import { formatShellArg } from "@asdl/core/exec";
import { launchFocusedCmuxTab, type FocusedCmuxTabLaunchResult } from "./focused-terminal-tab.ts";
import { formatErrorMessage, isRecord, stringField } from "./primitives.ts";
import {
	resolvePromptFileOptions,
	writeTimestampedPromptFile,
	type PromptFileOptions,
	type ResolvedPromptFileOptions,
} from "./prompt-file.ts";
import type { CommandContext, ExtensionAPI } from "./types.ts";

const COMMAND_NAME = "ccc:claude-plan-tab";
const PROMPT_DIR = join(homedir(), ".pi", "agent", "ccc-claude-plan-tab-prompts");
const TITLE_PREFIX = "claude-plan: ";
const MAX_TITLE_SEED_CHARS = 40;

export function registerCccClaudePlanTabCommand(pi: ExtensionAPI, options: PromptFileOptions = {}): void {
	const promptOptions = resolvePromptFileOptions(options, PROMPT_DIR);
	pi.registerCommand(COMMAND_NAME, {
		description: "Open a new cmux tab running Claude Code in plan mode, seeded with the provided prompt or last assistant message.",
		argumentHint: "[seed prompt]",
		handler: async (args, ctx) => {
			await handleCccClaudePlanTab({ pi, ctx, args, promptOptions });
		},
	});
}

async function handleCccClaudePlanTab(options: {
	pi: ExtensionAPI;
	ctx: CommandContext;
	args: string;
	promptOptions: ResolvedPromptFileOptions;
}): Promise<void> {
	const { pi, ctx, promptOptions } = options;
	await ctx.waitForIdle();

	const seed = resolveClaudePlanSeed(ctx, options.args);
	if (seed === undefined) {
		ctx.ui.notify("No assistant message found in this session to use as a seed plan.", "error");
		return;
	}

	let promptFile: string;
	try {
		promptFile = await writeTimestampedPromptFile({ ...promptOptions, stem: "claude-plan", content: seed });
	} catch (error) {
		ctx.ui.notify(`Failed to write Claude plan prompt file: ${formatErrorMessage(error)}`, "error");
		return;
	}

	const launched = await launchFocusedCmuxTab({
		host: pi,
		cwd: ctx.cwd,
		tabTitle: buildClaudePlanTabTitle(seed),
		command: buildClaudePlanLaunchCommand(promptFile),
		signal: undefined,
	});
	if (launched.type === "failed") {
		ctx.ui.notify(launched.message, "error");
		return;
	}

	ctx.ui.notify(formatClaudePlanTabLaunchSuccess(launched, promptFile), "info");
}

export function extractLastAssistantText(entries: unknown[]): string | undefined {
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index];
		if (!isRecord(entry) || entry.type !== "message" || !isRecord(entry.message)) continue;
		if (stringField(entry.message, "role") !== "assistant") continue;

		return textFromAssistantMessage(entry.message);
	}

	return undefined;
}

export function buildClaudePlanLaunchCommand(promptFilePath: string): string {
	return `claude --permission-mode plan "$(cat ${formatShellArg(promptFilePath)})"`;
}

function resolveClaudePlanSeed(ctx: CommandContext, args: string): string | undefined {
	if (args.trim().length > 0) return args;

	const entries = ctx.sessionManager?.getBranch?.() ?? ctx.sessionManager?.getEntries?.() ?? [];
	return extractLastAssistantText(entries);
}

export function buildClaudePlanTabTitle(seed: string): string {
	const firstLine = seed
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find((line) => line.length > 0);
	const titleSeed = truncateTitleSeed(firstLine ?? "seed plan");
	return `${TITLE_PREFIX}${titleSeed}`;
}

function formatClaudePlanTabLaunchSuccess(
	result: Extract<FocusedCmuxTabLaunchResult, { type: "launched" }>,
	promptFile: string,
): string {
	return [
		"Opened Claude plan tab.",
		`Tab title: ${result.tabTitle}`,
		`Surface: ${result.surfaceId}`,
		`Workspace: ${result.workspaceId}`,
		`Prompt file: ${promptFile}`,
		`Command: ${result.command}`,
	].join("\n");
}

function textFromAssistantMessage(message: Record<string, unknown>): string | undefined {
	const text = textFromAssistantContent(message.content);
	if (text === undefined) return undefined;
	if (text.trim().length === 0) return undefined;
	return text;
}

function textFromAssistantContent(content: unknown): string | undefined {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return undefined;
	return content.map(textFromContentBlock).join("");
}

function textFromContentBlock(block: unknown): string {
	if (!isRecord(block) || stringField(block, "type") !== "text") return "";
	return stringField(block, "text") ?? "";
}

function truncateTitleSeed(seed: string): string {
	const chars = Array.from(seed);
	if (chars.length <= MAX_TITLE_SEED_CHARS) return seed;
	return `${chars.slice(0, MAX_TITLE_SEED_CHARS - 1).join("")}…`;
}
