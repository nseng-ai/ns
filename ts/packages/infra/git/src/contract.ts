export interface GitCwdParams {
	cwd: string;
	// optional-undefined-objective: preserve (env-map) — Injected NodeJS.ProcessEnv environment map passed through to child-process exec; environment/process-map mirror kept loose.
	env?: NodeJS.ProcessEnv | undefined;
	// optional-undefined-objective: preserve (abort-signal) — AbortSignal cancellation handle forwarded to exec; abort/signal payload where present-undefined is the canonical loose boundary per rubric.
	signal?: AbortSignal | undefined;
}

export interface GitErrorInfo {
	code: string;
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
	currentBranch(params: GitCwdParams): Promise<GitCurrentBranchResult>;
	isInsideWorkTree(params: GitCwdParams): Promise<GitResult<boolean>>;
	trunkBranch(params: GitCwdParams): Promise<GitOptionalResult<string>>;
	originUrl(params: GitCwdParams): Promise<GitOptionalResult<string>>;
	headCommit(params: GitCwdParams): Promise<GitResult<string>>;
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
}
