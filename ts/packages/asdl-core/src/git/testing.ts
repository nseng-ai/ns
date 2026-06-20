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
} from "./index.ts";

interface FailureState {
	type: "failure";
	error?: GitErrorInfo | undefined;
}
type ValueState<T> = T | FailureState;
type OptionalValueState<T> = T | { type: "missing" } | FailureState;
type CurrentBranchState = ValueState<string> | { type: "detached" };
type BranchPresenceFailureState = FailureState;

export interface InMemoryGitGatewayState {
	repoRoot?: ValueState<string> | undefined;
	optionalRepoRoot?: OptionalValueState<string> | undefined;
	currentBranch?: CurrentBranchState | undefined;
	isInsideWorkTree?: ValueState<boolean> | undefined;
	trunkBranch?: OptionalValueState<string> | undefined;
	originUrl?: OptionalValueState<string> | undefined;
	headCommit?: ValueState<string> | undefined;
	gitPaths?: Readonly<Record<string, ValueState<string>>> | undefined;
	existingBranches?: readonly string[] | undefined;
	invalidBranchRefs?: readonly string[] | undefined;
	localBranchPresenceFailure?: BranchPresenceFailureState | undefined;
	localBranchPresenceFailures?: Readonly<Record<string, BranchPresenceFailureState>> | undefined;
	createBranchFailure?: GitErrorInfo | undefined;
	dirtyPaths?: readonly string[] | undefined;
	dirtyPathFailures?: Readonly<Record<string, GitErrorInfo>> | undefined;
	localBranchTips?: readonly (string | GitLocalBranchTip)[] | undefined;
	localBranchTipsFailure?: GitErrorInfo | undefined;
	treeOids?: Readonly<Record<string, string | null | GitErrorInfo>> | undefined;
	changedPaths?: Readonly<Record<string, readonly string[] | GitErrorInfo>> | undefined;
}

export interface GitCall {
	cwd: string;
	signal?: AbortSignal | undefined;
}

export interface GitBranchCall extends GitCall {
	branch: string;
}

export interface GitPathCall extends GitCall {
	relativePath: string;
}

export interface GitRefsPathCall extends GitPathCall {
	refs: readonly string[];
}

export interface GitRevisionRangePathCall extends GitPathCall {
	revisionRange: string;
}

export class InMemoryGitGateway implements GitGateway {
	private readonly repoRootState: ValueState<string>;
	private readonly optionalRepoRootState: OptionalValueState<string>;
	private readonly currentBranchState: CurrentBranchState;
	private readonly isInsideWorkTreeState: ValueState<boolean>;
	private readonly trunkBranchState: OptionalValueState<string>;
	private readonly originUrlState: OptionalValueState<string>;
	private readonly headCommitState: ValueState<string>;
	private readonly gitPathStates: Readonly<Record<string, ValueState<string>>>;
	private readonly branches: Set<string>;
	private readonly invalidBranchRefs: Set<string>;
	private readonly localBranchPresenceFailure: BranchPresenceFailureState | undefined;
	private readonly localBranchPresenceFailures: Readonly<
		Record<string, BranchPresenceFailureState>
	>;
	private readonly createBranchFailure: GitErrorInfo | undefined;
	private readonly dirtyPaths: ReadonlySet<string>;
	private readonly dirtyPathFailures: Readonly<Record<string, GitErrorInfo>>;
	private readonly localBranchTipsState: readonly GitLocalBranchTip[];
	private readonly localBranchTipsFailure: GitErrorInfo | undefined;
	private readonly treeOids: ReadonlyMap<string, string | null | GitErrorInfo>;
	private readonly changedPaths: ReadonlyMap<string, readonly string[] | GitErrorInfo>;
	private readonly repoRootLog: GitCall[] = [];
	private readonly optionalRepoRootLog: GitCall[] = [];
	private readonly currentBranchLog: GitCall[] = [];
	private readonly isInsideWorkTreeLog: GitCall[] = [];
	private readonly trunkBranchLog: GitCall[] = [];
	private readonly originUrlLog: GitCall[] = [];
	private readonly headCommitLog: GitCall[] = [];
	private readonly gitPathLog: GitPathCall[] = [];
	private readonly validateBranchRefLog: GitBranchCall[] = [];
	private readonly localBranchPresenceLog: GitBranchCall[] = [];
	private readonly createBranchAtHeadLog: GitBranchCall[] = [];
	private readonly hasUncommittedChangesUnderLog: GitPathCall[] = [];
	private readonly listLocalBranchTipsLog: GitCall[] = [];
	private readonly treeOidsAtRefsLog: GitRefsPathCall[] = [];
	private readonly changedPathsUnderLog: GitRevisionRangePathCall[] = [];

