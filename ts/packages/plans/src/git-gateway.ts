import { formatCommand, formatCommandFailure, type ExecOptions, type ExecResult, type CommandExecApi } from "@asdl/core/exec";

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

export interface PlansGitGateway {
	repoRoot(params: GitCwdParams): Promise<GitResult<string>>;
	optionalRepoRoot(params: GitCwdParams): Promise<GitOptionalResult<string>>;
	currentBranch(params: GitCwdParams): Promise<GitResult<string>>;
	originUrl(params: GitCwdParams): Promise<GitOptionalResult<string>>;
}

interface CommandRun {
	result: ExecResult;
	displayCommand: string;
}

type CommandRunResult = { ok: true; value: CommandRun } | { ok: false; error: GitErrorInfo };

export class RealPlansGitGateway implements PlansGitGateway {
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

function firstNonEmptyLine(value: string): string | undefined {
	return value
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find((line) => line.length > 0);
}
