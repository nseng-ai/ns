import {
	commandSucceeded,
	type CommandExecApi,
	type ExecResult,
} from "@nseng-ai/foundation/command";
import {
	planLocalBranchRefreshFromWorktrees,
	RealGitGateway,
	type GitErrorInfo,
	type GitGateway,
} from "@nseng-ai/foundation/git";
import {
	RealGraphiteBranchGateway,
	type GraphiteBranchGateway,
	type GraphiteErrorInfo,
	type GraphiteTrunkBranchFailureReason,
} from "@nseng-ai/capability-kit/graphite/branch";

const GIT_TIMEOUT_MS = 2 * 60 * 1000;

interface TrunkPullCommands {
	exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<ExecResult>;
}

type CommandBackedTrunkPullOutcome =
	| { kind: "success"; trunk: string }
	| { kind: "worktree-list-failed"; trunk: string }
	| { kind: "update-failed"; trunk: string };

type GatewayBackedTrunkPullOutcome =
	| {
			kind: "trunk-command-failed";
			reason: Exclude<GraphiteTrunkBranchFailureReason, "empty">;
			error: GraphiteErrorInfo;
	  }
	| { kind: "trunk-empty"; error: GraphiteErrorInfo }
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

interface TrunkPullGateways {
	graphite: Pick<GraphiteBranchGateway, "trunkBranch">;
	git: Pick<GitGateway, "branchUpstream">;
}

export async function runTrunkPullDetailed(
	commands: TrunkPullCommands,
	cwd: string,
): Promise<TrunkPullResult> {
	const execApi: CommandExecApi = {
		exec: async (command, args, options) => await commands.exec(command, [...args], options),
	};
	return await runTrunkPullWithGateways({
		commands,
		cwd,
		graphite: new RealGraphiteBranchGateway(execApi),
		git: new RealGitGateway(execApi),
	});
}

async function runTrunkPullWithGateways(
	options: TrunkPullGateways & { commands: TrunkPullCommands; cwd: string },
): Promise<TrunkPullResult> {
	const { commands, cwd, graphite, git } = options;
	const trunkResult = await graphite.trunkBranch({ cwd });
	if (!trunkResult.ok) {
		if (trunkResult.reason === "empty") {
			return { outcome: { kind: "trunk-empty", error: trunkResult.error }, cwd };
		}
		return {
			outcome: {
				kind: "trunk-command-failed",
				reason: trunkResult.reason,
				error: trunkResult.error,
			},
			cwd,
		};
	}
	const trunk = trunkResult.branch;

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
