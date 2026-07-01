import path from "node:path";

import type { CommandExecApi, ExecOptions, ExecResult } from "@sdl/exec";
import { formatCommand, formatCommandFailure } from "@sdl/exec";
import { formatErrorMessage } from "@sdl/core/primitives";
import { firstNonEmptyLine, nonEmptyLines } from "@sdl/core/text-normalization";
import type {
	GitBranchParams,
	GitBranchPresenceResult,
	GitCurrentBranchResult,
	GitCwdParams,
	GitErrorInfo,
	GitGateway,
	GitLocalBranchTip,
	GitOperationResult,
	GitOptionalResult,
	GitPathParams,
	GitRefsPathParams,
	GitResult,
	GitRevisionRangePathParams,
	KnownGitErrorCode,
} from "./contract.ts";

export type {
	GitBranchParams,
	GitBranchPresenceResult,
	GitCurrentBranchResult,
	GitCwdParams,
	GitErrorCode,
	GitErrorInfo,
	GitGateway,
	GitLocalBranchTip,
	GitOperationResult,
	GitOptionalResult,
	GitPathParams,
	GitRefsPathParams,
	GitResult,
	GitRevisionRangePathParams,
	KnownGitErrorCode,
} from "./contract.ts";
export {
	readLocalBranchRefs,
	type LocalBranchRefDirent,
	type LocalBranchRefReaderFs,
	type LocalBranchRefReadResult,
	type ReadLocalBranchRefsOptions,
} from "./local-ref-reader.ts";

const GIT_TIMEOUT_MS = 10_000;

interface CommandRun {
	result: ExecResult;
	displayCommand: string;
}

type CommandRunResult = GitResult<CommandRun>;

interface GitExpectSuccessFailure {
	code: KnownGitErrorCode;
	title: string;
}

export class RealGitGateway implements GitGateway {
	private readonly execApi: CommandExecApi;

	constructor(execApi: CommandExecApi) {
		this.execApi = execApi;
	}

