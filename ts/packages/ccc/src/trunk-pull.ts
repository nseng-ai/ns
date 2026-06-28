import { isSuccessfulExecResult, type ExecResult } from "@sdl/core/exec";
import { planLocalBranchRefreshFromWorktrees } from "@sdl/core/git";
import { runGraphiteCommand } from "@sdl/graphite/branch";

const GT_TIMEOUT_MS = 30_000;
const GIT_TIMEOUT_MS = 2 * 60 * 1000;

interface TrunkPullCommands {
	exec(
		command: string,
		args: string[],
		options?: { cwd?: string | undefined; timeout?: number | undefined },
	): Promise<ExecResult>;
}

export type TrunkPullDetailedResult =
	| {
			ok: true;
			trunk: string;
			command: "git";
			args: readonly string[];
			cwd: string;
			result: ExecResult;
	  }
	| {
			ok: false;
			reason: "trunk-command-failed" | "trunk-empty" | "worktree-list-failed" | "update-failed";
			trunk?: string | undefined;
			command: "gt" | "git";
			args: readonly string[];
			cwd: string;
			result: ExecResult;
	  };

export async function runTrunkPullDetailed(
	commands: TrunkPullCommands,
	cwd: string,
): Promise<TrunkPullDetailedResult> {
	const trunkArgs = ["trunk", "--no-interactive"];
	const trunkResult = await runGraphiteCommand(
		(command, args, options) => commands.exec(command, [...args], options),
		{
			cwd,
			args: trunkArgs,
			timeoutMs: GT_TIMEOUT_MS,
		},
	);
	if (!isSuccessfulExecResult(trunkResult)) {
		return {
			ok: false,
			reason: "trunk-command-failed",
			command: "gt",
			args: trunkArgs,
			cwd,
			result: trunkResult,
		};
	}

	const trunk = firstNonEmptyLine(trunkResult.stdout);
	if (trunk === undefined) {
		return {
			ok: false,
			reason: "trunk-empty",
			command: "gt",
			args: trunkArgs,
			cwd,
			result: trunkResult,
		};
	}

	const worktreeArgs = ["worktree", "list", "--porcelain"];
	const worktreeResult = await commands.exec("git", worktreeArgs, {
		cwd,
		timeout: GIT_TIMEOUT_MS,
	});
	if (!isSuccessfulExecResult(worktreeResult)) {
		return {
			ok: false,
			reason: "worktree-list-failed",
			trunk,
			command: "git",
			args: worktreeArgs,
			cwd,
			result: worktreeResult,
		};
	}

	const plan = planLocalBranchRefreshFromWorktrees({
		branch: trunk,
		cwd,
		worktreePorcelain: worktreeResult.stdout,
	});
	const updateResult = await commands.exec("git", plan.args, {
		cwd: plan.cwd,
		timeout: GIT_TIMEOUT_MS,
	});
	if (!isSuccessfulExecResult(updateResult)) {
		return {
			ok: false,
			reason: "update-failed",
			trunk,
			command: "git",
			args: plan.args,
			cwd: plan.cwd,
			result: updateResult,
		};
	}

	return {
		ok: true,
		trunk,
		command: "git",
		args: plan.args,
		cwd: plan.cwd,
		result: updateResult,
	};
}

function firstNonEmptyLine(text: string): string | undefined {
	return text
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line.length > 0);
}
