import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import {
	generateBranchSlug,
	MAX_BRANCH_SLUG_LENGTH,
	sanitizeBranchName,
	trimBranchSlugToLength,
} from "./branch-slug.ts";
import { buildPiLaunchCommand, getPiLaunchOptions } from "./pi-launch.ts";
import { formatErrorMessage, type TextResult } from "./primitives.ts";
import { openBranchInCmuxSlot } from "./slot.ts";
import type { CommandContext, ExtensionAPI } from "./types.ts";

const COMMAND_NAME = "cmux-slot:dispatch-prompt";
const PROMPT_DIR = join(homedir(), ".pi", "agent", "cmux-slot-dispatch-prompts");

interface BranchCreateResult {
	branchName: string;
	parentBranch: string;
	startPoint: string;
}

export interface CmuxSlotDispatchPromptOptions {
	promptDir?: string;
	now?: () => number;
}

export interface ResolvedCmuxSlotDispatchPromptOptions {
	promptDir: string;
	now: () => number;
}

export interface HandleCmuxSlotDispatchPromptOptions {
	pi: Pick<ExtensionAPI, "exec" | "getThinkingLevel">;
	dispatchOptions: ResolvedCmuxSlotDispatchPromptOptions;
	args: string;
	ctx: CommandContext;
}

export function registerCmuxSlotDispatchPromptCommand(
	pi: ExtensionAPI,
	options: CmuxSlotDispatchPromptOptions = {},
): void {
	const resolvedOptions = resolveCmuxSlotDispatchPromptOptions(options);
	pi.registerCommand(COMMAND_NAME, {
		description: "Create a Graphite-tracked branch and run a prompt in a new cmux Pi slot",
		argumentHint: "<prompt>",
		handler: async (args, ctx) => {
			await handleCmuxSlotDispatchPrompt({ pi, dispatchOptions: resolvedOptions, args, ctx });
		},
	});
}

export async function handleCmuxSlotDispatchPrompt(options: HandleCmuxSlotDispatchPromptOptions): Promise<void> {
	const { pi, dispatchOptions, args, ctx } = options;
	const prompt = args.trim();
	if (prompt.length === 0) {
		ctx.ui.notify(`Usage: /${COMMAND_NAME} <prompt>`, "error");
		return;
	}

	await ctx.waitForIdle();
	ctx.ui.notify("Generating branch name…", "info");

	const branch = await createTrackedBranchForPrompt(pi, ctx.cwd, prompt);
	if ("error" in branch) {
		ctx.ui.notify(branch.error, "error");
		return;
	}

	let promptFile: string;
	try {
		promptFile = await writePromptFile(dispatchOptions, branch.branchName, prompt);
	} catch (error) {
		ctx.ui.notify(`Failed to write cmux slot dispatch prompt file: ${formatErrorMessage(error)}`, "error");
		return;
	}

	const launchOptions = getPiLaunchOptions(pi, ctx);
	const launched = await openBranchInCmuxSlot({
		pi,
		cwd: ctx.cwd,
		branchName: branch.branchName,
		command: buildPiLaunchCommand(`@${promptFile}`, launchOptions),
		notify: (message, level) => ctx.ui.notify(message, level),
		successMessage: (target) =>
			[
				`Opened cmux workspace: ${target.branchName}`,
				`Parent: ${branch.parentBranch}`,
				`Start point: ${branch.startPoint}`,
			].join("\n"),
	});
	if ("error" in launched) {
		return;
	}
}

export async function createTrackedBranchForPrompt(
	pi: Pick<ExtensionAPI, "exec">,
	cwd: string,
	prompt: string,
): Promise<BranchCreateResult | { error: string }> {
	const parent = await runText(pi, cwd, "git", ["symbolic-ref", "--short", "HEAD"]);
	if (!parent.ok) {
		return { error: `Could not resolve current branch: ${parent.message}` };
	}

	const startPoint = await runText(pi, cwd, "git", ["rev-parse", "HEAD"]);
	if (!startPoint.ok) {
		return { error: `Could not resolve HEAD: ${startPoint.message}` };
	}

	const slug = await generateBranchSlug(pi, cwd, { kind: "task", content: prompt });
	if (!slug.ok) {
		return { error: slug.message };
	}

	const branchName = await chooseAvailableBranchName(pi, cwd, slug.text);
	const create = await runText(pi, cwd, "git", ["branch", branchName, "HEAD"]);
	if (!create.ok) {
		return { error: `Failed to create branch ${branchName}: ${create.message}` };
	}

	const track = await runText(pi, cwd, "gt", [
		"track",
		branchName,
		"--parent",
		parent.text,
		"--no-interactive",
	]);
	if (!track.ok) {
		return {
			error: [
				`Created git branch ${branchName}, but Graphite tracking failed:`,
				track.message,
				"The slot/cmux session was not launched.",
			].join("\n"),
		};
	}

	return {
		branchName,
		parentBranch: parent.text,
		startPoint: startPoint.text,
	};
}

async function chooseAvailableBranchName(pi: Pick<ExtensionAPI, "exec">, cwd: string, baseName: string): Promise<string> {
	let candidate = baseName;
	for (let suffix = 2; await branchExists(pi, cwd, candidate); suffix += 1) {
		candidate = appendBranchSuffix(baseName, suffix);
	}
	return candidate;
}

async function branchExists(pi: Pick<ExtensionAPI, "exec">, cwd: string, branchName: string): Promise<boolean> {
	const result = await pi.exec("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`], {
		cwd,
		timeout: 5_000,
	});
	return result.code === 0;
}

function appendBranchSuffix(branchName: string, suffix: number): string {
	const suffixText = `-${suffix}`;
	const stem = trimBranchSlugToLength(branchName, MAX_BRANCH_SLUG_LENGTH - suffixText.length);
	return `${stem}${suffixText}`;
}

export async function writePromptFile(
	options: ResolvedCmuxSlotDispatchPromptOptions,
	branchName: string,
	prompt: string,
): Promise<string> {
	await mkdir(options.promptDir, { recursive: true });
	const safeName = sanitizeBranchName(branchName)?.replace(/\//g, "-") ?? "prompt";
	const path = join(options.promptDir, `${options.now()}-${safeName}.md`);
	await writeFile(path, buildLaunchPrompt(prompt), "utf8");
	return path;
}

export function buildLaunchPrompt(prompt: string): string {
	return [
		prompt,
		"",
		"## Completion instructions",
		"After you finish the implementation:",
		"1. Create or update the branch commit using the repo's normal workflow.",
		"2. Then run `!gt submit -nps --ai`.",
	].join("\n");
}

function resolveCmuxSlotDispatchPromptOptions(options: CmuxSlotDispatchPromptOptions): ResolvedCmuxSlotDispatchPromptOptions {
	return {
		promptDir: options.promptDir ?? PROMPT_DIR,
		now: options.now ?? Date.now,
	};
}


async function runText(
	pi: Pick<ExtensionAPI, "exec">,
	cwd: string,
	command: string,
	args: string[],
): Promise<TextResult> {
	const result = await pi.exec(command, args, { cwd, timeout: 30_000 });
	if (result.code === 0 && !result.killed) {
		return { ok: true, text: result.stdout.trim() };
	}
	return {
		ok: false,
		message: result.stderr.trim() || result.stdout.trim() || `${command} exited with ${result.code}`,
	};
}
