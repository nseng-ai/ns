import type {
	GitBranchParams,
	GitBranchPresenceResult,
	GitCwdParams,
	GitErrorInfo,
	GitOperationResult,
	GitOptionalResult,
	GitResult,
	PlannedBranchGitGateway,
} from "../../src/git-gateway.ts";

type ValueState<T> = T | { type: "failure"; error?: GitErrorInfo };
type OptionalValueState<T> = T | { type: "missing" } | { type: "failure"; error?: GitErrorInfo };

export interface InMemoryGitGatewayState {
	repoRoot?: ValueState<string>;
	optionalRepoRoot?: OptionalValueState<string>;
	sourceBranch?: ValueState<string>;
	implementationBranch?: ValueState<string>;
	defaultBranch?: OptionalValueState<string>;
	originUrl?: OptionalValueState<string>;
	headCommit?: ValueState<string>;
	existingBranches?: readonly string[];
	invalidBranchRefs?: readonly string[];
	createBranchFailure?: GitErrorInfo | undefined;
}

export interface GitCall {
	cwd: string;
}

export interface GitBranchCall extends GitCall {
	branch: string;
}

export class InMemoryPlannedBranchGitGateway implements PlannedBranchGitGateway {
	private readonly repoRootState: ValueState<string>;
	private readonly optionalRepoRootState: OptionalValueState<string>;
	private readonly sourceBranchState: ValueState<string>;
	private readonly implementationBranchState: ValueState<string>;
	private readonly defaultBranchState: OptionalValueState<string>;
	private readonly originUrlState: OptionalValueState<string>;
	private readonly headCommitState: ValueState<string>;
	private readonly branches: Set<string>;
	private readonly invalidBranchRefs: Set<string>;
	private readonly createBranchFailure: GitErrorInfo | undefined;
	private readonly repoRootLog: GitCall[] = [];
	private readonly optionalRepoRootLog: GitCall[] = [];
	private readonly sourceBranchLog: GitCall[] = [];
	private readonly implementationBranchLog: GitCall[] = [];
	private readonly defaultBranchLog: GitCall[] = [];
	private readonly originUrlLog: GitCall[] = [];
	private readonly headCommitLog: GitCall[] = [];
	private readonly validateBranchRefLog: GitBranchCall[] = [];
	private readonly localBranchPresenceLog: GitBranchCall[] = [];
	private readonly createBranchAtHeadLog: GitBranchCall[] = [];

	constructor(state: InMemoryGitGatewayState = {}) {
		this.repoRootState = state.repoRoot ?? "/repo";
		this.optionalRepoRootState = state.optionalRepoRoot ?? state.repoRoot ?? "/repo";
		this.sourceBranchState = state.sourceBranch ?? "feature/source-plan";
		this.implementationBranchState = state.implementationBranch ?? "planned-branches/branch-scoped-plan";
		this.defaultBranchState = state.defaultBranch ?? "main";
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

	get sourceBranchCalls(): readonly GitCall[] {
		return copyCalls(this.sourceBranchLog);
	}

	get implementationBranchCalls(): readonly GitCall[] {
		return copyCalls(this.implementationBranchLog);
	}

	get defaultBranchCalls(): readonly GitCall[] {
		return copyCalls(this.defaultBranchLog);
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
		this.repoRootLog.push({ cwd: params.cwd });
		return valueResult(this.repoRootState, "repo_root_failed", "Could not resolve git repository root.");
	}

	async optionalRepoRoot(params: GitCwdParams): Promise<GitOptionalResult<string>> {
		this.optionalRepoRootLog.push({ cwd: params.cwd });
		return optionalValueResult(this.optionalRepoRootState, "repo_root_failed", "Could not resolve git repository root.");
	}

	async sourceBranch(params: GitCwdParams): Promise<GitResult<string>> {
		this.sourceBranchLog.push({ cwd: params.cwd });
		return valueResult(this.sourceBranchState, "source_branch_failed", "Could not resolve source branch.");
	}

	async implementationBranch(params: GitCwdParams): Promise<GitResult<string>> {
		this.implementationBranchLog.push({ cwd: params.cwd });
		return valueResult(this.implementationBranchState, "implementation_branch_failed", "Could not resolve implementation branch.");
	}

	async defaultBranch(params: GitCwdParams): Promise<GitOptionalResult<string>> {
		this.defaultBranchLog.push({ cwd: params.cwd });
		return optionalValueResult(this.defaultBranchState, "default_branch_failed", "Could not resolve default branch.");
	}

	async originUrl(params: GitCwdParams): Promise<GitOptionalResult<string>> {
		this.originUrlLog.push({ cwd: params.cwd });
		return optionalValueResult(this.originUrlState, "origin_url_failed", "Could not resolve origin URL.");
	}

	async headCommit(params: GitCwdParams): Promise<GitResult<string>> {
		this.headCommitLog.push({ cwd: params.cwd });
		return valueResult(this.headCommitState, "head_commit_failed", "Could not resolve HEAD commit.");
	}

	async validateBranchRef(params: GitBranchParams): Promise<GitOperationResult> {
		this.validateBranchRefLog.push({ cwd: params.cwd, branch: params.branch });
		if (this.invalidBranchRefs.has(params.branch)) {
			return { ok: false, error: { code: "branch_ref_invalid", message: `Invalid branch ref: ${params.branch}` } };
		}
		return { ok: true };
	}

	async localBranchPresence(params: GitBranchParams): Promise<GitBranchPresenceResult> {
		this.localBranchPresenceLog.push({ cwd: params.cwd, branch: params.branch });
		const refName = `refs/heads/${params.branch}`;
		if (this.branches.has(params.branch)) {
			return { type: "present", refName, displayCommand: `git rev-parse --verify ${refName}` };
		}
		return { type: "absent", refName };
	}

	async createBranchAtHead(params: GitBranchParams): Promise<GitOperationResult> {
		this.createBranchAtHeadLog.push({ cwd: params.cwd, branch: params.branch });
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

function isFailureState(value: unknown): value is { type: "failure"; error?: GitErrorInfo } {
	return typeof value === "object" && value !== null && "type" in value && value.type === "failure";
}

function isMissingState(value: unknown): value is { type: "missing" } {
	return typeof value === "object" && value !== null && "type" in value && value.type === "missing";
}

function copyCalls(calls: readonly GitCall[]): GitCall[] {
	return calls.map((call) => ({ ...call }));
}

function copyBranchCalls(calls: readonly GitBranchCall[]): GitBranchCall[] {
	return calls.map((call) => ({ ...call }));
}
