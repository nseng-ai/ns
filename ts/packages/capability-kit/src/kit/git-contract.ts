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
