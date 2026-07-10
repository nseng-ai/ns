import { existsSync } from "node:fs";
import { dirname } from "node:path";

import { NodeCommandExecApi } from "@nseng-ai/foundation/exec";
import {
	commandSucceeded,
	type CommandExecApi,
	type ExecResult,
} from "@nseng-ai/foundation/command";
import {
	detectGitOperationInProgressAt,
	parseGitWorktreePorcelain,
	RealGitGateway,
	type GitGateway,
	type GitOperationInProgressFacts,
} from "@nseng-ai/capability-kit/git";
import { optionalEntry, type ExplicitUndefined } from "@nseng-ai/foundation/primitives";

import {
	createSlotDiagnosticSinkFromEnv,
	runDiagnosticCommand,
	type SlotDiagnosticSink,
} from "../diagnostics.ts";

const SLOT_GIT_TIMEOUT_MS = 10_000;

export interface WorktreeInfo {
	path: string;
	branch: string | null;
}

export interface WorktreeOccupancy {
	path: string;
	branch: string | null;
	operation: string;
}

export interface LocalBranchTip {
	name: string;
	headIso: string | null;
}

export interface GitCommandFailure {
	message: string;
}

export type CurrentBranchResult =
	| { type: "branch"; branch: string }
	| { type: "detached" }
	| { type: "failure"; failure: GitCommandFailure };

export interface BranchCreateOptions {
	shouldForce: boolean;
}

export interface BranchDeleteOptions {
	shouldForce: boolean;
}

export interface SlotRepositoryGateway {
	pathExists(path: string): Promise<boolean>;
	getGitCommonDir(cwd: string): Promise<string | null>;
	getRepositoryRoot(cwd: string): Promise<string>;
	listWorktrees(): Promise<readonly WorktreeInfo[]>;
	listBranchOccupancies(): Promise<readonly WorktreeOccupancy[]>;
	listLocalBranches(): Promise<readonly string[]>;
	listLocalBranchTips(): Promise<readonly LocalBranchTip[]>;
	hasUncommittedChanges(path: string): Promise<boolean>;
	getTrunkBranch(): Promise<string>;
	getCurrentBranch(cwd: string): Promise<CurrentBranchResult>;
	getPreviousBranch(cwd: string): Promise<string | null>;
	branchExists(branch: string): Promise<boolean>;
	createBranch(
		branch: string,
		startPoint: string,
		options: BranchCreateOptions,
	): Promise<GitCommandFailure | null>;
	deleteLocalBranch(
		branch: string,
		options: BranchDeleteOptions,
	): Promise<GitCommandFailure | null>;
	checkoutBranch(cwd: string, branch: string): Promise<GitCommandFailure | null>;
	detachHead(cwd: string, ref: string): Promise<GitCommandFailure | null>;
	addDetachedWorktree(path: string, ref: string): Promise<void>;
	removeWorktree(path: string): Promise<void>;
}

export class RealSlotRepositoryGateway implements SlotRepositoryGateway {
	private readonly cwd: string;
	private readonly env: NodeJS.ProcessEnv;
	private readonly execApi: CommandExecApi;
	private readonly coreGit: GitGateway;
	private readonly diagnosticSink: SlotDiagnosticSink | undefined;

	constructor(options: {
		cwd: string;
		env?: ExplicitUndefined<"env-map", NodeJS.ProcessEnv>;
		execApi?: CommandExecApi;
		coreGit?: GitGateway;
		diagnosticSink?: ExplicitUndefined<"di-seam", SlotDiagnosticSink>;
	}) {
		this.cwd = options.cwd;
		this.env = options.env ?? process.env;
		this.execApi = options.execApi ?? new NodeCommandExecApi();
		this.coreGit = options.coreGit ?? new RealGitGateway(this.execApi);
		this.diagnosticSink = options.diagnosticSink ?? createSlotDiagnosticSinkFromEnv(this.env);
	}

	async pathExists(path: string): Promise<boolean> {
		return existsSync(path);
	}

	async getGitCommonDir(cwd: string): Promise<string | null> {
		const result = await this.coreGit.gitCommonDir({ cwd, env: this.env });
		return result.ok ? result.value : null;
	}

	async getRepositoryRoot(cwd: string): Promise<string> {
		const result = await this.coreGit.repoRoot({ cwd, env: this.env });
		if (result.ok) return result.value;
		throw new Error(result.error.message);
	}

	async listWorktrees(): Promise<readonly WorktreeInfo[]> {
		const result = await this.git(["worktree", "list", "--porcelain"], this.cwd, {
			operation: "slot.git.list_worktrees",
		});
		return parseGitWorktreePorcelain(result.result.stdout).map((worktree) => ({
			path: worktree.path,
			branch: worktree.branch,
		}));
	}

	async listBranchOccupancies(): Promise<readonly WorktreeOccupancy[]> {
		const result = await this.git(["worktree", "list", "--porcelain"], this.cwd, {
			operation: "slot.git.list_branch_occupancies",
		});
		const occupancies = parseGitWorktreePorcelain(result.result.stdout).map((worktree) => {
			const operation = this.worktreeOperation(worktree.path);
			if (operation === null) {
				if (worktree.branch === null) return null;
				return { path: worktree.path, branch: worktree.branch, operation: "checked-out" };
			}
			return {
				path: worktree.path,
				branch: worktree.branch ?? operation.branch,
				operation: operation.operation,
			};
		});
		return occupancies.filter((occupancy) => occupancy !== null);
	}