	constructor(state: InMemoryGitGatewayState = {}) {
		this.repoRootState = state.repoRoot ?? "/repo";
		this.optionalRepoRootState = state.optionalRepoRoot ?? state.repoRoot ?? "/repo";
		this.currentBranchState = state.currentBranch ?? "feature/source-plan";
		this.isInsideWorkTreeState = state.isInsideWorkTree ?? true;
		this.trunkBranchState = state.trunkBranch ?? "main";
		this.originUrlState = state.originUrl ?? "git@github.com:Owner/Repo.git\n";
		this.headCommitState = state.headCommit ?? "0123456789abcdef0123456789abcdef01234567";
		this.gitPathStates = { ...state.gitPaths };
		this.branches = new Set(state.existingBranches ?? []);
		this.invalidBranchRefs = new Set(state.invalidBranchRefs ?? []);
		this.localBranchPresenceFailure = state.localBranchPresenceFailure;
		this.localBranchPresenceFailures = { ...state.localBranchPresenceFailures };
		this.createBranchFailure = state.createBranchFailure;
		this.dirtyPaths = new Set((state.dirtyPaths ?? []).map(normalizeGitTestingRelativePath));
		this.dirtyPathFailures = Object.fromEntries(
			Object.entries(state.dirtyPathFailures ?? {}).map(([path, error]) => [
				normalizeGitTestingRelativePath(path),
				{ ...error },
			]),
		);
		this.localBranchTipsState = (state.localBranchTips ?? []).map(normalizeBranchTip);
		this.localBranchTipsFailure = state.localBranchTipsFailure;
		this.treeOids = new Map(
			Object.entries(state.treeOids ?? {}).map(([key, value]) => [
				normalizeRefPathKey(key),
				cloneTreeOidValue(value),
			]),
		);
		this.changedPaths = new Map(
			Object.entries(state.changedPaths ?? {}).map(([key, value]) => [
				normalizeRefPathKey(key),
				cloneChangedPathsValue(value),
			]),
		);
	}

	get repoRootCalls(): readonly GitCall[] {
		return copyCalls(this.repoRootLog);
	}

	get optionalRepoRootCalls(): readonly GitCall[] {
		return copyCalls(this.optionalRepoRootLog);
	}

	get currentBranchCalls(): readonly GitCall[] {
		return copyCalls(this.currentBranchLog);
	}

	get isInsideWorkTreeCalls(): readonly GitCall[] {
		return copyCalls(this.isInsideWorkTreeLog);
	}

	get trunkBranchCalls(): readonly GitCall[] {
		return copyCalls(this.trunkBranchLog);
	}

	get originUrlCalls(): readonly GitCall[] {
		return copyCalls(this.originUrlLog);
	}

	get headCommitCalls(): readonly GitCall[] {
		return copyCalls(this.headCommitLog);
	}

	get gitPathCalls(): readonly GitPathCall[] {
		return copyPathCalls(this.gitPathLog);
	}

	get validateBranchRefCalls(): readonly GitBranchCall[] {
		return copyBranchCalls(this.validateBranchRefLog);
	}

	get localBranchPresenceCalls(): readonly GitBranchCall[] {
		return copyBranchCalls(this.localBranchPresenceLog);
	}

	get createBranchAtHeadCalls(): readonly GitBranchCall[] {
		return copyBranchCalls(this.createBranchAtHeadLog);
	}

	get hasUncommittedChangesUnderCalls(): readonly GitPathCall[] {
		return copyPathCalls(this.hasUncommittedChangesUnderLog);
	}

	get listLocalBranchTipsCalls(): readonly GitCall[] {
		return copyCalls(this.listLocalBranchTipsLog);
	}

	get treeOidsAtRefsCalls(): readonly GitRefsPathCall[] {
		return copyRefsPathCalls(this.treeOidsAtRefsLog);
	}

	get changedPathsUnderCalls(): readonly GitRevisionRangePathCall[] {
		return copyRevisionRangePathCalls(this.changedPathsUnderLog);
	}

	get existingBranches(): readonly string[] {
		return [...this.branches].sort();
	}

	async repoRoot(params: GitCwdParams): Promise<GitResult<string>> {
		this.repoRootLog.push(callFromParams(params));
		return valueResult(
			this.repoRootState,
			"repo_root_failed",
			"Could not resolve git repository root.",
		);
	}

	async optionalRepoRoot(params: GitCwdParams): Promise<GitOptionalResult<string>> {
		this.optionalRepoRootLog.push(callFromParams(params));
		return optionalValueResult(
			this.optionalRepoRootState,
			"repo_root_failed",
			"Could not resolve git repository root.",
		);
	}

