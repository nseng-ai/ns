import { parseGitWorktreePorcelain } from "@asdl/core/git";

import { definePiSurfaceParity } from "./parity.ts";

const COMMAND_NAME = "sdl:code:pull-trunk";
const GT_TIMEOUT_MS = 30_000;
const GIT_TIMEOUT_MS = 2 * 60 * 1000;

export const trunkPullParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: COMMAND_NAME,
		workflow: "Pull the configured Graphite trunk branch without running full gt sync",
		parity: "PARTIAL",
		trackedGap: "cross-harness-parity roadmap: decide whether non-Pi agents need a skill wrapper for the narrow trunk pull workflow or can run the displayed git command directly.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "trunk-pull",
		notes: "Pi command resolves gt trunk, then pulls the checked-out trunk worktree or fetches only that remote branch into the matching local branch so users can refresh main/master/trunk before restacking without full gt sync.",
	},
] as const);

type NotifyLevel = "info" | "warning" | "error";

export interface ExecResult {
	stdout: string;
	stderr: string;
	code: number;
	killed: boolean;
}

export interface CommandContext {
	cwd: string;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
	};
	waitForIdle(): Promise<void>;
}

export interface ExtensionAPI {
	registerCommand(
		name: string,
		options: {
			description?: string;
			handler(args: string, ctx: CommandContext): Promise<void> | void;
		},
	): void;
	exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<ExecResult>;
}

export default function trunkPullExtension(pi: ExtensionAPI): void {
	pi.registerCommand(COMMAND_NAME, {
		description: "Pull Graphite trunk without running full gt sync",
		handler: async (args, ctx) => {
			await runTrunkPull(pi, ctx, args);
		},
	});
}

export async function runTrunkPull(pi: Pick<ExtensionAPI, "exec">, ctx: CommandContext, args: string): Promise<boolean> {
	if (args.trim().length > 0) {
		ctx.ui.notify("`/sdl:code:pull-trunk` does not accept arguments. Run it with no text after the command.", "error");
		return false;
	}

	await ctx.waitForIdle();

	const trunkResult = await pi.exec("gt", ["trunk", "--no-interactive"], { cwd: ctx.cwd, timeout: GT_TIMEOUT_MS });
	if (!commandSucceeded(trunkResult)) {
		ctx.ui.notify(formatFailure("Could not resolve Graphite trunk. Local trunk was not updated.", "gt trunk --no-interactive", trunkResult), "error");
		return false;
	}

	const trunk = firstNonEmptyLine(trunkResult.stdout);
	if (trunk === undefined) {
		ctx.ui.notify("gt trunk --no-interactive returned no branch. Local trunk was not updated.", "error");
		return false;
	}

	const planResult = await planTrunkPull(pi, ctx.cwd, trunk);
	if (!planResult.ok) {
		ctx.ui.notify(planResult.message, "error");
		return false;
	}

	const updateResult = await pi.exec("git", planResult.args, { cwd: planResult.cwd, timeout: GIT_TIMEOUT_MS });
	if (!commandSucceeded(updateResult)) {
		ctx.ui.notify(formatFailure(`Could not update local trunk branch \`${trunk}\`.`, formatCommand("git", planResult.args), updateResult), "error");
		return false;
	}

	ctx.ui.notify(formatSuccess({ trunk, result: updateResult, args: planResult.args, cwd: planResult.cwd }), "info");
	return true;
}

async function planTrunkPull(pi: Pick<ExtensionAPI, "exec">, cwd: string, trunk: string): Promise<{ ok: true; args: string[]; cwd: string } | { ok: false; message: string }> {
	const worktreeResult = await pi.exec("git", ["worktree", "list", "--porcelain"], { cwd, timeout: GIT_TIMEOUT_MS });
	if (!commandSucceeded(worktreeResult)) {
		return {
			ok: false,
			message: formatFailure("Could not inspect Git worktrees. Local trunk was not updated.", "git worktree list --porcelain", worktreeResult),
		};
	}

	const checkedOutPath = findWorktreePathForBranch(worktreeResult.stdout, trunk);
	if (checkedOutPath !== undefined) {
		return { ok: true, args: ["pull", "--ff-only", "origin", trunk], cwd: checkedOutPath };
	}

	return { ok: true, args: ["fetch", "origin", `refs/heads/${trunk}:refs/heads/${trunk}`], cwd };
}

function commandSucceeded(result: ExecResult): boolean {
	return result.code === 0 && !result.killed;
}

function firstNonEmptyLine(text: string): string | undefined {
	return text.split("\n").map((line) => line.trim()).find((line) => line.length > 0);
}

function findWorktreePathForBranch(porcelain: string, branch: string): string | undefined {
	return parseGitWorktreePorcelain(porcelain).find((entry) => entry.branch === branch)?.path;
}

interface FormatSuccessOptions {
	trunk: string;
	args: readonly string[];
	cwd: string;
	result: ExecResult;
}

function formatSuccess(options: FormatSuccessOptions): string {
	return [
		`Pulled local Graphite trunk branch \`${options.trunk}\` only.`,
		"No full `gt sync` was run.",
		`Command: ${formatCommand("git", options.args)}`,
		`Cwd: ${options.cwd}`,
		"stdout:",
		formatOutput(options.result.stdout),
		"stderr:",
		formatOutput(options.result.stderr),
	].join("\n");
}

function formatFailure(intro: string, command: string, result: ExecResult): string {
	return [intro, `Command: ${command}`, `Exit: ${result.code}`, `Killed: ${result.killed}`, "stdout:", formatOutput(result.stdout), "stderr:", formatOutput(result.stderr)].join("\n");
}

function formatCommand(command: string, args: readonly string[]): string {
	return [command, ...args].join(" ");
}

function formatOutput(output: string): string {
	if (output === "") return "<empty>";
	return output.endsWith("\n") ? output.trimEnd() : output;
}
