import { type ExecResult, isSuccessfulExecResult } from "@sdl/core/command";
import { firstNonEmptyLine } from "@sdl/core/text-normalization";
import { planLocalBranchRefreshFromWorktrees } from "@sdl/capability-kit/git";
import { runGraphiteCommand } from "@sdl/graphite/branch";

const GT_TIMEOUT_MS = 30_000;
const GIT_TIMEOUT_MS = 2 * 60 * 1000;

interface TrunkPullCommands {
	exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<ExecResult>;
}

export type TrunkPullOutcome =
	| { kind: "success"; trunk: string }
	| { kind: "trunk-command-failed" }
	| { kind: "trunk-empty" }
	| { kind: "worktree-list-failed"; trunk: string }
	| { kind: "update-failed"; trunk: string };

export interface TrunkPullResult {
	outcome: TrunkPullOutcome;
	command: "gt" | "git";
	args: readonly string[];
	cwd: string;
	execResult: ExecResult;
}

export async function runTrunkPullDetailed(
	commands: TrunkPullCommands,
	cwd: string,
): Promise<TrunkPullResult> {
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
			outcome: { kind: "trunk-command-failed" },
			command: "gt",
			args: trunkArgs,
			cwd,
			execResult: trunkResult,
		};
	}

	const trunk = firstNonEmptyLine(trunkResult.stdout);
	if (trunk === undefined) {
		return {
			outcome: { kind: "trunk-empty" },
			command: "gt",
			args: trunkArgs,
			cwd,
			execResult: trunkResult,
		};
	}

	const worktreeArgs = ["worktree", "list", "--porcelain"];
	const worktreeResult = await commands.exec("git", worktreeArgs, {
		cwd,
		timeout: GIT_TIMEOUT_MS,
	});
	if (!isSuccessfulExecResult(worktreeResult)) {
		return {
			outcome: { kind: "worktree-list-failed", trunk },
			command: "git",
			args: worktreeArgs,
			cwd,
			execResult: worktreeResult,
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
			outcome: { kind: "update-failed", trunk },
			command: "git",
			args: plan.args,
			cwd: plan.cwd,
			execResult: updateResult,
		};
	}

	return {
		outcome: { kind: "success", trunk },
		command: "git",
		args: plan.args,
		cwd: plan.cwd,
		execResult: updateResult,
	};
}
