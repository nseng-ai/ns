import { formatCommand, formatCommandFailure, type CommandExecApi, type ExecOptions, type ExecResult } from "../exec.ts";

const GIT_TIMEOUT_MS = 10_000;

export interface GitCwdParams {
	cwd: string;
	signal?: AbortSignal | undefined;
}

export interface GitErrorInfo {
	code: string;
	message: string;
	displayCommand?: string;
}

export type GitResult<T> = { ok: true; value: T } | { ok: false; error: GitErrorInfo };
export type GitOptionalResult<T> = { type: "found"; value: T } | { type: "missing" } | { type: "error"; error: GitErrorInfo };

export interface GitBranchParams extends GitCwdParams {
	branch: string;
}

export interface GitPathParams extends GitCwdParams {
	relativePath: string;
}

export interface GitRefsPathParams extends GitPathParams {
	refs: readonly string[];
}

export interface GitRevisionRangePathParams extends GitPathParams {
	revisionRange: string;
}

export interface GitLocalBranchTip {
	name: string;
	headIso: string | null;
}

export type GitOperationResult = { ok: true } | { ok: false; error: GitErrorInfo };
export type GitBranchPresenceResult =
	| { type: "present"; refName: string; displayCommand: string }
	| { type: "absent"; refName: string }
	| { type: "error"; error: GitErrorInfo };

export interface GitGateway {
	repoRoot(params: GitCwdParams): Promise<GitResult<string>>;
	optionalRepoRoot(params: GitCwdParams): Promise<GitOptionalResult<string>>;
	currentBranch(params: GitCwdParams): Promise<GitResult<string>>;
	trunkBranch(params: GitCwdParams): Promise<GitOptionalResult<string>>;
	originUrl(params: GitCwdParams): Promise<GitOptionalResult<string>>;
	headCommit(params: GitCwdParams): Promise<GitResult<string>>;
	validateBranchRef(params: GitBranchParams): Promise<GitOperationResult>;
	localBranchPresence(params: GitBranchParams): Promise<GitBranchPresenceResult>;
	createBranchAtHead(params: GitBranchParams): Promise<GitOperationResult>;
	hasUncommittedChangesUnder(params: GitPathParams): Promise<GitResult<boolean>>;
	listLocalBranchTips(params: GitCwdParams): Promise<GitResult<readonly GitLocalBranchTip[]>>;
	treeOidsAtRefs(params: GitRefsPathParams): Promise<GitResult<Readonly<Record<string, string | null>>>>;
	changedPathsUnder(params: GitRevisionRangePathParams): Promise<GitResult<readonly string[]>>;
}

export interface GitWorktreePorcelainEntry {
	path: string;
	branch: string | null;
}

interface CommandRun {
	result: ExecResult;
	displayCommand: string;
}

type CommandRunResult = { ok: true; value: CommandRun } | { ok: false; error: GitErrorInfo };

export class RealGitGateway implements GitGateway {
	private readonly execApi: CommandExecApi;

	constructor(execApi: CommandExecApi) {
		this.execApi = execApi;
	}

	async repoRoot(params: GitCwdParams): Promise<GitResult<string>> {
		const run = await this.runGit(params, ["rev-parse", "--show-toplevel"]);
		if (!run.ok) return run;
		if (run.value.result.code !== 0 || run.value.result.killed) {
			return error("repo_root_failed", formatCommandFailure("git rev-parse --show-toplevel failed", run.value.displayCommand, run.value.result), run.value.displayCommand);
		}

		const root = firstNonEmptyLine(run.value.result.stdout);
		if (root === undefined) {
			return error("repo_root_empty", `git rev-parse --show-toplevel returned no repo root.\nCommand: ${run.value.displayCommand}`, run.value.displayCommand);
		}
		return { ok: true, value: root };
	}

	async optionalRepoRoot(params: GitCwdParams): Promise<GitOptionalResult<string>> {
		const run = await this.runGit(params, ["rev-parse", "--show-toplevel"]);
		if (!run.ok) return { type: "missing" };
		if (run.value.result.code !== 0 || run.value.result.killed) return { type: "missing" };

		const root = firstNonEmptyLine(run.value.result.stdout);
		return root === undefined ? { type: "missing" } : { type: "found", value: root };
	}

	async currentBranch(params: GitCwdParams): Promise<GitResult<string>> {
		const run = await this.runGit(params, ["branch", "--show-current"]);
		if (!run.ok) return run;
		if (run.value.result.code !== 0 || run.value.result.killed) {
			return error("current_branch_failed", formatCommandFailure("git branch --show-current failed", run.value.displayCommand, run.value.result), run.value.displayCommand);
		}

		const branch = firstNonEmptyLine(run.value.result.stdout);
		if (branch === undefined) {
			return error("detached_head", `git branch --show-current returned no current branch.\nCommand: ${run.value.displayCommand}`, run.value.displayCommand);
		}
		return { ok: true, value: branch };
	}

