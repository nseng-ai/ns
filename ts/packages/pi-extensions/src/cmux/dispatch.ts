import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import {
	generateBranchSlug,
	MAX_BRANCH_SLUG_LENGTH,
	sanitizeBranchName,
	trimBranchSlugToLength,
} from "./branch-slug.ts";
import { checkoutSlot, openCmuxWorkspace } from "./slot.ts";
import type { CmuxWorkspaceSummaryController } from "./workspace-summary.ts";
import type { CommandContext, ExtensionAPI } from "./types.ts";

const COMMAND_NAME = "cmux-dispatch";
const PROMPT_DIR = join(homedir(), ".pi", "agent", "cmux-dispatch-prompts");

interface BranchCreateResult {
	branchName: string;
	parentBranch: string;
	startPoint: string;
}

type TextResult =
	| {
			ok: true;
			text: string;
	  }
	| {
			ok: false;
			message: string;
	  };

export interface CmuxDispatchOptions {
	promptDir?: string;
	now?: () => number;
}

export interface ResolvedCmuxDispatchOptions {
	promptDir: string;
	now: () => number;
}

export function registerCmuxDispatchCommand(
	pi: ExtensionAPI,
	summaryController: CmuxWorkspaceSummaryController,
	options: CmuxDispatchOptions = {},
): void {
	const resolvedOptions = resolveCmuxDispatchOptions(options);
	pi.registerCommand(COMMAND_NAME, {
		description: "Create a Graphite-tracked branch and run a prompt in a new cmux Pi slot",
		argumentHint: "<prompt>",
		handler: async (args, ctx) => {
			await handleCmuxDispatch(pi, summaryController, resolvedOptions, args, ctx);
		},
	});
}

export async function handleCmuxDispatch(
	pi: Pick<ExtensionAPI, "exec">,
	summaryController: CmuxWorkspaceSummaryController,
	options: ResolvedCmuxDispatchOptions,
	args: string,
	ctx: CommandContext,
): Promise<void> {
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

	ctx.ui.notify(`Checking out ${branch.branchName} into a slot…`, "info");
	const target = await checkoutSlot(pi, ctx.cwd, branch.branchName);
	if ("error" in target) {
		ctx.ui.notify(target.error, "error");
		return;
	}

	let promptFile: string;
	try {
		promptFile = await writePromptFile(options, branch.branchName, prompt);
	} catch (error) {
		ctx.ui.notify(`Failed to write cmux dispatch prompt file: ${formatErrorMessage(error)}`, "error");
		return;
	}

	const launched = await openCmuxWorkspace(pi, target, {
		description: target.slotName,
		command: `pi @${shellQuote(promptFile)}`,
		failureHeading: "Created tracked branch and slot worktree, but failed to open cmux workspace.",
		failureDetails: [`Branch: ${target.branchName}`, `Worktree: ${target.worktreePath}`],
	});
	if ("error" in launched) {
		ctx.ui.notify(launched.error, "error");
		return;
	}

	ctx.ui.notify(
		[
			`Opened cmux workspace: ${target.branchName}`,
			`Parent: ${branch.parentBranch}`,
			`Start point: ${branch.startPoint}`,
		].join("\n"),
		"info",
	);
	await summaryController.queueFromHook(ctx);
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
	options: ResolvedCmuxDispatchOptions,
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

function resolveCmuxDispatchOptions(options: CmuxDispatchOptions): ResolvedCmuxDispatchOptions {
	return {
		promptDir: options.promptDir ?? PROMPT_DIR,
		now: options.now ?? Date.now,
	};
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'"'"'`)}'`;
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

function formatErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
