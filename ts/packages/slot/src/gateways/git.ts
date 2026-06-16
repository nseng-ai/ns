import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

import { NodeCommandExecApi, type CommandExecApi } from "@asdl/core/exec";
import { parseGitWorktreePorcelain } from "@asdl/core/git";

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

export interface SlotGitGateway {
	pathExists(path: string): Promise<boolean>;
	getGitCommonDir(cwd: string): Promise<string | null>;
	getRepositoryRoot(cwd: string): Promise<string>;
	listWorktrees(): Promise<readonly WorktreeInfo[]>;
	listBranchOccupancies(): Promise<readonly WorktreeOccupancy[]>;
	hasUncommittedChanges(path: string): Promise<boolean>;
	getTrunkBranch(): Promise<string>;
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
		return parseGitWorktreePorcelain(result.stdout).flatMap((worktree) =>
			worktree.branch === null ? [] : [{ path: worktree.path, branch: worktree.branch, operation: "checked-out" }],
		);
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

	async addDetachedWorktree(path: string, ref: string): Promise<void> {
		await this.git(["worktree", "add", "--detach", path, ref], this.cwd);
	}

	async removeWorktree(path: string): Promise<void> {
		await this.git(["worktree", "remove", path], this.cwd);
	}

	private async git(args: readonly string[], cwd: string, options: { allowFailure?: boolean | undefined } = {}): Promise<CommandResult> {
		const result = await this.execApi.exec("git", [...args], { cwd, env: this.env, timeout: SLOT_GIT_TIMEOUT_MS });
		if (result.code === 0 && !result.killed) return { isOk: true, stdout: result.stdout, stderr: result.stderr };
		if (options.allowFailure) return { isOk: false, stdout: result.stdout, stderr: result.stderr };
		throw new Error(`git ${args.join(" ")} failed with exit code ${result.code}: ${result.stderr}`);
	}
}

interface CommandResult {
	isOk: boolean;
	stdout: string;
	stderr: string;
}


function stdoutFromError(error: unknown): string {
	return typeof error === "object" && error !== null && "stdout" in error && typeof error.stdout === "string" ? error.stdout : "";
}

function stderrFromError(error: unknown): string {
	return typeof error === "object" && error !== null && "stderr" in error && typeof error.stderr === "string" ? error.stderr : "";
}

export function mainRepoRootFromGitCommonDir(gitCommonDir: string): string {
	return dirname(gitCommonDir);
}