	async repoRoot(params: GitCwdParams): Promise<GitResult<string>> {
		const run = await this.runGitExpectingSuccess(params, ["rev-parse", "--show-toplevel"], {
			code: "repo_root_failed",
			title: "git rev-parse --show-toplevel failed",
		});
		if (!run.ok) return run;

		const root = firstNonEmptyLine(run.value.result.stdout);
		if (root === undefined) {
			return error(
				"repo_root_empty",
				`git rev-parse --show-toplevel returned no repo root.\nCommand: ${run.value.displayCommand}`,
				run.value.displayCommand,
			);
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

	async currentBranch(params: GitCwdParams): Promise<GitCurrentBranchResult> {
		const run = await this.runGit(params, ["branch", "--show-current"]);
		if (!run.ok) return { type: "failure", error: run.error };
		if (run.value.result.code !== 0 || run.value.result.killed) {
			return {
				type: "failure",
				error: failure("current-branch-failed", "git branch --show-current failed", run.value),
			};
		}

		const branch = firstNonEmptyLine(run.value.result.stdout);
		if (branch === undefined) return { type: "detached" };
		return { type: "branch", branch };
	}

	async isInsideWorkTree(params: GitCwdParams): Promise<GitResult<boolean>> {
		const run = await this.runGit(params, ["rev-parse", "--is-inside-work-tree"]);
		if (!run.ok) return run;
		if (run.value.result.killed) {
			return error(
				"work_tree_probe_failed",
				formatCommandFailure(
					"git rev-parse --is-inside-work-tree failed",
					run.value.displayCommand,
					run.value.result,
				),
				run.value.displayCommand,
			);
		}
		if (run.value.result.code === 0) {
			return { ok: true, value: run.value.result.stdout.trim() === "true" };
		}
		if (run.value.result.code === 128) return { ok: true, value: false };
		return error(
			"work_tree_probe_failed",
			formatCommandFailure(
				"git rev-parse --is-inside-work-tree failed",
				run.value.displayCommand,
				run.value.result,
			),
			run.value.displayCommand,
		);
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
			return {
				type: "error",
				error: failure(
					"origin-url-killed",
					"git config --get remote.origin.url was killed",
					run.value,
				),
			};
		}
		if (run.value.result.code === 0) return { type: "found", value: run.value.result.stdout };
		if (run.value.result.code === 1) return { type: "missing" };
		return {
			type: "error",
			error: failure("origin-url-failed", "git config --get remote.origin.url failed", run.value),
		};
	}

	async headCommit(params: GitCwdParams): Promise<GitResult<string>> {
		const run = await this.runGitExpectingSuccess(params, ["rev-parse", "HEAD"], {
			code: "head_commit_failed",
			title: "git rev-parse HEAD failed",
		});
		if (!run.ok) return run;

		const commit = firstNonEmptyLine(run.value.result.stdout);
		if (commit === undefined) {
			return error(
				"head_commit_empty",
				`git rev-parse HEAD returned no commit.\nCommand: ${run.value.displayCommand}`,
				run.value.displayCommand,
			);
		}
		return { ok: true, value: commit };
	}

	async gitPath(params: GitPathParams): Promise<GitResult<string>> {
		const run = await this.runGitExpectingSuccess(
			params,
			["rev-parse", "--path-format=absolute", "--git-path", params.relativePath],
			{
				code: "git_path_failed",
				title: "git rev-parse --git-path failed",
			},
		);
		if (!run.ok) return run;

		const gitPath = firstNonEmptyLine(run.value.result.stdout);
		if (gitPath === undefined) {
			return error(
				"git_path_empty",
				`git rev-parse --git-path returned no path.\nCommand: ${run.value.displayCommand}`,
				run.value.displayCommand,
			);
		}
		return {
			ok: true,
			value: path.isAbsolute(gitPath) ? path.normalize(gitPath) : path.resolve(params.cwd, gitPath),
		};
	}

	async validateBranchRef(params: GitBranchParams): Promise<GitOperationResult> {
		const run = await this.runGit(params, ["check-ref-format", "--branch", params.branch]);
		if (!run.ok) return run;
		if (run.value.result.code !== 0 || run.value.result.killed) {
			return {
				ok: false,
				error: failure("branch-ref-invalid", "git check-ref-format failed", run.value),
			};
		}
		return { ok: true };
	}

	async localBranchPresence(params: GitBranchParams): Promise<GitBranchPresenceResult> {
		const refName = `refs/heads/${params.branch}`;
		const run = await this.runGit(params, ["rev-parse", "--verify", refName]);
		if (!run.ok) return { type: "error", error: run.error };
		if (run.value.result.killed) {
			return {
				type: "error",
				error: failure(
					"branch-presence-killed",
					"git branch existence check was killed",
					run.value,
				),
			};
		}
		if (run.value.result.code === 0) {
			return { type: "present", refName, displayCommand: run.value.displayCommand };
		}
		if (run.value.result.code === 1 || isMissingRevisionResult(run.value.result)) {
			return { type: "absent", refName };
		}
		return {
			type: "error",
			error: failure("branch-presence-failed", "git branch existence check failed", run.value),
		};
	}

	async createBranchAtHead(params: GitBranchParams): Promise<GitOperationResult> {
		const run = await this.runGit(params, ["branch", params.branch, "HEAD"]);
		if (!run.ok) return run;
		if (run.value.result.code !== 0 || run.value.result.killed) {
			return { ok: false, error: failure("branch-create-failed", "git branch failed", run.value) };
		}
		return { ok: true };
	}

	async hasUncommittedChangesUnder(params: GitPathParams): Promise<GitResult<boolean>> {
		const run = await this.runGitExpectingSuccess(
			params,
			["status", "--porcelain", "--", params.relativePath],
			{
				code: "git_dirty_status_failed",
				title: "git status for path failed",
			},
		);
		if (!run.ok) return run;
		return { ok: true, value: run.value.result.stdout.trim().length > 0 };
	}

	async listLocalBranchTips(
		params: GitCwdParams,
	): Promise<GitResult<readonly GitLocalBranchTip[]>> {
		const run = await this.runGitExpectingSuccess(
			params,
			["for-each-ref", "--format=%(refname:short)%09%(committerdate:iso-strict)", "refs/heads"],
			{
				code: "git_branch_tips_failed",
				title: "git local branch tip listing failed",
			},
		);
		if (!run.ok) return run;
		return { ok: true, value: parseLocalBranchTips(run.value.result.stdout) };
	}

	async treeOidsAtRefs(
		params: GitRefsPathParams,
	): Promise<GitResult<Readonly<Record<string, string | null>>>> {
		const values: Record<string, string | null> = {};
		for (const ref of params.refs) {
			const run = await this.runGit(params, ["rev-parse", `${ref}:${params.relativePath}`]);
			if (!run.ok) return run;
			if (run.value.result.killed) {
				return error(
					"git_tree_oid_failed",
					formatCommandFailure(
						"git tree lookup for path failed",
						run.value.displayCommand,
						run.value.result,
					),
					run.value.displayCommand,
				);
			}
			if (run.value.result.code === 0) {
				values[ref] = firstNonEmptyLine(run.value.result.stdout) ?? null;
				continue;
			}
			if (isMissingTreeResult(run.value.result)) {
				values[ref] = null;
				continue;
			}
			return error(
				"git_tree_oid_failed",
				formatCommandFailure(
					"git tree lookup for path failed",
					run.value.displayCommand,
					run.value.result,
				),
				run.value.displayCommand,
			);
		}
		return { ok: true, value: values };
	}

	async changedPathsUnder(
		params: GitRevisionRangePathParams,
	): Promise<GitResult<readonly string[]>> {
		const run = await this.runGitExpectingSuccess(
			params,
			["diff", "--name-only", params.revisionRange, "--", params.relativePath],
			{
				code: "git_changed_paths_failed",
				title: "git changed path lookup failed",
			},
		);
		if (!run.ok) return run;
		return { ok: true, value: nonEmptyLines(run.value.result.stdout) };
	}

	private async runGitExpectingSuccess(
		params: GitCwdParams,
		args: string[],
		failure: GitExpectSuccessFailure,
	): Promise<GitResult<CommandRun>> {
		const run = await this.runGit(params, args);
		if (!run.ok) return run;
		if (run.value.result.code === 0 && !run.value.result.killed) return run;
		return error(
			failure.code,
			formatCommandFailure(failure.title, run.value.displayCommand, run.value.result),
			run.value.displayCommand,
		);
	}

	private async runGit(params: GitCwdParams, args: string[]): Promise<CommandRunResult> {
		const displayCommand = formatCommand("git", args);
		try {
			const result = await this.execApi.exec("git", args, execOptions(params, GIT_TIMEOUT_MS));
			return { ok: true, value: { result, displayCommand } };
		} catch (caught) {
			const message = formatErrorMessage(caught);
			return error(
				"git_startup_failed",
				`git command failed before completion.\nCommand: ${displayCommand}\nError: ${message}`,
				displayCommand,
			);
		}
	}
}

function failure(code: KnownGitErrorCode, title: string, run: CommandRun): GitErrorInfo {
	return error(
		code,
		formatCommandFailure(title, run.displayCommand, run.result),
		run.displayCommand,
	).error;
}

function error(
	code: KnownGitErrorCode,
	message: string,
	displayCommand?: string,
): { ok: false; error: GitErrorInfo } {
	return {
		ok: false,
		error: { code, message, ...(displayCommand === undefined ? {} : { displayCommand }) },
	};
}

function execOptions(params: GitCwdParams, timeout: number): ExecOptions {
	return {
		cwd: params.cwd,
		timeout,
		...(params.env === undefined ? {} : { env: params.env }),
		...(params.signal === undefined ? {} : { signal: params.signal }),
	};
}

function isMissingRevisionResult(result: ExecResult): boolean {
	return result.code === 128 && outputIncludesAnyPhrase(result, ["Needed a single revision"]);
}

function isMissingTreeResult(result: ExecResult): boolean {
	return outputIncludesAnyPhrase(result, [
		"exists on disk, but not in",
		"does not exist in",
		"unknown revision or path",
	]);
}

function outputIncludesAnyPhrase(result: ExecResult, phrases: readonly string[]): boolean {
	const output = combinedOutput(result);
	return phrases.some((phrase) => output.includes(phrase));
}

function combinedOutput(result: ExecResult): string {
	return `${result.stdout}\n${result.stderr}`;
}

function parseLocalBranchTips(stdout: string): GitLocalBranchTip[] {
	return stdout.split(/\r?\n/u).flatMap((line) => {
		if (line.trim().length === 0) return [];
		const [name, headIso] = line.split("\t", 2);
		if (name === undefined || name.length === 0) return [];
		return [{ name, headIso: headIso === undefined || headIso.length === 0 ? null : headIso }];
	});
}