	async listLocalBranches(): Promise<readonly string[]> {
		return (await this.listLocalBranchTips()).map((tip) => tip.name);
	}

	async listLocalBranchTips(): Promise<readonly LocalBranchTip[]> {
		const result = await this.coreGit.listLocalBranchTips({ cwd: this.cwd, env: this.env });
		if (result.ok) return result.value;
		throw new Error(result.error.message);
	}

	async hasUncommittedChanges(path: string): Promise<boolean> {
		const result = await this.coreGit.hasUncommittedChangesUnder({
			cwd: path,
			env: this.env,
			relativePath: ".",
		});
		if (result.ok) return result.value;
		throw new Error(result.error.message);
	}

	async getTrunkBranch(): Promise<string> {
		const result = await this.coreGit.trunkBranch({ cwd: this.cwd, env: this.env });
		if (result.type === "found") return result.value;
		if (result.type === "missing") return "master";
		throw new Error(result.error.message);
	}

	async getCurrentBranch(cwd: string): Promise<CurrentBranchResult> {
		const result = await this.coreGit.currentBranch({ cwd, env: this.env });
		if (result.type === "branch") return { type: "branch", branch: result.branch };
		if (result.type === "detached") return { type: "detached" };
		return { type: "failure", failure: { message: result.error.message } };
	}

	async getPreviousBranch(cwd: string): Promise<string | null> {
		const result = await this.coreGit.previousBranch({ cwd, env: this.env });
		return result.type === "found" ? result.value : null;
	}

	async branchExists(branch: string): Promise<boolean> {
		const result = await this.coreGit.localBranchPresence({
			cwd: this.cwd,
			env: this.env,
			branch,
		});
		if (result.type === "present") return true;
		if (result.type === "absent") return false;
		throw new Error(result.error.message);
	}

	async createBranch(
		branch: string,
		startPoint: string,
		options: BranchCreateOptions,
	): Promise<GitCommandFailure | null> {
		const flag = options.shouldForce ? ["-f"] : [];
		const result = await this.git(["branch", ...flag, branch, startPoint], this.cwd, {
			allowFailure: true,
			operation: "slot.git.create_branch",
		});
		return result.isOk ? null : failureFromResult(result);
	}

	async deleteLocalBranch(
		branch: string,
		options: BranchDeleteOptions,
	): Promise<GitCommandFailure | null> {
		const flag = options.shouldForce ? "-D" : "-d";
		const result = await this.git(["branch", flag, branch], this.cwd, {
			allowFailure: true,
			operation: "slot.git.delete_local_branch",
		});
		return result.isOk ? null : failureFromResult(result);
	}

	async checkoutBranch(cwd: string, branch: string): Promise<GitCommandFailure | null> {
		const result = await this.git(["checkout", branch], cwd, {
			allowFailure: true,
			operation: "slot.git.checkout_branch",
		});
		return result.isOk ? null : failureFromResult(result);
	}

	async detachHead(cwd: string, ref: string): Promise<GitCommandFailure | null> {
		const result = await this.git(["checkout", "--detach", ref], cwd, {
			allowFailure: true,
			operation: "slot.git.detach_head",
		});
		return result.isOk ? null : failureFromResult(result);
	}

	async addDetachedWorktree(path: string, ref: string): Promise<void> {
		await this.git(["worktree", "add", "--detach", path, ref], this.cwd, {
			operation: "slot.git.add_detached_worktree",
		});
	}

	async removeWorktree(path: string): Promise<void> {
		await this.git(["worktree", "remove", path], this.cwd, {
			operation: "slot.git.remove_worktree",
		});
	}

	private worktreeOperation(worktreePath: string): GitOperationInProgressFacts | null {
		return detectGitOperationInProgressAt(worktreePath) ?? null;
	}

	private async git(
		args: readonly string[],
		cwd: string,
		options: { allowFailure?: boolean; operation?: string } = {},
	): Promise<CommandResult> {
		const result = await runDiagnosticCommand({
			execApi: this.execApi,
			command: "git",
			args,
			execOptions: { cwd, env: this.env, timeout: SLOT_GIT_TIMEOUT_MS },
			operation: options.operation ?? "slot.git.command",
			...optionalEntry("diagnosticSink", this.diagnosticSink),
		});
		const commandResult = { isOk: commandSucceeded(result), result };
		if (commandResult.isOk || options.allowFailure) return commandResult;
		throw new Error(`git ${args.join(" ")} failed: ${gitFailureMessage(result)}`);
	}
}

interface CommandResult {
	isOk: boolean;
	result: ExecResult;
}

function failureFromResult(commandResult: CommandResult): GitCommandFailure {
	return { message: gitFailureMessage(commandResult.result) };
}

function gitFailureMessage(result: ExecResult): string {
	const stderr = result.stderr.trim();
	if (stderr !== "") return stderr;
	const stdout = result.stdout.trim();
	if (stdout !== "") return stdout;
	switch (result.type) {
		case "spawn-failed":
			return `git failed to start: ${result.error}`;
		case "cancelled":
			return "git command was cancelled";
		case "timed-out":
			return "git command timed out";
		case "exited":
			return result.signal === null
				? `git exited with status ${result.code ?? "unknown"}`
				: `git exited after signal ${result.signal} (status ${result.code ?? "unknown"})`;
	}
}

export function mainRepoRootFromGitCommonDir(gitCommonDir: string): string {
	return dirname(gitCommonDir);
}
