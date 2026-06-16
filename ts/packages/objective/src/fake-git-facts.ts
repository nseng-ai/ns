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
	private readonly dirtyPaths: ReadonlySet<string>;
	private readonly failures: ReadonlyMap<string, ObjectiveGitErrorInfo>;
	private readonly branches: readonly ObjectiveLocalBranchTip[];
	private readonly treeOids: ReadonlyMap<string, string | null | ObjectiveGitErrorInfo>;
	private readonly pathTouches: ReadonlyMap<string, readonly ObjectivePathChangeTouch[] | ObjectiveGitErrorInfo>;
	private readonly dirtyChecks: ObjectiveRepoPathParams[] = [];
	private readonly branchTipChecks: ObjectiveRepoParams[] = [];
	private readonly treeOidChecks: ObjectiveRefsPathParams[] = [];
	private readonly pathTouchChecks: ObjectiveRevisionRangePathParams[] = [];

	constructor(options: FakeObjectiveGitFactsGatewayOptions = {}) {
		this.dirtyPaths = new Set((options.dirtyPaths ?? []).map(normalizeRelativePath));
		this.failures = new Map(Object.entries(options.failures ?? {}).map(([path, error]) => [normalizeRelativePath(path), { ...error }]));
		this.branches = (options.branches ?? ["master"]).map(normalizeBranchTip);
		this.treeOids = new Map(Object.entries(options.treeOids ?? {}).map(([key, value]) => [normalizeRefPathKey(key), cloneTreeOidValue(value)]));
		this.pathTouches = new Map(Object.entries(options.pathTouches ?? {}).map(([key, value]) => [normalizeRefPathKey(key), clonePathTouchesValue(value)]));
	}

	get hasUncommittedChangesUnderCalls(): readonly ObjectiveRepoPathParams[] {
		return this.dirtyChecks.map((call) => ({ ...call }));
	}

	get listLocalBranchTipsCalls(): readonly ObjectiveRepoParams[] {
		return this.branchTipChecks.map((call) => ({ ...call }));
	}

	get treeOidsAtRefsCalls(): readonly ObjectiveRefsPathParams[] {
		return this.treeOidChecks.map((call) => ({ ...call, refs: [...call.refs] }));
	}

	get pathTouchesUnderCalls(): readonly ObjectiveRevisionRangePathParams[] {
		return this.pathTouchChecks.map((call) => ({ ...call }));
	}

	async hasUncommittedChangesUnder(params: ObjectiveRepoPathParams): Promise<ObjectiveGitResult<boolean>> {
		this.dirtyChecks.push({ ...params });
		const path = normalizeRelativePath(params.relativePath);
		const failure = this.failures.get(path);
		if (failure !== undefined) return { ok: false, error: { ...failure } };
		return { ok: true, value: this.dirtyPaths.has(path) };
	}

	async listLocalBranchTips(params: ObjectiveRepoParams): Promise<ObjectiveGitResult<readonly ObjectiveLocalBranchTip[]>> {
		this.branchTipChecks.push({ ...params });
		const failure = this.failures.get("branch-tips");
		if (failure !== undefined) return { ok: false, error: { ...failure } };
		return { ok: true, value: this.branches.map((branch) => ({ ...branch })) };
	}

	async treeOidsAtRefs(params: ObjectiveRefsPathParams): Promise<ObjectiveGitResult<Readonly<Record<string, string | null>>>> {
		this.treeOidChecks.push({ ...params, refs: [...params.refs] });
		const values: Record<string, string | null> = {};
		for (const ref of params.refs) {
			const key = refPathKey(ref, params.relativePath);
			const value = this.treeOids.get(key);
			if (isGitErrorInfo(value)) return { ok: false, error: { ...value } };
			values[ref] = this.treeOids.has(key) ? (value ?? null) : `${ref}:${normalizeRelativePath(params.relativePath)}:tree`;
		}
		return { ok: true, value: values };
	}

	async pathTouchesUnder(params: ObjectiveRevisionRangePathParams): Promise<ObjectiveGitResult<readonly ObjectivePathChangeTouch[]>> {
		this.pathTouchChecks.push({ ...params });
		const value = this.pathTouches.get(refPathKey(params.revisionRange, params.relativePath));
		if (isGitErrorInfo(value)) return { ok: false, error: { ...value } };
		return { ok: true, value: clonePathTouches(value ?? []) };
	}
}

function normalizeBranchTip(value: string | ObjectiveLocalBranchTip): ObjectiveLocalBranchTip {
	if (typeof value === "string") return { name: value, headIso: null };
	return { name: value.name, headIso: value.headIso };
}

function cloneTreeOidValue(value: string | null | ObjectiveGitErrorInfo): string | null | ObjectiveGitErrorInfo {
	if (isGitErrorInfo(value)) return { ...value };
	return value;
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
	return `${ref}\u0000${normalizeRelativePath(path)}`;
}

function normalizeRefPathKey(key: string): string {
	if (key.includes("\u0000")) return key;
	const [ref, path] = key.split("|", 2);
	if (ref === undefined || path === undefined) return key;
	return refPathKey(ref, path);
}

function normalizeRelativePath(path: string): string {
	const normalized = path.replaceAll("\\", "/").replace(/\/+$|^\.\//g, "");
	return normalized === "" ? "." : normalized;
}