	async currentBranch(params: GitCwdParams): Promise<GitCurrentBranchResult> {
		this.currentBranchLog.push(callFromParams(params));
		if (isDetachedState(this.currentBranchState)) {
			return { type: "detached", error: detachedHeadError() };
		}
		if (isFailureState(this.currentBranchState)) {
			return {
				type: "failure",
				error: this.currentBranchState.error ?? {
					code: "current_branch_failed",
					message: "Could not resolve current branch.",
				},
			};
		}
		return { type: "branch", branch: this.currentBranchState };
	}

	async isInsideWorkTree(params: GitCwdParams): Promise<GitResult<boolean>> {
		this.isInsideWorkTreeLog.push(callFromParams(params));
		return valueResult(
			this.isInsideWorkTreeState,
			"work_tree_probe_failed",
			"Could not determine whether cwd is inside a git work tree.",
		);
	}

	async trunkBranch(params: GitCwdParams): Promise<GitOptionalResult<string>> {
		this.trunkBranchLog.push(callFromParams(params));
		return optionalValueResult(
			this.trunkBranchState,
			"trunk_branch_failed",
			"Could not resolve trunk branch.",
		);
	}

	async originUrl(params: GitCwdParams): Promise<GitOptionalResult<string>> {
		this.originUrlLog.push(callFromParams(params));
		return optionalValueResult(
			this.originUrlState,
			"origin_url_failed",
			"Could not resolve origin URL.",
		);
	}

	async headCommit(params: GitCwdParams): Promise<GitResult<string>> {
		this.headCommitLog.push(callFromParams(params));
		return valueResult(
			this.headCommitState,
			"head_commit_failed",
			"Could not resolve HEAD commit.",
		);
	}

	async gitPath(params: GitPathParams): Promise<GitResult<string>> {
		this.gitPathLog.push(pathCallFromParams(params));
		const state =
			this.gitPathStates[params.relativePath] ??
			defaultGitPath(this.repoRootState, params.relativePath);
		return valueResult(state, "git_path_failed", "Could not resolve git path.");
	}

	async validateBranchRef(params: GitBranchParams): Promise<GitOperationResult> {
		this.validateBranchRefLog.push(branchCallFromParams(params));
		if (this.invalidBranchRefs.has(params.branch)) {
			return {
				ok: false,
				error: { code: "branch_ref_invalid", message: `Invalid branch ref: ${params.branch}` },
			};
		}
		return { ok: true };
	}

	async localBranchPresence(params: GitBranchParams): Promise<GitBranchPresenceResult> {
		this.localBranchPresenceLog.push(branchCallFromParams(params));
		const branchFailure = this.localBranchPresenceFailures[params.branch];
		if (branchFailure !== undefined) {
			return branchPresenceFailureResult(branchFailure);
		}
		if (this.localBranchPresenceFailure !== undefined) {
			return branchPresenceFailureResult(this.localBranchPresenceFailure);
		}

		const refName = `refs/heads/${params.branch}`;
		if (this.branches.has(params.branch)) {
			return { type: "present", refName, displayCommand: `git rev-parse --verify ${refName}` };
		}
		return { type: "absent", refName };
	}

	async createBranchAtHead(params: GitBranchParams): Promise<GitOperationResult> {
		this.createBranchAtHeadLog.push(branchCallFromParams(params));
		if (this.createBranchFailure !== undefined) {
			return { ok: false, error: this.createBranchFailure };
		}
		this.branches.add(params.branch);
		return { ok: true };
	}

	async hasUncommittedChangesUnder(params: GitPathParams): Promise<GitResult<boolean>> {
		this.hasUncommittedChangesUnderLog.push(pathCallFromParams(params));
		const path = normalizeGitTestingRelativePath(params.relativePath);
		const failure = this.dirtyPathFailures[path];
		if (failure !== undefined) return { ok: false, error: { ...failure } };
		return { ok: true, value: this.dirtyPaths.has(path) };
	}

	async listLocalBranchTips(
		params: GitCwdParams,
	): Promise<GitResult<readonly GitLocalBranchTip[]>> {
		this.listLocalBranchTipsLog.push(callFromParams(params));
		if (this.localBranchTipsFailure !== undefined)
			return { ok: false, error: { ...this.localBranchTipsFailure } };
		return { ok: true, value: this.localBranchTipsState.map((branch) => ({ ...branch })) };
	}

	async treeOidsAtRefs(
		params: GitRefsPathParams,
	): Promise<GitResult<Readonly<Record<string, string | null>>>> {
		this.treeOidsAtRefsLog.push(refsPathCallFromParams(params));
		const values: Record<string, string | null> = {};
		for (const ref of params.refs) {
			const key = refPathKey(ref, params.relativePath);
			const value = this.treeOids.get(key);
			if (isGitErrorInfo(value)) return { ok: false, error: { ...value } };
			values[ref] = this.treeOids.has(key)
				? (value ?? null)
				: `${ref}:${normalizeGitTestingRelativePath(params.relativePath)}:tree`;
		}
		return { ok: true, value: values };
	}

