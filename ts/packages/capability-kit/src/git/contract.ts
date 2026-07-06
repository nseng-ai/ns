import type { ExplicitUndefined } from "@nseng-ai/foundation/primitives";
export interface GitCwdParams {
	cwd: string;
	env?: ExplicitUndefined<"env-map", NodeJS.ProcessEnv>;
	signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
}

export type KnownGitErrorCode =
	| "branch-create-failed"
	| "branch-presence-failed"
	| "branch-presence-killed"
	| "branch-ref-invalid"
	| "current-branch-failed"
	| "git_branch_tips_failed"
	| "git_changed_paths_failed"
	| "git_checkout_failed"
	| "git_commit_failed"
	| "git_common_dir_empty"
	| "git_common_dir_failed"
	| "git_dirty_status_failed"
	| "git_path_empty"
	| "git_path_failed"
	| "git_stage_paths_failed"
	| "git_staged_probe_failed"
	| "git_staged_whitespace_failed"
	| "git_startup_failed"
	| "git_status_parse_failed"
	| "git_status_paths_failed"
	| "git_tree_oid_failed"
	| "git_unstage_failed"
	| "head_commit_empty"
	| "head_commit_failed"
	| "origin-url-failed"
	| "origin-url-killed"
	| "previous_branch_failed"
	| "repo_root_empty"
	| "repo_root_failed"
	| "work_tree_probe_failed";

export type GitErrorCode = KnownGitErrorCode | (string & {});

export interface GitErrorInfo {
	code: GitErrorCode;
	message: string;
	displayCommand?: string;
}

export type GitResult<T> = { ok: true; value: T } | { ok: false; error: GitErrorInfo };
export type GitCurrentBranchResult =
	| { type: "branch"; branch: string }
	| { type: "detached" }
	| { type: "failure"; error: GitErrorInfo };
export type GitOptionalResult<T> =
	| { type: "found"; value: T }
	| { type: "missing" }
	| { type: "error"; error: GitErrorInfo };

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

export interface GitStatusPathsParams extends GitCwdParams {
	pathspecs?: readonly string[];
}

export interface GitStagePathsParams extends GitCwdParams {
	paths: readonly string[];
}

export interface GitCommitParams extends GitCwdParams {
	message: string;
}

export interface GitStatusPathFacts {
	changedPaths: readonly string[];
}

export interface GitLocalBranchTip {
	name: string;
	headSha?: string | null;
	headIso: string | null;
}

export type GitOperationResult = { ok: true } | { ok: false; error: GitErrorInfo };

export function rejectEmptyStagePaths(paths: readonly string[]): GitOperationResult | undefined {
	if (paths.length > 0) return undefined;
	return {
		ok: false,
		error: {
			code: "git_stage_paths_failed",
			message: "Refusing to stage an empty path list.",
		},
	};
}
export type GitBranchPresenceResult =
	| { type: "present"; refName: string; displayCommand: string }
	| { type: "absent"; refName: string }
	| { type: "error"; error: GitErrorInfo };

export interface GitGateway {
	repoRoot(params: GitCwdParams): Promise<GitResult<string>>;
	optionalRepoRoot(params: GitCwdParams): Promise<GitOptionalResult<string>>;
	currentBranch(params: GitCwdParams): Promise<GitCurrentBranchResult>;
	isInsideWorkTree(params: GitCwdParams): Promise<GitResult<boolean>>;
	trunkBranch(params: GitCwdParams): Promise<GitOptionalResult<string>>;
	originUrl(params: GitCwdParams): Promise<GitOptionalResult<string>>;
	headCommit(params: GitCwdParams): Promise<GitResult<string>>;
	gitCommonDir(params: GitCwdParams): Promise<GitResult<string>>;
	previousBranch(params: GitCwdParams): Promise<GitOptionalResult<string>>;
	gitPath(params: GitPathParams): Promise<GitResult<string>>;
	validateBranchRef(params: GitBranchParams): Promise<GitOperationResult>;
	localBranchPresence(params: GitBranchParams): Promise<GitBranchPresenceResult>;
	createBranchAtHead(params: GitBranchParams): Promise<GitOperationResult>;
	hasUncommittedChangesUnder(params: GitPathParams): Promise<GitResult<boolean>>;
	listLocalBranchTips(params: GitCwdParams): Promise<GitResult<readonly GitLocalBranchTip[]>>;
	treeOidsAtRefs(
		params: GitRefsPathParams,
	): Promise<GitResult<Readonly<Record<string, string | null>>>>;
	changedPathsUnder(params: GitRevisionRangePathParams): Promise<GitResult<readonly string[]>>;
	changedPathsUnderWithRenames(
		params: GitRevisionRangePathParams,
	): Promise<GitResult<readonly string[]>>;
	statusPaths(params: GitStatusPathsParams): Promise<GitResult<GitStatusPathFacts>>;
	stagePaths(params: GitStagePathsParams): Promise<GitOperationResult>;
	commit(params: GitCommitParams): Promise<GitResult<string>>;
	hasStagedChanges(params: GitCwdParams): Promise<GitResult<boolean>>;
	checkStagedWhitespace(params: GitCwdParams): Promise<GitOperationResult>;
	unstageAll(params: GitCwdParams): Promise<GitOperationResult>;
	checkout(params: GitBranchParams): Promise<GitOperationResult>;
}
