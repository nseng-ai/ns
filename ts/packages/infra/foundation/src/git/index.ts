import path from "node:path";

import type { CommandExecApi, ExecOptions, ExecResult } from "@nseng-ai/foundation/exec";
import { commandSucceeded, formatCommand, formatCommandFailure } from "@nseng-ai/foundation/exec";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import { firstNonEmptyLine, nonEmptyLines } from "@nseng-ai/foundation/text-normalization";
import type {
	GitBranchParams,
	GitBranchPresenceResult,
	GitCommitParams,
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
	GitStagePathsParams,
	GitStatusPathFacts,
	GitStatusPathsParams,
	KnownGitErrorCode,
} from "./contract.ts";
import { rejectEmptyStagePaths } from "./contract.ts";
import { parseGitNameStatusPaths, parseGitStatusPaths } from "./status-paths.ts";

export type {
	GitBranchParams,
	GitBranchPresenceResult,
	GitCommitParams,
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
	GitStagePathsParams,
	GitStatusPathFacts,
	GitStatusPathsParams,
	KnownGitErrorCode,
} from "./contract.ts";
export {
	detectGitOperationInProgressAt,
	resolveWorktreeGitDirs,
	type GitOperationInProgress,
	type GitOperationInProgressFacts,
	type GitWorktreeGitDirsResolution,
	type GitWorktreeDirs,
	type GitWorktreeStateFs,
	type GitWorktreeStateOptions,
} from "./worktree-state.ts";
export {
	readLocalBranchRefs,
	type LocalBranchRefDirent,
	type LocalBranchRefReadResult,
	type LocalBranchRefReaderFs,
	type ReadLocalBranchRefsOptions,
} from "./local-ref-reader.ts";

const GIT_TIMEOUT_MS = 10_000;

const GIT_LOCAL_BRANCH_TIPS_FOR_EACH_REF_FORMAT =
	"%(refname:short)%09%(objectname)%09%(committerdate:iso-strict)";

export const GIT_LOCAL_BRANCH_TIPS_FOR_EACH_REF_ARGS = [
	"for-each-ref",
	`--format=${GIT_LOCAL_BRANCH_TIPS_FOR_EACH_REF_FORMAT}`,
	"refs/heads",
] as const;

interface CommandRun {
	result: ExecResult;
	displayCommand: string;
}

type CommandRunResult = GitResult<CommandRun>;

interface GitExpectSuccessFailure {
	code: KnownGitErrorCode;
	title: string;
}

export interface RealGitGatewayOptions {
	timeoutMs?: number;
}

export class RealGitGateway implements GitGateway {
	private readonly execApi: CommandExecApi;
	private readonly timeoutMs: number;

	constructor(execApi: CommandExecApi, options: RealGitGatewayOptions = {}) {
		this.execApi = execApi;
		this.timeoutMs = options.timeoutMs ?? GIT_TIMEOUT_MS;
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
		if (!commandSucceeded(run.value.result)) return { type: "missing" };

		const root = firstNonEmptyLine(run.value.result.stdout);
		return root === undefined ? { type: "missing" } : { type: "found", value: root };
	}