	async changedPathsUnder(
		params: GitRevisionRangePathParams,
	): Promise<GitResult<readonly string[]>> {
		this.changedPathsUnderLog.push(revisionRangePathCallFromParams(params));
		const value = this.changedPaths.get(refPathKey(params.revisionRange, params.relativePath));
		if (isGitErrorInfo(value)) return { ok: false, error: { ...value } };
		return { ok: true, value: [...(value ?? [])] };
	}
}

function valueResult<T>(
	state: ValueState<T>,
	defaultCode: string,
	defaultMessage: string,
): GitResult<T> {
	if (isFailureState(state)) {
		return { ok: false, error: state.error ?? { code: defaultCode, message: defaultMessage } };
	}
	return { ok: true, value: state };
}

function optionalValueResult<T>(
	state: OptionalValueState<T>,
	defaultCode: string,
	defaultMessage: string,
): GitOptionalResult<T> {
	if (isMissingState(state)) {
		return { type: "missing" };
	}
	if (isFailureState(state)) {
		return { type: "error", error: state.error ?? { code: defaultCode, message: defaultMessage } };
	}
	return { type: "found", value: state };
}

function branchPresenceFailureResult(state: BranchPresenceFailureState): GitBranchPresenceResult {
	return {
		type: "error",
		error: state.error ?? {
			code: "branch_presence_failed",
			message: "Could not determine local branch presence.",
		},
	};
}

function isFailureState(value: unknown): value is FailureState {
	return typeof value === "object" && value !== null && "type" in value && value.type === "failure";
}

function isMissingState(value: unknown): value is { type: "missing" } {
	return typeof value === "object" && value !== null && "type" in value && value.type === "missing";
}

function isDetachedState(value: unknown): value is { type: "detached" } {
	return (
		typeof value === "object" && value !== null && "type" in value && value.type === "detached"
	);
}

function detachedHeadError(): GitErrorInfo {
	return {
		code: "detached_head",
		message:
			"git branch --show-current returned no current branch.\nCommand: git branch --show-current",
		displayCommand: "git branch --show-current",
	};
}

function callFromParams(params: GitCwdParams): GitCall {
	return { cwd: params.cwd, ...(params.signal === undefined ? {} : { signal: params.signal }) };
}

function branchCallFromParams(params: GitBranchParams): GitBranchCall {
	return { ...callFromParams(params), branch: params.branch };
}

function pathCallFromParams(params: GitPathParams): GitPathCall {
	return { ...callFromParams(params), relativePath: params.relativePath };
}

function refsPathCallFromParams(params: GitRefsPathParams): GitRefsPathCall {
	return { ...pathCallFromParams(params), refs: [...params.refs] };
}

function revisionRangePathCallFromParams(
	params: GitRevisionRangePathParams,
): GitRevisionRangePathCall {
	return { ...pathCallFromParams(params), revisionRange: params.revisionRange };
}

function normalizeBranchTip(value: string | GitLocalBranchTip): GitLocalBranchTip {
	if (typeof value === "string") return { name: value, headIso: null };
	return { name: value.name, headIso: value.headIso };
}

function cloneTreeOidValue(value: string | null | GitErrorInfo): string | null | GitErrorInfo {
	if (isGitErrorInfo(value)) return { ...value };
	return value;
}

function cloneChangedPathsValue(
	value: readonly string[] | GitErrorInfo,
): readonly string[] | GitErrorInfo {
	if (isGitErrorInfo(value)) return { ...value };
	return [...value];
}

function isGitErrorInfo(value: unknown): value is GitErrorInfo {
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

export function normalizeGitTestingRelativePath(path: string): string {
	const normalized = path.replaceAll("\\", "/").replace(/\/+$/u, "").replace(/^\.\//u, "");
	return normalized === "" ? "." : normalized;
}

function defaultGitPath(
	repoRootState: ValueState<string>,
	relativePath: string,
): ValueState<string> {
	if (isFailureState(repoRootState)) return { type: "failure", error: repoRootState.error };
	return `${repoRootState}/.git/${relativePath}`;
}

function copyCalls(calls: readonly GitCall[]): GitCall[] {
	return calls.map((call) => ({ ...call }));
}

function copyBranchCalls(calls: readonly GitBranchCall[]): GitBranchCall[] {
	return calls.map((call) => ({ ...call }));
}

function copyPathCalls(calls: readonly GitPathCall[]): GitPathCall[] {
	return calls.map((call) => ({ ...call }));
}

function copyRefsPathCalls(calls: readonly GitRefsPathCall[]): GitRefsPathCall[] {
	return calls.map((call) => ({ ...call, refs: [...call.refs] }));
}

function copyRevisionRangePathCalls(
	calls: readonly GitRevisionRangePathCall[],
): GitRevisionRangePathCall[] {
	return calls.map((call) => ({ ...call }));
}
