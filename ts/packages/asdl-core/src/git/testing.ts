import type {
	GitBranchParams,
	GitBranchPresenceResult,
	GitCwdParams,
	GitErrorInfo,
	GitGateway,
	GitOperationResult,
	GitOptionalResult,
	GitResult,
} from "./index.ts";

type ValueState<T> = T | { type: "failure"; error?: GitErrorInfo | undefined };
type OptionalValueState<T> = T | { type: "missing" } | { type: "failure"; error?: GitErrorInfo | undefined };
type CurrentBranchState = ValueState<string> | { type: "detached" };

export interface InMemoryGitGatewayState {
	repoRoot?: ValueState<string> | undefined;
	optionalRepoRoot?: OptionalValueState<string> | undefined;
	currentBranch?: CurrentBranchState | undefined;
	trunkBranch?: OptionalValueState<string> | undefined;
	originUrl?: OptionalValueState<string> | undefined;
	headCommit?: ValueState<string> | undefined;
	existingBranches?: readonly string[] | undefined;
	invalidBranchRefs?: readonly string[] | undefined;
	createBranchFailure?: GitErrorInfo | undefined;
}

export interface GitCall {
	cwd: string;
	signal?: AbortSignal | undefined;
}

export interface GitBranchCall extends GitCall {
	branch: string;
}

export class InMemoryGitGateway implements GitGateway {
	private readonly repoRootState: ValueState<string>;
	private readonly optionalRepoRootState: OptionalValueState<string>;
	private readonly currentBranchState: CurrentBranchState;
	private readonly trunkBranchState: OptionalValueState<string>;
	private readonly originUrlState: OptionalValueState<string>;
	private readonly headCommitState: ValueState<string>;
	private readonly branches: Set<string>;
	private readonly invalidBranchRefs: Set<string>;
	private readonly createBranchFailure: GitErrorInfo | undefined;
	private readonly repoRootLog: GitCall[] = [];
	private readonly optionalRepoRootLog: GitCall[] = [];
	private readonly currentBranchLog: GitCall[] = [];
	private readonly trunkBranchLog: GitCall[] = [];
	private readonly originUrlLog: GitCall[] = [];
	private readonly headCommitLog: GitCall[] = [];
	private readonly validateBranchRefLog: GitBranchCall[] = [];
	private readonly localBranchPresenceLog: GitBranchCall[] = [];
	private readonly createBranchAtHeadLog: GitBranchCall[] = [];

	constructor(state: InMemoryGitGatewayState = {}) {
		this.repoRootState = state.repoRoot ?? "/repo";
		this.optionalRepoRootState = state.optionalRepoRoot ?? state.repoRoot ?? "/repo";
		this.currentBranchState = state.currentBranch ?? "feature/source-plan";
		this.trunkBranchState = state.trunkBranch ?? "main";
		this.originUrlState = state.originUrl ?? "git@github.com:Owner/Repo.git\n";
		this.headCommitState = state.headCommit ?? "0123456789abcdef0123456789abcdef01234567";
		this.branches = new Set(state.existingBranches ?? []);
		this.invalidBranchRefs = new Set(state.invalidBranchRefs ?? []);
		this.createBranchFailure = state.createBranchFailure;
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

	get trunkBranchCalls(): readonly GitCall[] {
		return copyCalls(this.trunkBranchLog);
	}

	get originUrlCalls(): readonly GitCall[] {
		return copyCalls(this.originUrlLog);
	}

	get headCommitCalls(): readonly GitCall[] {
		return copyCalls(this.headCommitLog);
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

	get existingBranches(): readonly string[] {
		return [...this.branches].sort();
	}

	async repoRoot(params: GitCwdParams): Promise<GitResult<string>> {
		this.repoRootLog.push(callFromParams(params));
		return valueResult(this.repoRootState, "repo_root_failed", "Could not resolve git repository root.");
	}

	async optionalRepoRoot(params: GitCwdParams): Promise<GitOptionalResult<string>> {
		this.optionalRepoRootLog.push(callFromParams(params));
		return optionalValueResult(this.optionalRepoRootState, "repo_root_failed", "Could not resolve git repository root.");
	}

	async currentBranch(params: GitCwdParams): Promise<GitResult<string>> {
		this.currentBranchLog.push(callFromParams(params));
		if (isDetachedState(this.currentBranchState)) {
			return {
				ok: false,
				error: {
					code: "detached_head",
					message: "git branch --show-current returned no current branch.\nCommand: git branch --show-current",
					displayCommand: "git branch --show-current",
				},
			};
		}
		return valueResult(this.currentBranchState, "current_branch_failed", "Could not resolve current branch.");
	}

	async trunkBranch(params: GitCwdParams): Promise<GitOptionalResult<string>> {
		this.trunkBranchLog.push(callFromParams(params));
		return optionalValueResult(this.trunkBranchState, "trunk_branch_failed", "Could not resolve trunk branch.");
	}

	async originUrl(params: GitCwdParams): Promise<GitOptionalResult<string>> {
		this.originUrlLog.push(callFromParams(params));
		return optionalValueResult(this.originUrlState, "origin_url_failed", "Could not resolve origin URL.");
	}

	async headCommit(params: GitCwdParams): Promise<GitResult<string>> {
		this.headCommitLog.push(callFromParams(params));
		return valueResult(this.headCommitState, "head_commit_failed", "Could not resolve HEAD commit.");
	}

	async validateBranchRef(params: GitBranchParams): Promise<GitOperationResult> {
		this.validateBranchRefLog.push(branchCallFromParams(params));
		if (this.invalidBranchRefs.has(params.branch)) {
			return { ok: false, error: { code: "branch_ref_invalid", message: `Invalid branch ref: ${params.branch}` } };
		}
		return { ok: true };
	}

	async localBranchPresence(params: GitBranchParams): Promise<GitBranchPresenceResult> {
		this.localBranchPresenceLog.push(branchCallFromParams(params));
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
}

function valueResult<T>(state: ValueState<T>, defaultCode: string, defaultMessage: string): GitResult<T> {
	if (isFailureState(state)) {
		return { ok: false, error: state.error ?? { code: defaultCode, message: defaultMessage } };
	}
	return { ok: true, value: state };
}

function optionalValueResult<T>(state: OptionalValueState<T>, defaultCode: string, defaultMessage: string): GitOptionalResult<T> {
	if (isMissingState(state)) {
		return { type: "missing" };
	}
	if (isFailureState(state)) {
		return { type: "error", error: state.error ?? { code: defaultCode, message: defaultMessage } };
	}
	return { type: "found", value: state };
}

function isFailureState(value: unknown): value is { type: "failure"; error?: GitErrorInfo | undefined } {
	return typeof value === "object" && value !== null && "type" in value && value.type === "failure";
}

function isMissingState(value: unknown): value is { type: "missing" } {
	return typeof value === "object" && value !== null && "type" in value && value.type === "missing";
}

function isDetachedState(value: unknown): value is { type: "detached" } {
	return typeof value === "object" && value !== null && "type" in value && value.type === "detached";
}

function callFromParams(params: GitCwdParams): GitCall {
	return { cwd: params.cwd, ...(params.signal === undefined ? {} : { signal: params.signal }) };
}

function branchCallFromParams(params: GitBranchParams): GitBranchCall {
	return { ...callFromParams(params), branch: params.branch };
}

function copyCalls(calls: readonly GitCall[]): GitCall[] {
	return calls.map((call) => ({ ...call }));
}

function copyBranchCalls(calls: readonly GitBranchCall[]): GitBranchCall[] {
	return calls.map((call) => ({ ...call }));
}
