import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

import { NodeCommandExecApi, type CommandExecApi } from "@asdl/core/exec";
import { parseGitWorktreePorcelain } from "@asdl/core/git";

const SLOT_GIT_TIMEOUT_MS = 10_000;

const GIT_OPERATION_MARKERS = [
	{ operation: "merge", paths: ["MERGE_HEAD"] },
	{ operation: "cherry-pick", paths: ["CHERRY_PICK_HEAD"] },
	{ operation: "revert", paths: ["REVERT_HEAD"] },
	{ operation: "rebase", paths: ["rebase-merge", "rebase-apply"] },
	{ operation: "bisect", paths: ["BISECT_LOG"] },
] as const;

export interface WorktreeInfo {
	path: string;
	branch: string | null;
}

export interface WorktreeOccupancy {
	path: string;
	branch: string | null;
	operation: string;
}

export interface GitCommandFailure {
	message: string;
	returncode: number | null;
	errorType?: string | undefined;
}

export type CurrentBranchResult =
	| { type: "branch"; branch: string }
	| { type: "detached" }
	| { type: "failure"; failure: GitCommandFailure };

export interface BranchCreateOptions {
	shouldForce: boolean;
}

export interface SlotGitGateway {
	pathExists(path: string): Promise<boolean>;
	getGitCommonDir(cwd: string): Promise<string | null>;
	getRepositoryRoot(cwd: string): Promise<string>;
	listWorktrees(): Promise<readonly WorktreeInfo[]>;
	listBranchOccupancies(): Promise<readonly WorktreeOccupancy[]>;
	hasUncommittedChanges(path: string): Promise<boolean>;
	getTrunkBranch(): Promise<string>;
	getCurrentBranch(cwd: string): Promise<CurrentBranchResult>;
	getPreviousBranch(cwd: string): Promise<string | null>;
	branchExists(branch: string): Promise<boolean>;
	listLocalBranches(): Promise<readonly string[]>;
	createBranch(branch: string, startPoint: string, options: BranchCreateOptions): Promise<GitCommandFailure | null>;
	checkoutBranch(cwd: string, branch: string): Promise<GitCommandFailure | null>;
	detachHead(cwd: string, ref: string): Promise<GitCommandFailure | null>;
	addDetachedWorktree(path: string, ref: string): Promise<void>;
	removeWorktree(path: string): Promise<void>;
}

export class RealSlotGitGateway implements SlotGitGateway {
	private readonly cwd: string;
	private readonly env: NodeJS.ProcessEnv;
	private readonly execApi: CommandExecApi;

	constructor(options: { cwd: string; env?: NodeJS.ProcessEnv | undefined; execApi?: CommandExecApi | undefined }) {
		this.cwd = options.cwd;
		this.env = options.env ?? process.env;
		this.execApi = options.execApi ?? new NodeCommandExecApi();
	}

	async pathExists(path: string): Promise<boolean> {
		return existsSync(path);
	}

	async getGitCommonDir(cwd: string): Promise<string | null> {
		const result = await this.git(["rev-parse", "--git-common-dir"], cwd, { allowFailure: true });
		if (!result.isOk) return null;
		const raw = result.stdout.trim();
		if (raw.length === 0) return null;
		return isAbsolute(raw) ? raw : resolve(cwd, raw);
	}

	async getRepositoryRoot(cwd: string): Promise<string> {
		const result = await this.git(["rev-parse", "--show-toplevel"], cwd);
		return result.stdout.trim();
	}

	async listWorktrees(): Promise<readonly WorktreeInfo[]> {
		const result = await this.git(["worktree", "list", "--porcelain"], this.cwd);
		return parseGitWorktreePorcelain(result.stdout).map((worktree) => ({ path: worktree.path, branch: worktree.branch }));
	}

	async listBranchOccupancies(): Promise<readonly WorktreeOccupancy[]> {
		const result = await this.git(["worktree", "list", "--porcelain"], this.cwd);
		const occupancies = await Promise.all(parseGitWorktreePorcelain(result.stdout).map(async (worktree) => {
			if (worktree.branch === null) return null;
			return { path: worktree.path, branch: worktree.branch, operation: await this.worktreeOperation(worktree.path) ?? "checked-out" };
		}));
		return occupancies.filter((occupancy) => occupancy !== null);
	}

	async hasUncommittedChanges(path: string): Promise<boolean> {
		const result = await this.git(["status", "--porcelain"], path, { allowFailure: true });
		return result.isOk && result.stdout.length > 0;
	}

