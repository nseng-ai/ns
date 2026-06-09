import { formatCommand, formatOutputSection, tailText, type ExecResult } from "./command-runtime.ts";
import type { ExecOptions, PlanCommandExecApi } from "@asdl/plans";

const GIT_TIMEOUT_MS = 10_000;
const MAX_ERROR_CHARS = 4_000;

export interface GitCwdParams {
	cwd: string;
	signal?: AbortSignal | undefined;
}

export interface GitBranchParams extends GitCwdParams {
	branch: string;
}

export interface GitErrorInfo {
	code: string;
	message: string;
	displayCommand?: string;
}

export type GitResult<T> = { ok: true; value: T } | { ok: false; error: GitErrorInfo };
export type GitOptionalResult<T> = { type: "found"; value: T } | { type: "missing" } | { type: "error"; error: GitErrorInfo };
export type GitOperationResult = { ok: true } | { ok: false; error: GitErrorInfo };
export type GitBranchPresenceResult =
	| { type: "present"; refName: string; displayCommand: string }
	| { type: "absent"; refName: string }
	| { type: "error"; error: GitErrorInfo };

export interface PlannedBranchGitGateway {
	repoRoot(params: GitCwdParams): Promise<GitResult<string>>;
	optionalRepoRoot(params: GitCwdParams): Promise<GitOptionalResult<string>>;
	sourceBranch(params: GitCwdParams): Promise<GitResult<string>>;
	implementationBranch(params: GitCwdParams): Promise<GitResult<string>>;
	defaultBranch(params: GitCwdParams): Promise<GitOptionalResult<string>>;
	originUrl(params: GitCwdParams): Promise<GitOptionalResult<string>>;
	headCommit(params: GitCwdParams): Promise<GitResult<string>>;
	validateBranchRef(params: GitBranchParams): Promise<GitOperationResult>;
	localBranchPresence(params: GitBranchParams): Promise<GitBranchPresenceResult>;
	createBranchAtHead(params: GitBranchParams): Promise<GitOperationResult>;
}

interface CommandRun {
	result: ExecResult;
	displayCommand: string;
}

type CommandRunResult = { ok: true; value: CommandRun } | { ok: false; error: GitErrorInfo };

export class RealPlannedBranchGitGateway implements PlannedBranchGitGateway {
	private readonly pi: PlanCommandExecApi;

	constructor(pi: PlanCommandExecApi) {
		this.pi = pi;
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

	async sourceBranch(params: GitCwdParams): Promise<GitResult<string>> {
		const run = await this.runGit(params, ["branch", "--show-current"]);
		if (!run.ok) return run;
		if (run.value.result.code !== 0 || run.value.result.killed) {
			return error("source_branch_failed", formatCommandFailure("git branch --show-current failed", run.value.displayCommand, run.value.result), run.value.displayCommand);
		}

		const branch = firstNonEmptyLine(run.value.result.stdout);
		if (branch === undefined) {
			return error("detached_head", `git branch --show-current returned no current branch.\nCommand: ${run.value.displayCommand}`, run.value.displayCommand);
		}
		return { ok: true, value: branch };
	}

	async implementationBranch(params: GitCwdParams): Promise<GitResult<string>> {
		const run = await this.runGit(params, ["symbolic-ref", "--short", "HEAD"]);
		if (!run.ok) return run;
		if (run.value.result.code !== 0 || run.value.result.killed) {
			return error("implementation_branch_failed", formatCommandFailure("git symbolic-ref --short HEAD failed", run.value.displayCommand, run.value.result), run.value.displayCommand);
		}

		const branch = firstNonEmptyLine(run.value.result.stdout);
		if (branch === undefined) {
			return error("detached_head", `git symbolic-ref --short HEAD returned no branch.\nCommand: ${run.value.displayCommand}`, run.value.displayCommand);
		}
		return { ok: true, value: branch };
	}

	async defaultBranch(params: GitCwdParams): Promise<GitOptionalResult<string>> {
		const run = await this.runGit(params, ["symbolic-ref", "refs/remotes/origin/HEAD", "--short"]);
		if (!run.ok) return { type: "missing" };
		if (run.value.result.code !== 0 || run.value.result.killed) return { type: "missing" };

		const ref = firstNonEmptyLine(run.value.result.stdout);
		if (ref === undefined) return { type: "missing" };
		return { type: "found", value: ref.startsWith("origin/") ? ref.slice("origin/".length) : ref };
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

	private async runGit(params: GitCwdParams, args: string[]): Promise<CommandRunResult> {
		const displayCommand = formatCommand("git", args);
		try {
			const result = await this.pi.exec("git", args, execOptions(params.cwd, GIT_TIMEOUT_MS, params.signal));
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

function formatCommandFailure(title: string, displayCommand: string, result: ExecResult): string {
	const status = result.killed ? `exit code ${result.code}; process was killed or timed out` : `exit code ${result.code}`;
	return tailText(
		[
			`${title} (${status}).`,
			`Command: ${displayCommand}`,
			formatOutputSection("stdout", result.stdout, { maxChars: MAX_ERROR_CHARS, maxLines: 80 }),
			formatOutputSection("stderr", result.stderr, { maxChars: MAX_ERROR_CHARS, maxLines: 80 }),
		].join("\n\n"),
		{ maxChars: MAX_ERROR_CHARS, maxLines: 120 },
	);
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

function firstNonEmptyLine(value: string): string | undefined {
	return value
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find((line) => line.length > 0);
}
