import type { GitErrorInfo, GitGateway, GitLocalBranchTip } from "@asdl/core/git";

export type ObjectiveGitErrorInfo = GitErrorInfo;

export type ObjectiveGitResult<T> = { ok: true; value: T } | { ok: false; error: ObjectiveGitErrorInfo };

export interface ObjectiveRepoPathParams {
	repoRoot: string;
	relativePath: string;
	signal?: AbortSignal | undefined;
}

export interface ObjectiveRepoParams {
	repoRoot: string;
	signal?: AbortSignal | undefined;
}

export interface ObjectiveRefsPathParams extends ObjectiveRepoPathParams {
	refs: readonly string[];
}

export interface ObjectiveRevisionRangePathParams extends ObjectiveRepoPathParams {
	revisionRange: string;
}

export type ObjectiveLocalBranchTip = GitLocalBranchTip;

export interface ObjectivePathChangeTouch {
	paths: readonly string[];
}

export interface ObjectiveGitFactsGateway {
	hasUncommittedChangesUnder(params: ObjectiveRepoPathParams): Promise<ObjectiveGitResult<boolean>>;
	listLocalBranchTips(params: ObjectiveRepoParams): Promise<ObjectiveGitResult<readonly ObjectiveLocalBranchTip[]>>;
	treeOidsAtRefs(params: ObjectiveRefsPathParams): Promise<ObjectiveGitResult<Readonly<Record<string, string | null>>>>;
	pathTouchesUnder(params: ObjectiveRevisionRangePathParams): Promise<ObjectiveGitResult<readonly ObjectivePathChangeTouch[]>>;
}

export class RealObjectiveGitFactsGateway implements ObjectiveGitFactsGateway {
	private readonly git: GitGateway;

	constructor(git: GitGateway) {
		this.git = git;
	}

	async hasUncommittedChangesUnder(params: ObjectiveRepoPathParams): Promise<ObjectiveGitResult<boolean>> {
		return this.git.hasUncommittedChangesUnder({ cwd: params.repoRoot, relativePath: params.relativePath, signal: params.signal });
	}

	async listLocalBranchTips(params: ObjectiveRepoParams): Promise<ObjectiveGitResult<readonly ObjectiveLocalBranchTip[]>> {
		return this.git.listLocalBranchTips({ cwd: params.repoRoot, signal: params.signal });
	}

	async treeOidsAtRefs(params: ObjectiveRefsPathParams): Promise<ObjectiveGitResult<Readonly<Record<string, string | null>>>> {
		return this.git.treeOidsAtRefs({ cwd: params.repoRoot, refs: params.refs, relativePath: params.relativePath, signal: params.signal });
	}

	async pathTouchesUnder(params: ObjectiveRevisionRangePathParams): Promise<ObjectiveGitResult<readonly ObjectivePathChangeTouch[]>> {
		const result = await this.git.changedPathsUnder({ cwd: params.repoRoot, revisionRange: params.revisionRange, relativePath: params.relativePath, signal: params.signal });
		if (!result.ok) return result;
		return { ok: true, value: result.value.length === 0 ? [] : [{ paths: result.value }] };
	}
}

export class CleanObjectiveGitFactsGateway implements ObjectiveGitFactsGateway {
	async hasUncommittedChangesUnder(_params: ObjectiveRepoPathParams): Promise<ObjectiveGitResult<boolean>> {
		return { ok: true, value: false };
	}

	async listLocalBranchTips(_params: ObjectiveRepoParams): Promise<ObjectiveGitResult<readonly ObjectiveLocalBranchTip[]>> {
		return { ok: true, value: [] };
	}

	async treeOidsAtRefs(params: ObjectiveRefsPathParams): Promise<ObjectiveGitResult<Readonly<Record<string, string | null>>>> {
		return { ok: true, value: Object.fromEntries(params.refs.map((ref) => [ref, null])) };
	}

	async pathTouchesUnder(_params: ObjectiveRevisionRangePathParams): Promise<ObjectiveGitResult<readonly ObjectivePathChangeTouch[]>> {
		return { ok: true, value: [] };
	}
}
