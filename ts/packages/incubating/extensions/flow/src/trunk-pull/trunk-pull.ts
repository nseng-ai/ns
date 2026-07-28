import { commandSucceeded, type ExecResult } from "@nseng-ai/foundation/command";
import {
	planLocalBranchRefreshFromWorktrees,
	type GitErrorInfo,
	type GitGateway,
} from "@nseng-ai/foundation/git";
import type { RepositoryTrunkResolutionFailure } from "../checkpoint/trunk-resolution.ts";

const GIT_TIMEOUT_MS = 2 * 60 * 1000;

interface TrunkPullCommands {
	exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<ExecResult>;
}

export type TrunkPullGitGateway = Pick<GitGateway, "trunkBranch" | "branchUpstream">;

type CommandBackedTrunkPullOutcome =
	| { kind: "success"; trunk: string }
	| { kind: "worktree-list-failed"; trunk: string }
	| { kind: "update-failed"; trunk: string };

type GatewayBackedTrunkPullOutcome =
	| { kind: "repository-trunk-resolution-failed"; failure: RepositoryTrunkResolutionFailure }
	| { kind: "upstream-missing"; trunk: string }
	| { kind: "upstream-inspection-failed"; trunk: string; error: GitErrorInfo };

export type TrunkPullOutcome = CommandBackedTrunkPullOutcome | GatewayBackedTrunkPullOutcome;

interface CommandBackedTrunkPullResult {
	outcome: CommandBackedTrunkPullOutcome;
	command: "git";
	args: readonly string[];
	cwd: string;
	execResult: ExecResult;
}

interface GatewayBackedTrunkPullResult {
	outcome: GatewayBackedTrunkPullOutcome;
	cwd: string;
}

export type TrunkPullResult = CommandBackedTrunkPullResult | GatewayBackedTrunkPullResult;

export async function runTrunkPullDetailed(options: {
	commands: TrunkPullCommands;
	cwd: string;
	git: TrunkPullGitGateway;
}): Promise<TrunkPullResult> {
	const { commands, cwd, git } = options;
	const trunkResult = await git.trunkBranch({ cwd });
	if (trunkResult.type !== "resolved") {
		return {
			outcome: { kind: "repository-trunk-resolution-failed", failure: trunkResult },
			cwd,
		};
	}
	const trunk = trunkResult.resolution.branch;

	const upstream = await git.branchUpstream({ cwd, branch: trunk });
	if (upstream.type === "missing") {
		return { outcome: { kind: "upstream-missing", trunk }, cwd };
	}
	if (upstream.type === "error") {
		return {
			outcome: { kind: "upstream-inspection-failed", trunk, error: upstream.error },
			cwd,
		};
	}

	const worktreeArgs = ["worktree", "list", "--porcelain"];
	const worktreeResult = await commands.exec("git", worktreeArgs, {
		cwd,
		timeout: GIT_TIMEOUT_MS,
	});
	if (!commandSucceeded(worktreeResult)) {
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
		upstream: upstream.value,
		worktreePorcelain: worktreeResult.stdout,
	});
	const updateResult = await commands.exec("git", plan.args, {
		cwd: plan.cwd,
		timeout: GIT_TIMEOUT_MS,
	});
	if (!commandSucceeded(updateResult)) {
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
