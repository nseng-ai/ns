import { existsSync, readFileSync, statSync, type Stats } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

import { NodeCommandExecApi } from "@sdl/exec";
import type { CommandExecApi } from "@sdl/exec";
import { parseGitWorktreePorcelain } from "@sdl/capability-kit/git";
import { RealGitGateway, type GitGateway } from "@sdl/git";

import {
	createSlotDiagnosticSinkFromEnv,
	runDiagnosticCommand,
	type SlotDiagnosticSink,
} from "../diagnostics.ts";

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
		// optional-undefined-objective: preserve (env-map) — Constructor DI seam: optional env injection defaulting to process.env.
		env?: NodeJS.ProcessEnv | undefined;
		execApi?: CommandExecApi | undefined;
		coreGit?: GitGateway | undefined;
		// optional-undefined-objective: preserve (di-seam) — Constructor DI seam: optional sink injection, undefined falls back to createSlotDiagnosticSinkFromEnv.
		diagnosticSink?: SlotDiagnosticSink | undefined;
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
		const result = await this.git(["rev-parse", "--git-common-dir"], cwd, {
			allowFailure: true,
			operation: "slot.git.get_git_common_dir",
		});
		if (!result.isOk) return null;
		const raw = result.stdout.trim();
		if (raw.length === 0) return null;
		return isAbsolute(raw) ? raw : resolve(cwd, raw);
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
		return parseGitWorktreePorcelain(result.stdout).map((worktree) => ({
			path: worktree.path,
			branch: worktree.branch,
		}));
	}

	async listBranchOccupancies(): Promise<readonly WorktreeOccupancy[]> {
		const result = await this.git(["worktree", "list", "--porcelain"], this.cwd, {
			operation: "slot.git.list_branch_occupancies",
		});
		const occupancies = parseGitWorktreePorcelain(result.stdout).map((worktree) => {
			const operation = this.worktreeOperation(worktree.path);
			if (operation === null) {
				if (worktree.branch === null) return null;
				return { path: worktree.path, branch: worktree.branch, operation: "checked-out" };
			}
			return {
				path: worktree.path,
				branch: worktree.branch ?? operation.branch,
				operation: operation.name,
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
		const result = await this.git(["rev-parse", "--abbrev-ref", "@{-1}"], cwd, {
			allowFailure: true,
			operation: "slot.git.get_previous_branch",
		});
		if (!result.isOk) return null;
		const branch = result.stdout.trim();
		if (branch.length === 0 || branch === "@{-1}") return null;
		return branch;
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

	private worktreeOperation(worktreePath: string): WorktreeOperation | null {
		const adminDir = resolveWorktreeAdminDir(worktreePath);
		if (adminDir === null) return null;
		for (const marker of GIT_OPERATION_MARKERS) {
			for (const path of marker.paths) {
				if (existsSync(resolve(adminDir, path)))
					return {
						name: marker.operation,
						branch: operationBranch(adminDir, marker.operation),
					};
			}
		}
		return null;
	}

	private async git(
		args: readonly string[],
		cwd: string,
		options: { allowFailure?: boolean | undefined; operation?: string | undefined } = {},
	): Promise<CommandResult> {
		const result = await runDiagnosticCommand({
			execApi: this.execApi,
			command: "git",
			args,
			execOptions: { cwd, env: this.env, timeout: SLOT_GIT_TIMEOUT_MS },
			operation: options.operation ?? "slot.git.command",
			diagnosticSink: this.diagnosticSink,
		});
		const commandResult = {
			isOk: result.code === 0 && !result.killed,
			stdout: result.stdout,
			stderr: result.stderr,
			code: result.code,
			killed: result.killed,
		};
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

type WorktreeOperationName = (typeof GIT_OPERATION_MARKERS)[number]["operation"];

interface WorktreeOperation {
	name: WorktreeOperationName;
	branch: string | null;
}

function failureFromResult(result: CommandResult): GitCommandFailure {
	const output =
		result.stderr.trim() ||
		result.stdout.trim() ||
		(result.killed ? "git command was killed" : "git command failed");
	return { message: output };
}

function operationBranch(adminDir: string, operation: WorktreeOperationName): string | null {
	if (operation !== "rebase") return null;
	return (
		branchFromRefFile(resolve(adminDir, "rebase-merge", "head-name")) ??
		branchFromRefFile(resolve(adminDir, "rebase-apply", "head-name"))
	);
}

function branchFromRefFile(path: string): string | null {
	const raw = readTextFile(path);
	if (raw === undefined) return null;
	const ref = raw
		.split(/\r?\n/u)
		.map((line) => line.trim())
		.find((line) => line.length > 0);
	if (ref === undefined) return null;
	const prefix = "refs/heads/";
	return ref.startsWith(prefix) ? ref.slice(prefix.length) : ref;
}

function resolveWorktreeAdminDir(worktreePath: string): string | null {
	const dotGit = resolve(worktreePath, ".git");
	if (isDirectory(dotGit)) return dotGit;
	const content = readTextFile(dotGit)?.trim();
	if (content === undefined) return null;
	const prefix = "gitdir:";
	if (!content.startsWith(prefix)) return null;
	const raw = content.slice(prefix.length).trim();
	if (raw.length === 0) return null;
	return isAbsolute(raw) ? raw : resolve(worktreePath, raw);
}

function readTextFile(path: string): string | undefined {
	if (!isFile(path)) return undefined;
	try {
		return readFileSync(path, "utf8");
	} catch {
		// Treat races and permission errors as unreadable files; callers only need best-effort path facts.
		return undefined;
	}
}

function isDirectory(path: string): boolean {
	return statMatches(path, (stats) => stats.isDirectory());
}

function isFile(path: string): boolean {
	return statMatches(path, (stats) => stats.isFile());
}

function statMatches(path: string, predicate: (stats: Stats) => boolean): boolean {
	if (!existsSync(path)) return false;
	try {
		return predicate(statSync(path));
	} catch {
		// Treat races and permission errors as non-matches; callers only need best-effort path facts.
		return false;
	}
}

export function mainRepoRootFromGitCommonDir(gitCommonDir: string): string {
	return dirname(gitCommonDir);
}