	async currentBranch(params: GitCwdParams): Promise<GitCurrentBranchResult> {
		const run = await this.runGit(params, ["branch", "--show-current"]);
		if (!run.ok) return { type: "failure", error: run.error };
		if (!commandSucceeded(run.value.result)) {
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
		if (commandSucceeded(run.value.result)) {
			return { ok: true, value: run.value.result.stdout.trim() === "true" };
		}
		if (
			run.value.result.type === "exited" &&
			run.value.result.signal === null &&
			run.value.result.code === 128
		) {
			return { ok: true, value: false };
		}
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
		if (run.ok && commandSucceeded(run.value.result)) {
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
		if (commandSucceeded(run.value.result)) {
			return { type: "found", value: run.value.result.stdout };
		}
		if (
			run.value.result.type === "exited" &&
			run.value.result.signal === null &&
			run.value.result.code === 1
		) {
			return { type: "missing" };
		}
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

	async gitCommonDir(params: GitCwdParams): Promise<GitResult<string>> {
		const run = await this.runGitExpectingSuccess(params, ["rev-parse", "--git-common-dir"], {
			code: "git_common_dir_failed",
			title: "git rev-parse --git-common-dir failed",
		});
		if (!run.ok) return run;

		const commonDir = firstNonEmptyLine(run.value.result.stdout);
		if (commonDir === undefined) {
			return error(
				"git_common_dir_empty",
				`git rev-parse --git-common-dir returned no path.\nCommand: ${run.value.displayCommand}`,
				run.value.displayCommand,
			);
		}
		return {
			ok: true,
			value: path.isAbsolute(commonDir)
				? path.normalize(commonDir)
				: path.resolve(params.cwd, commonDir),
		};
	}

	async previousBranch(params: GitCwdParams): Promise<GitOptionalResult<string>> {
		const run = await this.runGit(params, ["rev-parse", "--abbrev-ref", "@{-1}"]);
		if (!run.ok) return { type: "error", error: run.error };
		if (!commandSucceeded(run.value.result)) return { type: "missing" };

		const branch = firstNonEmptyLine(run.value.result.stdout);
		if (branch === undefined || branch === "@{-1}") return { type: "missing" };
		return { type: "found", value: branch };
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
		if (!commandSucceeded(run.value.result)) {
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
		if (commandSucceeded(run.value.result)) {
			return { type: "present", refName, displayCommand: run.value.displayCommand };
		}
		if (
			(run.value.result.type === "exited" &&
				run.value.result.signal === null &&
				run.value.result.code === 1) ||
			isMissingRevisionResult(run.value.result)
		) {
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
		if (!commandSucceeded(run.value.result)) {
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
			[...GIT_LOCAL_BRANCH_TIPS_FOR_EACH_REF_ARGS],
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
			if (commandSucceeded(run.value.result)) {
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
		const run = await this.runChangedPathsDiff(params, ["--name-only"]);
		if (!run.ok) return run;
		return { ok: true, value: nonEmptyLines(run.value.result.stdout) };
	}

	async changedPathsUnderWithRenames(
		params: GitRevisionRangePathParams,
	): Promise<GitResult<readonly string[]>> {
		const run = await this.runChangedPathsDiff(params, ["--name-status", "-M"]);
		if (!run.ok) return run;
		const parsed = parseGitNameStatusPaths(run.value.result.stdout);
		if (!parsed.ok) return parsed;
		return { ok: true, value: parsed.value.changedPaths };
	}

	async statusPaths(params: GitStatusPathsParams): Promise<GitResult<GitStatusPathFacts>> {
		const args = ["status", "--porcelain=v1", "-z"];
		if (params.pathspecs !== undefined) {
			args.push("--", ...params.pathspecs);
		}
		const run = await this.runGitExpectingSuccess(params, args, {
			code: "git_status_paths_failed",
			title: "git status --porcelain=v1 -z failed",
		});
		if (!run.ok) return run;
		return parseGitStatusPaths(run.value.result.stdout);
	}

	async stagePaths(params: GitStagePathsParams): Promise<GitOperationResult> {
		const emptyPaths = rejectEmptyStagePaths(params.paths);
		if (emptyPaths !== undefined) return emptyPaths;
		const run = await this.runGitExpectingSuccess(params, ["add", "--", ...params.paths], {
			code: "git_stage_paths_failed",
			title: "git add failed",
		});
		if (!run.ok) return run;
		return { ok: true };
	}

	async commit(params: GitCommitParams): Promise<GitResult<string>> {
		const run = await this.runGitExpectingSuccess(params, ["commit", "-m", params.message], {
			code: "git_commit_failed",
			title: "git commit failed",
		});
		if (!run.ok) return run;
		return await this.headCommit(params);
	}

	async hasStagedChanges(params: GitCwdParams): Promise<GitResult<boolean>> {
		const run = await this.runGit(params, ["diff", "--cached", "--quiet", "--exit-code"]);
		if (!run.ok) return run;
		const { result, displayCommand } = run.value;
		if (result.type === "exited" && result.signal === null && result.code === 0)
			return { ok: true, value: false };
		if (result.type === "exited" && result.signal === null && result.code === 1)
			return { ok: true, value: true };
		return error(
			"git_staged_probe_failed",
			formatCommandFailure("git diff --cached --quiet --exit-code failed", displayCommand, result),
			displayCommand,
		);
	}

	async checkStagedWhitespace(params: GitCwdParams): Promise<GitOperationResult> {
		const run = await this.runGitExpectingSuccess(params, ["diff", "--cached", "--check"], {
			code: "git_staged_whitespace_failed",
			title: "git diff --cached --check failed",
		});
		if (!run.ok) return run;
		return { ok: true };
	}

	async unstageAll(params: GitCwdParams): Promise<GitOperationResult> {
		const run = await this.runGitExpectingSuccess(params, ["reset", "--"], {
			code: "git_unstage_failed",
			title: "git reset failed",
		});
		if (!run.ok) return run;
		return { ok: true };
	}

	async checkout(params: GitBranchParams): Promise<GitOperationResult> {
		const run = await this.runGitExpectingSuccess(params, ["checkout", params.branch], {
			code: "git_checkout_failed",
			title: "git checkout failed",
		});
		if (!run.ok) return run;
		return { ok: true };
	}

	private async runChangedPathsDiff(
		params: GitRevisionRangePathParams,
		nameArgs: readonly string[],
	): Promise<GitResult<CommandRun>> {
		return await this.runGitExpectingSuccess(
			params,
			["diff", ...nameArgs, params.revisionRange, "--", params.relativePath],
			{
				code: "git_changed_paths_failed",
				title: "git changed path lookup failed",
			},
		);
	}

	private async runGitExpectingSuccess(
		params: GitCwdParams,
		args: string[],
		failureInfo: GitExpectSuccessFailure,
	): Promise<GitResult<CommandRun>> {
		const run = await this.runGit(params, args);
		if (!run.ok) return run;
		if (commandSucceeded(run.value.result)) return run;
		return error(
			failureInfo.code,
			formatCommandFailure(failureInfo.title, run.value.displayCommand, run.value.result),
			run.value.displayCommand,
		);
	}

	private async runGit(params: GitCwdParams, args: string[]): Promise<CommandRunResult> {
		const displayCommand = formatCommand("git", args);
		try {
			const result = await this.execApi.exec("git", args, execOptions(params, this.timeoutMs));
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
	return (
		result.type === "exited" &&
		result.signal === null &&
		result.code === 128 &&
		outputIncludesAnyPhrase(result, ["Needed a single revision"])
	);
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
		const [name, headSha, headIso] = line.split("\t", 3);
		if (name === undefined || name.length === 0) return [];
		return [
			{
				name,
				headSha: headSha === undefined || headSha.length === 0 ? null : headSha,
				headIso: headIso === undefined || headIso.length === 0 ? null : headIso,
			},
		];
	});
}

export interface GitWorktreePorcelainEntry {
	path: string;
	branch: string | null;
}

export type LocalBranchRefreshPlan =
	| {
			type: "pull-checked-out-branch";
			cwd: string;
			args: string[];
	  }
	| {
			type: "fetch-local-branch";
			cwd: string;
			args: string[];
	  };

export interface LocalBranchRefreshPlanOptions {
	branch: string;
	cwd: string;
	worktreePorcelain: string;
}

export function planLocalBranchRefreshFromWorktrees(
	options: LocalBranchRefreshPlanOptions,
): LocalBranchRefreshPlan {
	const checkedOutPath = parseGitWorktreePorcelain(options.worktreePorcelain).find(
		(entry) => entry.branch === options.branch,
	)?.path;
	if (checkedOutPath !== undefined) {
		return {
			type: "pull-checked-out-branch",
			cwd: checkedOutPath,
			args: ["pull", "--ff-only", "origin", options.branch],
		};
	}

	return {
		type: "fetch-local-branch",
		cwd: options.cwd,
		args: ["fetch", "origin", `refs/heads/${options.branch}:refs/heads/${options.branch}`],
	};
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
			current = {
				...current,
				branch: ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref,
			};
		}
	}
	pushCurrent();
	return entries;
}