	async getTrunkBranch(): Promise<string> {
		const originHead = await this.git(["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], this.cwd, { allowFailure: true });
		if (originHead.isOk) {
			const trimmed = originHead.stdout.trim();
			const prefix = "origin/";
			if (trimmed.startsWith(prefix)) return trimmed.slice(prefix.length);
		}
		for (const candidate of ["master", "main"] as const) {
			const exists = await this.git(["show-ref", "--verify", "--quiet", `refs/heads/${candidate}`], this.cwd, { allowFailure: true });
			if (exists.isOk) return candidate;
		}
		return "master";
	}

	async getCurrentBranch(cwd: string): Promise<CurrentBranchResult> {
		const result = await this.git(["symbolic-ref", "--short", "HEAD"], cwd, { allowFailure: true });
		if (result.isOk) {
			const branch = result.stdout.trim();
			if (branch.length > 0) return { type: "branch", branch };
			return { type: "detached" };
		}
		const text = `${result.stderr}\n${result.stdout}`.toLowerCase();
		if (text.includes("not a symbolic ref") || text.includes("not currently on a branch")) return { type: "detached" };
		return { type: "failure", failure: failureFromResult(result, "current_branch_failed") };
	}

	async getPreviousBranch(cwd: string): Promise<string | null> {
		const result = await this.git(["rev-parse", "--abbrev-ref", "@{-1}"], cwd, { allowFailure: true });
		if (!result.isOk) return null;
		const branch = result.stdout.trim();
		if (branch.length === 0 || branch === "@{-1}") return null;
		return branch;
	}

	async branchExists(branch: string): Promise<boolean> {
		const result = await this.git(["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], this.cwd, { allowFailure: true });
		return result.isOk;
	}

	async listLocalBranches(): Promise<readonly string[]> {
		const result = await this.git(["for-each-ref", "--format=%(refname:short)", "refs/heads/"], this.cwd, { allowFailure: true });
		if (!result.isOk) return [];
		return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
	}

	async createBranch(branch: string, startPoint: string, options: BranchCreateOptions): Promise<GitCommandFailure | null> {
		const flag = options.shouldForce ? ["-f"] : [];
		const result = await this.git(["branch", ...flag, branch, startPoint], this.cwd, { allowFailure: true });
		return result.isOk ? null : failureFromResult(result, "branch_create_failed");
	}

	async checkoutBranch(cwd: string, branch: string): Promise<GitCommandFailure | null> {
		const result = await this.git(["checkout", branch], cwd, { allowFailure: true });
		return result.isOk ? null : failureFromResult(result, "checkout_failed");
	}

	async detachHead(cwd: string, ref: string): Promise<GitCommandFailure | null> {
		const result = await this.git(["checkout", "--detach", ref], cwd, { allowFailure: true });
		return result.isOk ? null : failureFromResult(result, "detach_failed");
	}

	async addDetachedWorktree(path: string, ref: string): Promise<void> {
		await this.git(["worktree", "add", "--detach", path, ref], this.cwd);
	}

	async removeWorktree(path: string): Promise<void> {
		await this.git(["worktree", "remove", path], this.cwd);
	}

	private async worktreeOperation(worktreePath: string): Promise<string | null> {
		for (const marker of GIT_OPERATION_MARKERS) {
			for (const path of marker.paths) {
				if (await this.gitPathExists(worktreePath, path)) return marker.operation;
			}
		}
		return null;
	}

	private async gitPathExists(cwd: string, path: string): Promise<boolean> {
		const result = await this.git(["rev-parse", "--git-path", path], cwd, { allowFailure: true });
		if (!result.isOk) return false;
		const rawPath = result.stdout.trim();
		if (rawPath.length === 0) return false;
		return existsSync(isAbsolute(rawPath) ? rawPath : resolve(cwd, rawPath));
	}

	private async git(args: readonly string[], cwd: string, options: { allowFailure?: boolean | undefined } = {}): Promise<CommandResult> {
		const result = await this.execApi.exec("git", [...args], { cwd, env: this.env, timeout: SLOT_GIT_TIMEOUT_MS });
		const commandResult = { isOk: result.code === 0 && !result.killed, stdout: result.stdout, stderr: result.stderr, code: result.code, killed: result.killed };
		if (commandResult.isOk || options.allowFailure) return commandResult;
		throw new Error(`git ${args.join(" ")} failed with exit code ${result.code}: ${result.stderr}`);
	}
}

interface CommandResult {
	isOk: boolean;
	stdout: string;
	stderr: string;
	code: number | null;
	killed: boolean;
}

function failureFromResult(result: CommandResult, errorType?: string): GitCommandFailure {
	const output = result.stderr.trim() || result.stdout.trim() || (result.killed ? "git command was killed" : "git command failed");
	return { message: output, returncode: result.code, ...(errorType === undefined ? {} : { errorType }) };
}

export function mainRepoRootFromGitCommonDir(gitCommonDir: string): string {
	return dirname(gitCommonDir);
}