	async trunkBranch(params: GitCwdParams): Promise<GitOptionalResult<string>> {
		const run = await this.runGit(params, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
		if (run.ok && run.value.result.code === 0 && !run.value.result.killed) {
			const ref = firstNonEmptyLine(run.value.result.stdout);
			if (ref !== undefined) {
				const candidate = ref.startsWith("origin/") ? ref.slice("origin/".length) : ref;
				const presence = await this.localBranchPresence({ ...params, branch: candidate });
				if (presence.type === "present") return { type: "found", value: candidate };
			}
		}

		for (const branch of ["main", "master"]) {
			const presence = await this.localBranchPresence({ ...params, branch });
			if (presence.type === "present") return { type: "found", value: branch };
		}
		return { type: "missing" };
	}

	async originUrl(params: GitCwdParams): Promise<GitOptionalResult<string>> {
		const run = await this.runGit(params, ["config", "--get", "remote.origin.url"]);
		if (!run.ok) return { type: "error", error: run.error };
		if (run.value.result.killed) {
			return { type: "error", error: failure("origin_url_killed", "git config --get remote.origin.url was killed", run.value) };
		}
		if (run.value.result.code === 0) return { type: "found", value: run.value.result.stdout };
		if (run.value.result.code === 1) return { type: "missing" };
		return { type: "error", error: failure("origin_url_failed", "git config --get remote.origin.url failed", run.value) };
	}

	async headCommit(params: GitCwdParams): Promise<GitResult<string>> {
		const run = await this.runGit(params, ["rev-parse", "HEAD"]);
		if (!run.ok) return run;
		if (run.value.result.code !== 0 || run.value.result.killed) {
			return error("head_commit_failed", formatCommandFailure("git rev-parse HEAD failed", run.value.displayCommand, run.value.result), run.value.displayCommand);
		}

		const commit = firstNonEmptyLine(run.value.result.stdout);
		if (commit === undefined) {
			return error("head_commit_empty", `git rev-parse HEAD returned no commit.\nCommand: ${run.value.displayCommand}`, run.value.displayCommand);
		}
		return { ok: true, value: commit };
	}

	async validateBranchRef(params: GitBranchParams): Promise<GitOperationResult> {
		const run = await this.runGit(params, ["check-ref-format", "--branch", params.branch]);
		if (!run.ok) return run;
		if (run.value.result.code !== 0 || run.value.result.killed) {
			return { ok: false, error: failure("branch_ref_invalid", "git check-ref-format failed", run.value) };
		}
		return { ok: true };
	}

	async localBranchPresence(params: GitBranchParams): Promise<GitBranchPresenceResult> {
		const refName = `refs/heads/${params.branch}`;
		const run = await this.runGit(params, ["rev-parse", "--verify", refName]);
		if (!run.ok) return { type: "error", error: run.error };
		if (run.value.result.killed) {
			return { type: "error", error: failure("branch_presence_killed", "git branch existence check was killed", run.value) };
		}
		if (run.value.result.code === 0) {
			return { type: "present", refName, displayCommand: run.value.displayCommand };
		}
		if (run.value.result.code === 1 || isMissingRevisionResult(run.value.result)) {
			return { type: "absent", refName };
		}
		return { type: "error", error: failure("branch_presence_failed", "git branch existence check failed", run.value) };
	}

	async createBranchAtHead(params: GitBranchParams): Promise<GitOperationResult> {
		const run = await this.runGit(params, ["branch", params.branch, "HEAD"]);
		if (!run.ok) return run;
		if (run.value.result.code !== 0 || run.value.result.killed) {
			return { ok: false, error: failure("branch_create_failed", "git branch failed", run.value) };
		}
		return { ok: true };
	}

	async hasUncommittedChangesUnder(params: GitPathParams): Promise<GitResult<boolean>> {
		const run = await this.runGit(params, ["status", "--porcelain", "--", params.relativePath]);
		if (!run.ok) return run;
		if (run.value.result.code !== 0 || run.value.result.killed) {
			return error("git_dirty_status_failed", formatCommandFailure("git status for path failed", run.value.displayCommand, run.value.result), run.value.displayCommand);
		}
		return { ok: true, value: run.value.result.stdout.trim().length > 0 };
	}

	async listLocalBranchTips(params: GitCwdParams): Promise<GitResult<readonly GitLocalBranchTip[]>> {
		const run = await this.runGit(params, ["for-each-ref", "--format=%(refname:short)%09%(committerdate:iso-strict)", "refs/heads"]);
		if (!run.ok) return run;
		if (run.value.result.code !== 0 || run.value.result.killed) {
			return error("git_branch_tips_failed", formatCommandFailure("git local branch tip listing failed", run.value.displayCommand, run.value.result), run.value.displayCommand);
		}
		return { ok: true, value: parseLocalBranchTips(run.value.result.stdout) };
	}

	async treeOidsAtRefs(params: GitRefsPathParams): Promise<GitResult<Readonly<Record<string, string | null>>>> {
		const values: Record<string, string | null> = {};
		for (const ref of params.refs) {
			const run = await this.runGit(params, ["rev-parse", `${ref}:${params.relativePath}`]);
			if (!run.ok) return run;
			if (run.value.result.killed) {
				return error("git_tree_oid_failed", formatCommandFailure("git tree lookup for path failed", run.value.displayCommand, run.value.result), run.value.displayCommand);
			}
			if (run.value.result.code === 0) {
				values[ref] = firstNonEmptyLine(run.value.result.stdout) ?? null;
				continue;
			}
			if (isMissingTreeResult(run.value.result)) {
				values[ref] = null;
				continue;
			}
			return error("git_tree_oid_failed", formatCommandFailure("git tree lookup for path failed", run.value.displayCommand, run.value.result), run.value.displayCommand);
		}
		return { ok: true, value: values };
	}

	async changedPathsUnder(params: GitRevisionRangePathParams): Promise<GitResult<readonly string[]>> {
		const run = await this.runGit(params, ["diff", "--name-only", params.revisionRange, "--", params.relativePath]);
		if (!run.ok) return run;
		if (run.value.result.code !== 0 || run.value.result.killed) {
			return error("git_changed_paths_failed", formatCommandFailure("git changed path lookup failed", run.value.displayCommand, run.value.result), run.value.displayCommand);
		}
		return { ok: true, value: nonEmptyLines(run.value.result.stdout) };
	}

	private async runGit(params: GitCwdParams, args: string[]): Promise<CommandRunResult> {
		const displayCommand = formatCommand("git", args);
		try {
			const result = await this.execApi.exec("git", args, execOptions(params.cwd, GIT_TIMEOUT_MS, params.signal));
			return { ok: true, value: { result, displayCommand } };
		} catch (caught) {
			const message = caught instanceof Error ? caught.message : String(caught);
			return error("git_startup_failed", `git command failed before completion.\nCommand: ${displayCommand}\nError: ${message}`, displayCommand);
		}
	}
}

function failure(code: string, title: string, run: CommandRun): GitErrorInfo {
	return error(code, formatCommandFailure(title, run.displayCommand, run.result), run.displayCommand).error;
}

function error(code: string, message: string, displayCommand?: string): { ok: false; error: GitErrorInfo } {
	return { ok: false, error: { code, message, ...(displayCommand === undefined ? {} : { displayCommand }) } };
}

function execOptions(cwd: string, timeout: number, signal: AbortSignal | undefined): ExecOptions {
	if (signal === undefined) {
		return { cwd, timeout };
	}
	return { cwd, timeout, signal };
}

function isMissingRevisionResult(result: ExecResult): boolean {
	if (result.code !== 128) {
		return false;
	}
	const output = `${result.stderr}\n${result.stdout}`;
	return output.includes("Needed a single revision");
}

function isMissingTreeResult(result: ExecResult): boolean {
	const output = `${result.stdout}\n${result.stderr}`;
	return output.includes("exists on disk, but not in") || output.includes("does not exist in") || output.includes("unknown revision or path");
}

function parseLocalBranchTips(stdout: string): GitLocalBranchTip[] {
	return stdout.split(/\r?\n/u).flatMap((line) => {
		if (line.trim().length === 0) return [];
		const [name, headIso] = line.split("\t", 2);
		if (name === undefined || name.length === 0) return [];
		return [{ name, headIso: headIso === undefined || headIso.length === 0 ? null : headIso }];
	});
}

function firstNonEmptyLine(value: string): string | undefined {
	return nonEmptyLines(value)[0];
}

function nonEmptyLines(value: string): string[] {
	return value
		.split(/\r?\n/u)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

export function parseGitWorktreePorcelain(stdout: string): GitWorktreePorcelainEntry[] {
	const entries: GitWorktreePorcelainEntry[] = [];
	let current: GitWorktreePorcelainEntry | null = null;

	function pushCurrent(): void {
		if (current !== null) entries.push(current);
		current = null;
	}

	for (const line of stdout.split("\n")) {
		if (line.length === 0) {
			pushCurrent();
			continue;
		}
		if (line.startsWith("worktree ")) {
			pushCurrent();
			current = { path: line.slice("worktree ".length), branch: null };
			continue;
		}
		if (current !== null && line.startsWith("branch ")) {
			const ref = line.slice("branch ".length);
			current = { ...current, branch: ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref };
		}
	}
	pushCurrent();
	return entries;
}
