import type {
	GitCurrentBranchResult,
	GitCwdParams,
	GitErrorInfo,
	GitOptionalResult,
	GitResult,
} from "../kit/git-contract.ts";
export type {
	GitCurrentBranchResult,
	GitCwdParams,
	GitErrorCode,
	GitErrorInfo,
	GitOptionalResult,
	GitResult,
	KnownGitErrorCode,
} from "../kit/git-contract.ts";

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
