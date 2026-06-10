import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { formatShellArg } from "@asdl/pi-extension-runtime/command-runtime";
import {
	createCmuxSurface,
	identifyCmuxCaller,
	renameCmuxTab,
	sendCmuxText,
	type CmuxSendOptions,
	type CmuxTabOptions,
} from "./focused-terminal-tab.ts";
import { formatErrorMessage, isRecord, stringField } from "./primitives.ts";
import type { CommandContext, ExtensionAPI } from "./types.ts";

const COMMAND_NAME = "ccc:claude-plan-tab";
const PROMPT_DIR = join(homedir(), ".pi", "agent", "ccc-claude-plan-tab-prompts");
const TITLE_PREFIX = "claude-plan: ";
const MAX_TITLE_SEED_CHARS = 40;

export interface CccClaudePlanTabOptions {
	promptDir?: string;
	now?: () => number;
}

interface ResolvedCccClaudePlanTabOptions {
	promptDir: string;
	now: () => number;
}

export type ClaudePlanTabLaunchResult =
	| { type: "launched"; tabTitle: string; surfaceId: string; workspaceId: string; command: string; promptFile: string }
	| { type: "failed"; message: string; surfaceId?: string; workspaceId?: string };

export function registerCccClaudePlanTabCommand(pi: ExtensionAPI, options: CccClaudePlanTabOptions = {}): void {
	const resolvedOptions = resolveCccClaudePlanTabOptions(options);
	pi.registerCommand(COMMAND_NAME, {
		description: "Open a new cmux tab running Claude Code in plan mode, seeded with the last assistant message.",
		handler: async (_args, ctx) => {
			await handleCccClaudePlanTab({ pi, ctx, options: resolvedOptions });
		},
	});
}

export async function handleCccClaudePlanTab(options: {
	pi: ExtensionAPI;
	ctx: CommandContext;
	options: ResolvedCccClaudePlanTabOptions;
}): Promise<void> {
	const result = await launchCccClaudePlanTab(options);
	if (result.type === "failed") {
		options.ctx.ui.notify(result.message, "error");
		return;
	}

	options.ctx.ui.notify(formatClaudePlanTabLaunchSuccess(result), "info");
}

export async function launchCccClaudePlanTab(options: {
	pi: ExtensionAPI;
	ctx: CommandContext;
	options: ResolvedCccClaudePlanTabOptions;
}): Promise<ClaudePlanTabLaunchResult> {
	const { pi, ctx } = options;
	await ctx.waitForIdle();

	const entries = ctx.sessionManager?.getBranch?.() ?? ctx.sessionManager?.getEntries?.() ?? [];
	const seed = extractLastAssistantText(entries);
	if (seed === undefined) {
		return { type: "failed", message: "No assistant message found in this session to use as a seed plan." };
	}

	let promptFile: string;
	try {
		promptFile = await writeClaudePlanPromptFile(options.options, seed);
	} catch (error) {
		return { type: "failed", message: `Failed to write Claude plan prompt file: ${formatErrorMessage(error)}` };
	}

	const command = buildClaudePlanLaunchCommand(promptFile);
	const identified = await identifyCmuxCaller(pi, ctx.cwd);
	if (identified.type === "failed") {
		return { type: "failed", message: identified.message };
	}

	const created = await createCmuxSurface({ host: pi, cwd: ctx.cwd, caller: identified.caller, signal: undefined });
	if (created.type === "failed") {
		return { type: "failed", message: created.message };
	}

	const tabTitle = buildClaudePlanTabTitle(seed);
	const workspaceId = created.surface.workspaceId ?? identified.caller.workspaceId;
	const windowIdEntry = identified.caller.windowId === undefined ? {} : { windowId: identified.caller.windowId };
	const renameOptions: CmuxTabOptions = {
		workspaceId,
		surfaceId: created.surface.surfaceId,
		tabTitle,
		signal: undefined,
		...windowIdEntry,
	};
	const renamed = await renameCmuxTab(pi, ctx.cwd, renameOptions);
	if (renamed.type === "failed") {
		return {
			type: "failed",
			surfaceId: created.surface.surfaceId,
			workspaceId,
			message: `${renamed.message}\n\nCreated cmux surface: ${created.surface.surfaceId}\nManual recovery: run ${command}`,
		};
	}

	const sendOptions: CmuxSendOptions = {
		workspaceId,
		surfaceId: created.surface.surfaceId,
		text: `${command}\n`,
		signal: undefined,
		...windowIdEntry,
	};
	const sent = await sendCmuxText(pi, ctx.cwd, sendOptions);
	if (sent.type === "failed") {
		return {
			type: "failed",
			surfaceId: created.surface.surfaceId,
			workspaceId,
			message: `${sent.message}\n\nCreated cmux surface: ${created.surface.surfaceId}\nManual recovery: run ${command}`,
		};
	}

	return {
		type: "launched",
		tabTitle,
		surfaceId: created.surface.surfaceId,
		workspaceId,
		command,
		promptFile,
	};
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

export function buildClaudePlanTabTitle(seed: string): string {
	const firstLine = seed
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find((line) => line.length > 0);
	const titleSeed = truncateTitleSeed(firstLine ?? "seed plan");
	return `${TITLE_PREFIX}${titleSeed}`;
}

export function formatClaudePlanTabLaunchSuccess(result: Extract<ClaudePlanTabLaunchResult, { type: "launched" }>): string {
	return [
		"Opened Claude plan tab.",
		`Tab title: ${result.tabTitle}`,
		`Surface: ${result.surfaceId}`,
		`Workspace: ${result.workspaceId}`,
		`Prompt file: ${result.promptFile}`,
		`Command: ${result.command}`,
	].join("\n");
}

async function writeClaudePlanPromptFile(
	options: ResolvedCccClaudePlanTabOptions,
	seed: string,
): Promise<string> {
	await mkdir(options.promptDir, { recursive: true });
	const path = join(options.promptDir, `${options.now()}-claude-plan.md`);
	await writeFile(path, seed, "utf8");
	return path;
}

function textFromAssistantMessage(message: Record<string, unknown>): string | undefined {
	const content = message.content;
	const text = Array.isArray(content) ? content.map(textFromContentBlock).join("") : typeof content === "string" ? content : undefined;
	return text === undefined || text.trim().length === 0 ? undefined : text;
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

function resolveCccClaudePlanTabOptions(options: CccClaudePlanTabOptions): ResolvedCccClaudePlanTabOptions {
	return {
		promptDir: options.promptDir ?? PROMPT_DIR,
		now: options.now ?? Date.now,
	};
}
