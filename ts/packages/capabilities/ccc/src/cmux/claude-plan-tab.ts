import { formatShellArg } from "@nseng-ai/core/command";
import { formatErrorMessage } from "@nseng-ai/core/primitives";
import {
	launchFocusedCmuxTab,
	type FocusedCmuxTabLaunchResult,
} from "@nseng-ai/capability-kit/cmux/focused-terminal-tab";
import { isRecord, stringField } from "@nseng-ai/core/primitives";
import { writeTimestampedPromptFile, type ResolvedPromptFileOptions } from "./prompt-file.ts";
import type { CommandContext, ExtensionAPI } from "@nseng-ai/capability-kit/cmux/types";

const TITLE_PREFIX = "claude-plan: ";
const MAX_TITLE_SEED_CHARS = 40;

export async function handleCccClaudePlanTab(options: {
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
		promptFile = await writeTimestampedPromptFile({
			...promptOptions,
			stem: "claude-plan",
			content: seed,
		});
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
