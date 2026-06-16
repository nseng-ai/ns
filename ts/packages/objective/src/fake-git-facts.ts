import { InMemoryGitGateway, normalizeGitTestingRelativePath } from "@asdl/core/git/testing";

import type {
	ObjectiveGitErrorInfo,
	ObjectiveGitFactsGateway,
	ObjectiveGitResult,
	ObjectiveLocalBranchTip,
	ObjectivePathChangeTouch,
	ObjectiveRefsPathParams,
	ObjectiveRepoParams,
	ObjectiveRepoPathParams,
	ObjectiveRevisionRangePathParams,
} from "./git-facts.ts";

export interface FakeObjectiveGitFactsGatewayOptions {
	dirtyPaths?: readonly string[] | undefined;
	failures?: Readonly<Record<string, ObjectiveGitErrorInfo>> | undefined;
	branches?: readonly (string | ObjectiveLocalBranchTip)[] | undefined;
	treeOids?: Readonly<Record<string, string | null | ObjectiveGitErrorInfo>> | undefined;
	pathTouches?: Readonly<Record<string, readonly ObjectivePathChangeTouch[] | ObjectiveGitErrorInfo>> | undefined;
}

export class FakeObjectiveGitFactsGateway implements ObjectiveGitFactsGateway {
	private readonly git: InMemoryGitGateway;
	private readonly pathTouches: ReadonlyMap<string, readonly ObjectivePathChangeTouch[] | ObjectiveGitErrorInfo>;
	private readonly pathTouchChecks: ObjectiveRevisionRangePathParams[] = [];

	constructor(options: FakeObjectiveGitFactsGatewayOptions = {}) {
		const failures = options.failures ?? {};
		const { ["branch-tips"]: branchTipsFailure, ...dirtyPathFailures } = failures;
		this.git = new InMemoryGitGateway({
			dirtyPaths: options.dirtyPaths,
			dirtyPathFailures,
			localBranchTips: options.branches ?? ["master"],
			...(branchTipsFailure === undefined ? {} : { localBranchTipsFailure: branchTipsFailure }),
			treeOids: options.treeOids,
		});
		this.pathTouches = new Map(Object.entries(options.pathTouches ?? {}).map(([key, value]) => [normalizeRefPathKey(key), clonePathTouchesValue(value)]));
	}

	get hasUncommittedChangesUnderCalls(): readonly ObjectiveRepoPathParams[] {
		return this.git.hasUncommittedChangesUnderCalls.map((call) => ({ repoRoot: call.cwd, relativePath: call.relativePath, ...(call.signal === undefined ? {} : { signal: call.signal }) }));
	}

	get listLocalBranchTipsCalls(): readonly ObjectiveRepoParams[] {
		return this.git.listLocalBranchTipsCalls.map((call) => ({ repoRoot: call.cwd, ...(call.signal === undefined ? {} : { signal: call.signal }) }));
	}

	get treeOidsAtRefsCalls(): readonly ObjectiveRefsPathParams[] {
		return this.git.treeOidsAtRefsCalls.map((call) => ({
			repoRoot: call.cwd,
			relativePath: call.relativePath,
			refs: [...call.refs],
			...(call.signal === undefined ? {} : { signal: call.signal }),
		}));
	}

	get pathTouchesUnderCalls(): readonly ObjectiveRevisionRangePathParams[] {
		return this.pathTouchChecks.map((call) => ({ ...call }));
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
		this.pathTouchChecks.push({ ...params });
		const value = this.pathTouches.get(refPathKey(params.revisionRange, params.relativePath));
		if (isGitErrorInfo(value)) return { ok: false, error: { ...value } };
		return { ok: true, value: clonePathTouches(value ?? []) };
	}
}

function clonePathTouchesValue(value: readonly ObjectivePathChangeTouch[] | ObjectiveGitErrorInfo): readonly ObjectivePathChangeTouch[] | ObjectiveGitErrorInfo {
	if (isGitErrorInfo(value)) return { ...value };
	return clonePathTouches(value);
}

function clonePathTouches(value: readonly ObjectivePathChangeTouch[]): ObjectivePathChangeTouch[] {
	return value.map((touch) => ({ paths: [...touch.paths] }));
}

function isGitErrorInfo(value: unknown): value is ObjectiveGitErrorInfo {
	return typeof value === "object" && value !== null && "code" in value && "message" in value;
}

function refPathKey(ref: string, path: string): string {
	return `${ref}\u0000${normalizeGitTestingRelativePath(path)}`;
}

function normalizeRefPathKey(key: string): string {
	if (key.includes("\u0000")) return key;
	const [ref, path] = key.split("|", 2);
	if (ref === undefined || path === undefined) return key;
	return refPathKey(ref, path);
}
