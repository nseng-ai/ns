import type { ExecResult } from "@nseng-ai/foundation/command";
import type {
	LandContext,
	LandingBoundaryFailure,
	LandingBranchDependencyTarget,
	LandGitGateway,
	LandGithubPrGateway,
	LandGraphiteCommandResult,
	LandGraphiteDeleteLocalBranchResult,
	LandGraphiteGateway,
	LandGraphiteRefreshBranchResult,
	LandGraphiteRestackScope,
	LandOutcome,
	LandResult,
	LandWorktreeSlotFactsGateway,
	LocalBranchTip,
	ManagedSlotWorktree,
	PullRequestDependencyFacts,
	PullRequestFacts,
	SquashMergePullRequestResult,
	StackSnapshot,
	WorkingTreeStatus,
	WorktreeClassification,
	WorktreeEntry,
} from "./types.ts";

interface FailureState {
	readonly type: "failure";
	readonly failure?: LandingBoundaryFailure;
}
type ValueState<T> = T | FailureState;
type OperationState =
	| { readonly type: "success" }
	| {
			readonly type: "failure";
			readonly failure?: LandingBoundaryFailure;
			readonly commandDisplay?: string;
			readonly result?: ExecResult;
	  };
export type InMemoryLandDeleteLocalBranchResult = Exclude<
	LandGraphiteDeleteLocalBranchResult,
	{ readonly type: "deleted" }
>;

/** Testing-only cross-gateway semantic call log; events never expose adapter command strings. */
export type InMemoryLandCallEvent =
	| { readonly operation: "git.localBranchSha"; readonly request: LandBranchCall }
	| { readonly operation: "git.snapshotBackupRefs"; readonly request: LandSnapshotBackupRefsCall }
	| { readonly operation: "git.checkoutBranch"; readonly request: LandBranchCall }
	| { readonly operation: "git.currentBranch"; readonly request: LandRepoCall }
	| {
			readonly operation: "github.pullRequestFacts";
			readonly request: LandPullRequestFactsCall;
	  }
	| {
			readonly operation: "github.squashMergePullRequest";
			readonly request: LandSquashMergePullRequestCall;
	  }
	| {
			readonly operation: "graphite.refreshBranchFromRemote";
			readonly request: LandRefreshBranchFromRemoteCall;
	  }
	| {
			readonly operation: "graphite.deleteLocalBranch";
			readonly request: LandDeleteLocalBranchCall;
	  }
	| { readonly operation: "graphite.restack"; readonly request: LandRestackCall }
	| { readonly operation: "graphite.submitUpdate"; readonly request: LandSubmitUpdateCall }
	| { readonly operation: "graphite.branchChildren"; readonly request: LandBranchChildrenCall }
	| { readonly operation: "graphite.branchParent"; readonly request: LandBranchParentCall }
	| {
			readonly operation: "github.openPullRequestDependencies";
			readonly request: LandOpenPullRequestDependenciesCall;
	  };

type RecordInMemoryLandCall = (event: InMemoryLandCallEvent) => void;
const ignoreInMemoryLandCall: RecordInMemoryLandCall = () => {};

export interface InMemoryLandGitGatewayState {
	readonly repoRoot?: ValueState<string>;
	readonly currentBranch?: ValueState<string>;
	readonly workingTreeStatus?: ValueState<WorkingTreeStatus>;
	readonly localBranches?: readonly LocalBranchTip[];
	readonly branchContainsParents?: Readonly<Record<string, boolean>>;
	readonly shouldDefaultBranchContainParent?: boolean;
	readonly listLocalBranchesFailure?: LandingBoundaryFailure;
	readonly localBranchExistsFailures?: Readonly<Record<string, LandingBoundaryFailure>>;
	readonly localBranchShaFailures?: Readonly<Record<string, LandingBoundaryFailure>>;
	readonly snapshotBackupRefsFailure?: LandingBoundaryFailure;
	readonly checkoutBranchFailures?: Readonly<Record<string, LandingBoundaryFailure>>;
	readonly checkoutBranchReportedCurrentBranches?: Readonly<Record<string, string>>;
}

export interface LandRepoRootCall {
	readonly cwd: string;
}

export interface LandRepoCall {
	readonly repoRoot: string;
}

export interface LandBranchCall extends LandRepoCall {
	readonly branch: string;
}

export interface LandBranchContainsParentCall extends LandBranchCall {
	readonly parent: string;
}

export interface LandSnapshotBackupRefsCall extends LandRepoCall {
	readonly branches: readonly string[];
}

export class InMemoryLandGitGateway implements LandGitGateway {
	private readonly repoRootState: ValueState<string>;
	private currentBranchState: ValueState<string>;
	private readonly workingTreeStatusState: ValueState<WorkingTreeStatus>;
	private readonly branches: Map<string, string>;
	private readonly branchContainsParents: Map<string, boolean>;
	private readonly shouldDefaultBranchContainParent: boolean;
	private readonly listLocalBranchesFailure: LandingBoundaryFailure | undefined;
	private readonly localBranchExistsFailures: ReadonlyMap<string, LandingBoundaryFailure>;
	private readonly localBranchShaFailures: ReadonlyMap<string, LandingBoundaryFailure>;
	private readonly snapshotBackupRefsFailure: LandingBoundaryFailure | undefined;
	private readonly checkoutBranchFailures: ReadonlyMap<string, LandingBoundaryFailure>;
	private readonly checkoutBranchReportedCurrentBranches: ReadonlyMap<string, string>;
	private readonly resolveRepoRootLog: LandRepoRootCall[] = [];
	private readonly currentBranchLog: LandRepoCall[] = [];
	private readonly workingTreeStatusLog: LandRepoCall[] = [];
	private readonly localBranchExistsLog: LandBranchCall[] = [];
	private readonly localBranchShaLog: LandBranchCall[] = [];
	private readonly listLocalBranchesLog: LandRepoCall[] = [];
	private readonly branchContainsParentLog: LandBranchContainsParentCall[] = [];
	private readonly snapshotBackupRefsLog: LandSnapshotBackupRefsCall[] = [];
	private readonly checkoutBranchLog: LandBranchCall[] = [];
	private hasCheckedOutBranch = false;
	private readonly recordCall: RecordInMemoryLandCall;

	constructor(
		state: InMemoryLandGitGatewayState = {},
		recordCall: RecordInMemoryLandCall = ignoreInMemoryLandCall,
	) {
		this.recordCall = recordCall;
		this.repoRootState = state.repoRoot ?? "/repo";
		this.currentBranchState = state.currentBranch ?? "feature/current";
		this.workingTreeStatusState = state.workingTreeStatus ?? { isClean: true };
		this.branches = new Map((state.localBranches ?? []).map((branch) => [branch.name, branch.sha]));
		this.branchContainsParents = new Map(Object.entries(state.branchContainsParents ?? {}));
		this.shouldDefaultBranchContainParent = state.shouldDefaultBranchContainParent ?? true;
		this.listLocalBranchesFailure = cloneOptionalData(state.listLocalBranchesFailure);
		this.localBranchExistsFailures = new Map(
			Object.entries(state.localBranchExistsFailures ?? {}).map(([branch, failure]) => [
				branch,
				cloneData(failure),
			]),
		);
		this.localBranchShaFailures = new Map(
			Object.entries(state.localBranchShaFailures ?? {}).map(([branch, failure]) => [
				branch,
				cloneData(failure),
			]),
		);
		this.snapshotBackupRefsFailure = cloneOptionalData(state.snapshotBackupRefsFailure);
		this.checkoutBranchFailures = new Map(
			Object.entries(state.checkoutBranchFailures ?? {}).map(([branch, failure]) => [
				branch,
				cloneData(failure),
			]),
		);
		this.checkoutBranchReportedCurrentBranches = new Map(
			Object.entries(state.checkoutBranchReportedCurrentBranches ?? {}),
		);
	}

	get resolveRepoRootCalls(): readonly LandRepoRootCall[] {
		return cloneData(this.resolveRepoRootLog);
	}

	get currentBranchCalls(): readonly LandRepoCall[] {
		return cloneData(this.currentBranchLog);
	}

	get workingTreeStatusCalls(): readonly LandRepoCall[] {
		return cloneData(this.workingTreeStatusLog);
	}

	get localBranchExistsCalls(): readonly LandBranchCall[] {
		return cloneData(this.localBranchExistsLog);
	}

	get localBranchShaCalls(): readonly LandBranchCall[] {
		return cloneData(this.localBranchShaLog);
	}

	get listLocalBranchesCalls(): readonly LandRepoCall[] {
		return cloneData(this.listLocalBranchesLog);
	}

	get branchContainsParentCalls(): readonly LandBranchContainsParentCall[] {
		return cloneData(this.branchContainsParentLog);
	}

	get snapshotBackupRefsCalls(): readonly LandSnapshotBackupRefsCall[] {
		return cloneData(this.snapshotBackupRefsLog);
	}

	get checkoutBranchCalls(): readonly LandBranchCall[] {
		return cloneData(this.checkoutBranchLog);
	}

	/** Test-only local state transition: reposition a branch tip (e.g. a successful fake restack). */
	setLocalBranchSha(branch: string, sha: string): void {
		this.branches.set(branch, sha);
	}

	/** Test-only local state transition: record whether `branch` now contains `parent`. */
	setBranchContainsParent(branch: string, parent: string, contains: boolean): void {
		this.branchContainsParents.set(branchPairKey(branch, parent), contains);
	}

	async resolveRepoRoot(request: { readonly cwd: string }): Promise<LandResult<string>> {
		this.resolveRepoRootLog.push({ cwd: request.cwd });
		return valueResult({
			state: this.repoRootState,
			source: "git",
			phase: "repo-discovery",
			code: "repo_root_failed",
			message: "Could not resolve git repository root.",
		});
	}

	async currentBranch(request: { readonly repoRoot: string }): Promise<LandResult<string>> {
		const call = { repoRoot: request.repoRoot };
		this.currentBranchLog.push(call);
		if (this.hasCheckedOutBranch)
			this.recordCall({ operation: "git.currentBranch", request: call });
		return valueResult({
			state: this.currentBranchState,
			source: "git",
			phase: "repo-discovery",
			code: "current_branch_failed",
			message: "Could not resolve current branch.",
		});
	}

	async workingTreeStatus(request: {
		readonly repoRoot: string;
	}): Promise<LandResult<WorkingTreeStatus>> {
		this.workingTreeStatusLog.push({ repoRoot: request.repoRoot });
		return valueResult({
			state: this.workingTreeStatusState,
			source: "git",
			phase: "preflight",
			code: "working_tree_status_failed",
			message: "Could not read working tree status.",
			copyValue: cloneData,
		});
	}

	async localBranchExists(request: {
		readonly repoRoot: string;
		readonly branch: string;
	}): Promise<LandOutcome> {
		this.localBranchExistsLog.push({ repoRoot: request.repoRoot, branch: request.branch });
		const failure = this.localBranchExistsFailures.get(request.branch);
		if (failure !== undefined) return { type: "failure", failure: cloneData(failure) };
		if (!this.branches.has(request.branch)) {
			return {
				type: "failure",
				failure: {
					type: "domain",
					phase: "preflight",
					reason: "local-branch-missing",
					message: `Local branch '${request.branch}' does not exist.`,
					failedBranch: request.branch,
				},
			};
		}
		return { type: "completed" };
	}

	async localBranchSha(request: {
		readonly repoRoot: string;
		readonly branch: string;
	}): Promise<LandResult<string>> {
		const call = { repoRoot: request.repoRoot, branch: request.branch };
		this.localBranchShaLog.push(call);
		this.recordCall({ operation: "git.localBranchSha", request: call });
		const failure = this.localBranchShaFailures.get(request.branch);
		if (failure !== undefined) return { type: "failure", failure: cloneData(failure) };
		const sha = this.branches.get(request.branch);
		if (sha === undefined) {
			return {
				type: "failure",
				failure: boundaryFailure({
					source: "git",
					phase: "preflight",
					code: "local_branch_sha_missing",
					message: `Could not resolve sha for '${request.branch}'.`,
				}),
			};
		}
		return { type: "success", value: sha };
	}

	async listLocalBranches(request: {
		readonly repoRoot: string;
	}): Promise<LandResult<readonly LocalBranchTip[]>> {
		this.listLocalBranchesLog.push({ repoRoot: request.repoRoot });
		if (this.listLocalBranchesFailure !== undefined) {
			return { type: "failure", failure: cloneData(this.listLocalBranchesFailure) };
		}
		return {
			type: "success",
			value: [...this.branches].map(([name, sha]) => ({ name, sha })),
		};
	}

	async branchContainsParent(request: {
		readonly repoRoot: string;
		readonly branch: string;
		readonly parent: string;
	}): Promise<LandResult<boolean>> {
		this.branchContainsParentLog.push({
			repoRoot: request.repoRoot,
			branch: request.branch,
			parent: request.parent,
		});
		return {
			type: "success",
			value:
				this.branchContainsParents.get(branchPairKey(request.branch, request.parent)) ??
				this.shouldDefaultBranchContainParent,
		};
	}

	async checkoutBranch(request: {
		readonly repoRoot: string;
		readonly branch: string;
	}): Promise<LandOutcome> {
		const call = { repoRoot: request.repoRoot, branch: request.branch };
		this.checkoutBranchLog.push(call);
		this.recordCall({ operation: "git.checkoutBranch", request: call });
		const failure = this.checkoutBranchFailures.get(request.branch);
		if (failure !== undefined) return { type: "failure", failure: cloneData(failure) };
		this.hasCheckedOutBranch = true;
		if (
			!(typeof this.currentBranchState === "object" && this.currentBranchState.type === "failure")
		) {
			this.currentBranchState =
				this.checkoutBranchReportedCurrentBranches.get(request.branch) ?? request.branch;
		}
		return { type: "completed" };
	}

	async snapshotBackupRefs(request: {
		readonly repoRoot: string;
		readonly branches: readonly string[];
	}): Promise<LandResult<ReadonlyMap<string, string>>> {
		const call = {
			repoRoot: request.repoRoot,
			branches: [...request.branches],
		};
		this.snapshotBackupRefsLog.push(call);
		this.recordCall({ operation: "git.snapshotBackupRefs", request: call });
		if (this.snapshotBackupRefsFailure !== undefined) {
			return { type: "failure", failure: cloneData(this.snapshotBackupRefsFailure) };
		}

		const shas = new Map<string, string>();
		for (const branch of request.branches) {
			const sha = this.branches.get(branch);
			if (sha === undefined) {
				return {
					type: "failure",
					failure: boundaryFailure({
						source: "git",
						phase: "merge",
						code: "backup_ref_snapshot_branch_failed",
						message: `Could not snapshot local branch ${branch} for pre-land backup refs; no PRs were landed.`,
					}),
				};
			}
			shas.set(branch, sha);
		}
		return { type: "success", value: shas };
	}
}

export interface InMemoryLandGraphiteGatewayState {
	readonly trunk?: ValueState<string>;
	readonly metadataDbPath?: ValueState<string>;
	readonly stackShape?: ValueState<StackSnapshot>;
	readonly submitUpdateResults?: Readonly<Record<string, OperationState>>;
	readonly restackForSubmitResults?: Readonly<Record<string, OperationState>>;
	readonly restackResults?: Readonly<Record<string, OperationState>>;
	readonly refreshBranchFromRemoteResults?: Readonly<
		Record<string, LandGraphiteRefreshBranchResult>
	>;
	readonly deleteLocalBranchResults?: Readonly<Record<string, InMemoryLandDeleteLocalBranchResult>>;
	readonly branchChildren?: Readonly<Record<string, readonly string[]>>;
	readonly branchChildrenFailure?: LandingBoundaryFailure;
	readonly branchParents?: Readonly<Record<string, string>>;
	readonly branchParentFailure?: LandingBoundaryFailure;
}

/** Cross-gateway state transitions applied when a fake Graphite mutation succeeds. */
export interface InMemoryLandGraphiteMutationHooks {
	readonly onRestackSuccess?: (branch: string, scope: LandGraphiteRestackScope) => void;
	readonly onSubmitUpdateSuccess?: (branch: string) => void;
}

export interface LandStackShapeCall extends LandRepoCall {
	readonly metadataDbPath: string;
	readonly current: string;
	readonly trunk: string;
	readonly liveLocalBranches: readonly string[];
}

export interface LandRefreshBranchFromRemoteCall extends LandBranchCall {
	readonly checkedOutConflictHandling: "fail" | "defer";
}

export interface LandDeleteLocalBranchCall extends LandBranchCall {
	readonly checkedOutConflictHandling: "fail" | "retain";
}

export interface LandSubmitUpdateCall extends LandBranchCall {
	readonly force: boolean;
}

export interface LandRestackCall extends LandBranchCall {
	readonly scope: LandGraphiteRestackScope;
}

export interface LandBranchChildrenCall extends LandBranchCall {
	readonly metadataDbPath: string;
}

export interface LandBranchParentCall extends LandBranchCall {
	readonly metadataDbPath: string;
}

export interface LandOpenPullRequestDependenciesCall extends LandRepoCall {
	readonly targets: readonly LandingBranchDependencyTarget[];
}

export class InMemoryLandGraphiteGateway implements LandGraphiteGateway {
	private readonly trunkState: ValueState<string>;
	private readonly metadataDbPathState: ValueState<string>;
	private readonly stackShapeState: ValueState<StackSnapshot>;
	private readonly submitUpdateResults: ReadonlyMap<string, OperationState>;
	private readonly restackForSubmitResults: ReadonlyMap<string, OperationState>;
	private readonly restackResults: ReadonlyMap<string, OperationState>;
	private readonly refreshBranchFromRemoteResults: ReadonlyMap<
		string,
		LandGraphiteRefreshBranchResult
	>;
	private readonly deleteLocalBranchResults: ReadonlyMap<
		string,
		InMemoryLandDeleteLocalBranchResult
	>;
	private readonly branchChildrenByBranch: ReadonlyMap<string, readonly string[]>;
	private readonly branchChildrenFailure: LandingBoundaryFailure | undefined;
	private readonly branchParents: Map<string, string>;
	private readonly branchParentFailure: LandingBoundaryFailure | undefined;
	private readonly hooks: InMemoryLandGraphiteMutationHooks;
	private readonly trunkLog: LandRepoCall[] = [];
	private readonly metadataDbPathLog: LandRepoCall[] = [];
	private readonly stackShapeLog: LandStackShapeCall[] = [];
	private readonly prepareSubmitUpdateLog: LandBranchCall[] = [];
	private readonly prepareRestackForSubmitLog: LandBranchCall[] = [];
	private readonly refreshBranchFromRemoteLog: LandRefreshBranchFromRemoteCall[] = [];
	private readonly deleteLocalBranchLog: LandDeleteLocalBranchCall[] = [];
	private readonly restackLog: LandRestackCall[] = [];
	private readonly submitUpdateLog: LandSubmitUpdateCall[] = [];
	private readonly branchChildrenLog: LandBranchChildrenCall[] = [];
	private readonly branchParentLog: LandBranchParentCall[] = [];
	private readonly recordCall: RecordInMemoryLandCall;

	constructor(
		state: InMemoryLandGraphiteGatewayState = {},
		recordCall: RecordInMemoryLandCall = ignoreInMemoryLandCall,
		hooks: InMemoryLandGraphiteMutationHooks = {},
	) {
		this.recordCall = recordCall;
		this.hooks = hooks;
		this.trunkState = state.trunk ?? "main";
		this.metadataDbPathState = state.metadataDbPath ?? "/repo/.git/graphite.db";
		this.stackShapeState = copyValueState(state.stackShape ?? stackSnapshot(), cloneData);
		this.submitUpdateResults = new Map(
			Object.entries(state.submitUpdateResults ?? {}).map(([branch, result]) => [
				branch,
				cloneData(result),
			]),
		);
		this.restackForSubmitResults = new Map(
			Object.entries(state.restackForSubmitResults ?? {}).map(([branch, result]) => [
				branch,
				cloneData(result),
			]),
		);
		this.restackResults = new Map(
			Object.entries(state.restackResults ?? {}).map(([key, result]) => [key, cloneData(result)]),
		);
		this.refreshBranchFromRemoteResults = new Map(
			Object.entries(state.refreshBranchFromRemoteResults ?? {}).map(([branch, result]) => [
				branch,
				cloneData(result),
			]),
		);
		this.deleteLocalBranchResults = new Map(
			Object.entries(state.deleteLocalBranchResults ?? {}).map(([branch, result]) => [
				branch,
				cloneData(result),
			]),
		);
		this.branchChildrenByBranch = new Map(
			Object.entries(state.branchChildren ?? {}).map(([branch, children]) => [
				branch,
				[...children],
			]),
		);
		this.branchChildrenFailure = cloneOptionalData(state.branchChildrenFailure);
		this.branchParents = new Map(Object.entries(state.branchParents ?? {}));
		this.branchParentFailure = cloneOptionalData(state.branchParentFailure);
	}

	/** Test-only provider-topology state transition (e.g. a successful fake restack/reparent). */
	setBranchParent(branch: string, parent: string): void {
		this.branchParents.set(branch, parent);
	}

	get trunkCalls(): readonly LandRepoCall[] {
		return cloneData(this.trunkLog);
	}

	get metadataDbPathCalls(): readonly LandRepoCall[] {
		return cloneData(this.metadataDbPathLog);
	}

	get stackShapeCalls(): readonly LandStackShapeCall[] {
		return cloneData(this.stackShapeLog);
	}

	get prepareSubmitUpdateCalls(): readonly LandBranchCall[] {
		return cloneData(this.prepareSubmitUpdateLog);
	}

	get prepareRestackForSubmitCalls(): readonly LandBranchCall[] {
		return cloneData(this.prepareRestackForSubmitLog);
	}

	get refreshBranchFromRemoteCalls(): readonly LandRefreshBranchFromRemoteCall[] {
		return cloneData(this.refreshBranchFromRemoteLog);
	}

	get deleteLocalBranchCalls(): readonly LandDeleteLocalBranchCall[] {
		return cloneData(this.deleteLocalBranchLog);
	}

	get restackCalls(): readonly LandRestackCall[] {
		return cloneData(this.restackLog);
	}

	get submitUpdateCalls(): readonly LandSubmitUpdateCall[] {
		return cloneData(this.submitUpdateLog);
	}

	get branchChildrenCalls(): readonly LandBranchChildrenCall[] {
		return cloneData(this.branchChildrenLog);
	}

	get branchParentCalls(): readonly LandBranchParentCall[] {
		return cloneData(this.branchParentLog);
	}

	async trunk(request: { readonly repoRoot: string }): Promise<LandResult<string>> {
		this.trunkLog.push({ repoRoot: request.repoRoot });
		return valueResult({
			state: this.trunkState,
			source: "graphite",
			phase: "repo-discovery",
			code: "trunk_failed",
			message: "Could not resolve Graphite trunk.",
		});
	}

	async metadataDbPath(request: { readonly repoRoot: string }): Promise<LandResult<string>> {
		this.metadataDbPathLog.push({ repoRoot: request.repoRoot });
		return valueResult({
			state: this.metadataDbPathState,
			source: "graphite",
			phase: "repo-discovery",
			code: "metadata_db_failed",
			message: "Could not resolve Graphite metadata DB path.",
		});
	}

	async stackShape(request: {
		readonly repoRoot: string;
		readonly metadataDbPath: string;
		readonly current: string;
		readonly trunk: string;
		readonly liveLocalBranches: readonly string[];
	}): Promise<LandResult<StackSnapshot>> {
		this.stackShapeLog.push({
			repoRoot: request.repoRoot,
			metadataDbPath: request.metadataDbPath,
			current: request.current,
			trunk: request.trunk,
			liveLocalBranches: [...request.liveLocalBranches],
		});
		return valueResult({
			state: this.stackShapeState,
			source: "graphite",
			phase: "stack-shape",
			code: "stack_shape_failed",
			message: "Could not inspect stack shape.",
			copyValue: cloneData,
		});
	}

	async prepareSubmitUpdate(request: {
		readonly repoRoot: string;
		readonly branch: string;
	}): Promise<LandOutcome> {
		this.prepareSubmitUpdateLog.push({ repoRoot: request.repoRoot, branch: request.branch });
		return operationOutcome(this.submitUpdateResults.get(request.branch));
	}

	async prepareRestackForSubmit(request: {
		readonly repoRoot: string;
		readonly branch: string;
	}): Promise<LandOutcome> {
		this.prepareRestackForSubmitLog.push({ repoRoot: request.repoRoot, branch: request.branch });
		return operationOutcome(this.restackForSubmitResults.get(request.branch));
	}

	async refreshBranchFromRemote(request: {
		readonly repoRoot: string;
		readonly branch: string;
		readonly checkedOutConflictHandling: "fail" | "defer";
	}): Promise<LandGraphiteRefreshBranchResult> {
		const call = {
			repoRoot: request.repoRoot,
			branch: request.branch,
			checkedOutConflictHandling: request.checkedOutConflictHandling,
		};
		this.refreshBranchFromRemoteLog.push(call);
		this.recordCall({ operation: "graphite.refreshBranchFromRemote", request: call });
		return cloneData(
			this.refreshBranchFromRemoteResults.get(request.branch) ?? {
				type: "success",
				result: emptyExecResult(),
			},
		);
	}

	async deleteLocalBranch(request: {
		readonly repoRoot: string;
		readonly branch: string;
		readonly checkedOutConflictHandling: "fail" | "retain";
	}): Promise<LandGraphiteDeleteLocalBranchResult> {
		const call = {
			repoRoot: request.repoRoot,
			branch: request.branch,
			checkedOutConflictHandling: request.checkedOutConflictHandling,
		};
		this.deleteLocalBranchLog.push(call);
		this.recordCall({ operation: "graphite.deleteLocalBranch", request: call });
		const result = this.deleteLocalBranchResults.get(request.branch);
		return result === undefined ? { type: "deleted" } : cloneData(result);
	}

	async restack(request: {
		readonly repoRoot: string;
		readonly branch: string;
		readonly scope: LandGraphiteRestackScope;
	}): Promise<LandGraphiteCommandResult> {
		const call = {
			repoRoot: request.repoRoot,
			branch: request.branch,
			scope: request.scope,
		};
		this.restackLog.push(call);
		this.recordCall({ operation: "graphite.restack", request: call });
		const result = commandResult(
			this.restackResults.get(restackResultKey(request.branch, request.scope)),
		);
		if (result.type === "success") {
			this.hooks.onRestackSuccess?.(request.branch, request.scope);
		}
		return result;
	}

	async submitUpdate(request: {
		readonly repoRoot: string;
		readonly branch: string;
		readonly force: boolean;
	}): Promise<LandGraphiteCommandResult> {
		const call = {
			repoRoot: request.repoRoot,
			branch: request.branch,
			force: request.force,
		};
		this.submitUpdateLog.push(call);
		this.recordCall({ operation: "graphite.submitUpdate", request: call });
		const result = commandResult(this.submitUpdateResults.get(request.branch));
		if (result.type === "success") {
			this.hooks.onSubmitUpdateSuccess?.(request.branch);
		}
		return result;
	}

	async branchChildren(request: {
		readonly repoRoot: string;
		readonly metadataDbPath: string;
		readonly branch: string;
	}): Promise<LandResult<readonly string[]>> {
		const call = {
			repoRoot: request.repoRoot,
			metadataDbPath: request.metadataDbPath,
			branch: request.branch,
		};
		this.branchChildrenLog.push(call);
		this.recordCall({ operation: "graphite.branchChildren", request: call });
		if (this.branchChildrenFailure !== undefined) {
			return { type: "failure", failure: cloneData(this.branchChildrenFailure) };
		}
		return { type: "success", value: [...(this.branchChildrenByBranch.get(request.branch) ?? [])] };
	}

	async branchParent(request: {
		readonly repoRoot: string;
		readonly metadataDbPath: string;
		readonly branch: string;
	}): Promise<LandResult<string | undefined>> {
		const call = {
			repoRoot: request.repoRoot,
			metadataDbPath: request.metadataDbPath,
			branch: request.branch,
		};
		this.branchParentLog.push(call);
		this.recordCall({ operation: "graphite.branchParent", request: call });
		if (this.branchParentFailure !== undefined) {
			return { type: "failure", failure: cloneData(this.branchParentFailure) };
		}
		return { type: "success", value: this.branchParents.get(request.branch) };
	}
}

export interface InMemoryLandGithubPrGatewayState {
	readonly pullRequests?: readonly PullRequestFacts[];
	readonly failures?: Readonly<Record<string, LandingBoundaryFailure>>;
	readonly squashMergeResults?: Readonly<Record<string, ValueState<SquashMergePullRequestResult>>>;
	/** Facts (or load failure) returned after a successful merge, keyed by PR number. */
	readonly postMergeFacts?: Readonly<Record<string, ValueState<PullRequestFacts>>>;
	/** Open-PR dependency facts visible to the complete remote dependency scan. */
	readonly openPullRequestDependencies?: readonly PullRequestDependencyFacts[];
	readonly openPullRequestDependenciesFailure?: LandingBoundaryFailure;
}

export interface LandPullRequestFactsCall extends LandRepoCall {
	readonly branchOrNumber: string;
}

export interface LandSquashMergePullRequestCall extends LandRepoCall {
	readonly pullRequest: PullRequestFacts;
}

export class InMemoryLandGithubPrGateway implements LandGithubPrGateway {
	private readonly pullRequests: Map<string, PullRequestFacts>;
	private readonly failures: ReadonlyMap<string, LandingBoundaryFailure>;
	private readonly squashMergeResults: ReadonlyMap<
		string,
		ValueState<SquashMergePullRequestResult>
	>;
	private readonly postMergeFacts: ReadonlyMap<string, ValueState<PullRequestFacts>>;
	private readonly dependencyFacts: PullRequestDependencyFacts[];
	private readonly openPullRequestDependenciesFailure: LandingBoundaryFailure | undefined;
	private readonly mergedPullRequestNumbers = new Set<string>();
	private readonly pullRequestFactsLog: LandPullRequestFactsCall[] = [];
	private readonly squashMergePullRequestLog: LandSquashMergePullRequestCall[] = [];
	private readonly openPullRequestDependenciesLog: LandOpenPullRequestDependenciesCall[] = [];
	private readonly recordCall: RecordInMemoryLandCall;

	constructor(
		state: InMemoryLandGithubPrGatewayState = {},
		recordCall: RecordInMemoryLandCall = ignoreInMemoryLandCall,
	) {
		this.recordCall = recordCall;
		const entries: [string, PullRequestFacts][] = [];
		for (const pr of state.pullRequests ?? []) {
			const copied = cloneData(pr);
			entries.push([copied.headRefName, copied], [String(copied.number), copied]);
		}
		this.pullRequests = new Map(entries);
		this.failures = new Map(
			Object.entries(state.failures ?? {}).map(([key, failure]) => [key, cloneData(failure)]),
		);
		this.squashMergeResults = new Map(
			Object.entries(state.squashMergeResults ?? {}).map(([key, result]) => [
				key,
				copyValueState(result, cloneData),
			]),
		);
		this.postMergeFacts = new Map(
			Object.entries(state.postMergeFacts ?? {}).map(([key, facts]) => [
				key,
				copyValueState(facts, cloneData),
			]),
		);
		this.dependencyFacts = cloneData([...(state.openPullRequestDependencies ?? [])]);
		this.openPullRequestDependenciesFailure = cloneOptionalData(
			state.openPullRequestDependenciesFailure,
		);
	}

	/** Test-only remote state transition: overwrite stored PR facts (e.g. a successful fake submit). */
	updatePullRequest(branchOrNumber: string, overrides: Partial<PullRequestFacts>): void {
		const existing = this.pullRequests.get(branchOrNumber);
		if (existing === undefined) {
			throw new Error(`No in-memory pull request registered for '${branchOrNumber}'.`);
		}
		const updated = { ...existing, ...cloneData(overrides) };
		this.pullRequests.set(updated.headRefName, updated);
		this.pullRequests.set(String(updated.number), updated);
	}

	get pullRequestFactsCalls(): readonly LandPullRequestFactsCall[] {
		return cloneData(this.pullRequestFactsLog);
	}

	get squashMergePullRequestCalls(): readonly LandSquashMergePullRequestCall[] {
		return cloneData(this.squashMergePullRequestLog);
	}

	get openPullRequestDependenciesCalls(): readonly LandOpenPullRequestDependenciesCall[] {
		return cloneData(this.openPullRequestDependenciesLog);
	}

	async openPullRequestDependencies(request: {
		readonly repoRoot: string;
		readonly targets: readonly LandingBranchDependencyTarget[];
	}): Promise<LandResult<readonly PullRequestDependencyFacts[]>> {
		const call = { repoRoot: request.repoRoot, targets: cloneData(request.targets) };
		this.openPullRequestDependenciesLog.push(call);
		this.recordCall({ operation: "github.openPullRequestDependencies", request: call });
		if (this.openPullRequestDependenciesFailure !== undefined) {
			return { type: "failure", failure: cloneData(this.openPullRequestDependenciesFailure) };
		}
		return {
			type: "success",
			value: cloneData(
				this.dependencyFacts.filter((dependent) => {
					const target = request.targets.find(
						(candidate) => candidate.branch === dependent.baseRefName,
					);
					return target?.headOids.includes(dependent.baseRefOid) ?? false;
				}),
			),
		};
	}

	async pullRequestFacts(request: {
		readonly repoRoot: string;
		readonly branchOrNumber: string;
	}): Promise<LandResult<PullRequestFacts>> {
		const call = {
			repoRoot: request.repoRoot,
			branchOrNumber: request.branchOrNumber,
		};
		this.pullRequestFactsLog.push(call);
		this.recordCall({ operation: "github.pullRequestFacts", request: call });
		const failure = this.failures.get(request.branchOrNumber);
		if (failure !== undefined) return { type: "failure", failure: cloneData(failure) };
		if (this.mergedPullRequestNumbers.has(request.branchOrNumber)) {
			const postMergeFacts = this.postMergeFacts.get(request.branchOrNumber);
			if (postMergeFacts !== undefined) {
				return valueResult({
					state: postMergeFacts,
					source: "github",
					phase: "merge",
					code: "post_merge_facts_failed",
					message: `Could not load post-merge facts for PR #${request.branchOrNumber}.`,
					copyValue: cloneData,
				});
			}
		}
		const pr = this.pullRequests.get(request.branchOrNumber);
		if (pr === undefined) {
			return {
				type: "failure",
				failure: boundaryFailure({
					source: "github",
					phase: "preflight",
					code: "pull_request_missing",
					message: `No pull request found for '${request.branchOrNumber}'.`,
				}),
			};
		}
		const returned =
			this.mergedPullRequestNumbers.has(String(pr.number)) &&
			this.postMergeFacts.get(String(pr.number)) === undefined
				? { ...pr, state: "MERGED", mergedAt: pr.mergedAt ?? "in-memory-merge" }
				: pr;
		return { type: "success", value: cloneData(returned) };
	}

	async squashMergePullRequest(request: {
		readonly repoRoot: string;
		readonly pullRequest: PullRequestFacts;
	}): Promise<LandResult<SquashMergePullRequestResult>> {
		const call = {
			repoRoot: request.repoRoot,
			pullRequest: cloneData(request.pullRequest),
		};
		this.squashMergePullRequestLog.push(call);
		this.recordCall({ operation: "github.squashMergePullRequest", request: call });
		const pullRequestNumber = String(request.pullRequest.number);
		const result = valueResult({
			state: this.squashMergeResults.get(pullRequestNumber) ?? {
				stdout: "",
				stderr: "",
			},
			source: "github",
			phase: "merge",
			code: "squash_merge_failed",
			message: "Squash merge failed.",
			copyValue: cloneData,
		});
		if (result.type === "success") this.mergedPullRequestNumbers.add(pullRequestNumber);
		return result;
	}
}

export interface InMemoryLandWorktreeSlotFactsGatewayState {
	readonly worktrees?: readonly WorktreeEntry[];
	readonly classifications?: Readonly<Record<string, WorktreeClassification>>;
	readonly worktreesFailure?: LandingBoundaryFailure;
	readonly classifyFailures?: Readonly<Record<string, LandingBoundaryFailure>>;
	readonly freeSlotsFailure?: LandingBoundaryFailure;
	/** Paths that remain in the worktree list after a successful slot-free operation. */
	readonly residualCheckoutPaths?: readonly string[];
}

export interface LandClassifyWorktreeCall extends LandRepoCall {
	readonly path: string;
	readonly branch?: string;
}

export interface LandFreeSlotsCall extends LandRepoCall {
	readonly slots: readonly ManagedSlotWorktree[];
}

export class InMemoryLandWorktreeSlotFactsGateway implements LandWorktreeSlotFactsGateway {
	private worktreeEntries: WorktreeEntry[];
	private readonly classifications: ReadonlyMap<string, WorktreeClassification>;
	private readonly worktreesFailure: LandingBoundaryFailure | undefined;
	private readonly classifyFailures: ReadonlyMap<string, LandingBoundaryFailure>;
	private readonly freeSlotsFailure: LandingBoundaryFailure | undefined;
	private readonly residualCheckoutPaths: ReadonlySet<string>;
	private readonly worktreesLog: LandRepoCall[] = [];
	private readonly classifyWorktreeLog: LandClassifyWorktreeCall[] = [];
	private readonly freeSlotsLog: LandFreeSlotsCall[] = [];

	constructor(state: InMemoryLandWorktreeSlotFactsGatewayState = {}) {
		this.worktreeEntries = cloneData([...(state.worktrees ?? [])]);
		this.classifications = new Map(
			Object.entries(state.classifications ?? {}).map(([path, classification]) => [
				path,
				cloneData(classification),
			]),
		);
		this.worktreesFailure = cloneOptionalData(state.worktreesFailure);
		this.freeSlotsFailure = cloneOptionalData(state.freeSlotsFailure);
		this.residualCheckoutPaths = new Set(state.residualCheckoutPaths ?? []);
		this.classifyFailures = new Map(
			Object.entries(state.classifyFailures ?? {}).map(([path, failure]) => [
				path,
				cloneData(failure),
			]),
		);
	}

	get worktreesCalls(): readonly LandRepoCall[] {
		return cloneData(this.worktreesLog);
	}

	get classifyWorktreeCalls(): readonly LandClassifyWorktreeCall[] {
		return cloneData(this.classifyWorktreeLog);
	}

	get freeSlotsCalls(): readonly LandFreeSlotsCall[] {
		return cloneData(this.freeSlotsLog);
	}

	async worktrees(request: {
		readonly repoRoot: string;
	}): Promise<LandResult<readonly WorktreeEntry[]>> {
		this.worktreesLog.push({ repoRoot: request.repoRoot });
		if (this.worktreesFailure !== undefined)
			return { type: "failure", failure: cloneData(this.worktreesFailure) };
		return { type: "success", value: cloneData(this.worktreeEntries) };
	}

	async classifyWorktree(request: {
		readonly repoRoot: string;
		readonly path: string;
		readonly branch?: string;
	}): Promise<LandResult<WorktreeClassification>> {
		this.classifyWorktreeLog.push({
			repoRoot: request.repoRoot,
			path: request.path,
			...(request.branch === undefined ? {} : { branch: request.branch }),
		});
		const failure = this.classifyFailures.get(request.path);
		if (failure !== undefined) return { type: "failure", failure: cloneData(failure) };
		return {
			type: "success",
			value: cloneData(this.classifications.get(request.path) ?? { type: "manual-worktree" }),
		};
	}

	async freeSlots(request: {
		readonly repoRoot: string;
		readonly slots: readonly ManagedSlotWorktree[];
	}): Promise<LandResult<readonly ManagedSlotWorktree[]>> {
		this.freeSlotsLog.push({
			repoRoot: request.repoRoot,
			slots: cloneData(request.slots),
		});
		if (this.freeSlotsFailure !== undefined)
			return { type: "failure", failure: cloneData(this.freeSlotsFailure) };
		const freedPaths = new Set(request.slots.map((slot) => slot.path));
		this.worktreeEntries = this.worktreeEntries.filter(
			(worktree) => !freedPaths.has(worktree.path) || this.residualCheckoutPaths.has(worktree.path),
		);
		return { type: "success", value: cloneData(request.slots) };
	}
}

export interface InMemoryLandContextState {
	readonly git?: InMemoryLandGitGatewayState;
	readonly graphite?: InMemoryLandGraphiteGatewayState;
	readonly github?: InMemoryLandGithubPrGatewayState;
	readonly worktrees?: InMemoryLandWorktreeSlotFactsGatewayState;
	/**
	 * Declarative cross-gateway state transitions for reconciliation tests. Postcondition tests
	 * need restack/submit success to actually move local ancestry, provider topology, and remote
	 * PR facts; statically successful fakes would reproduce the command-trust bug in tests.
	 */
	readonly transitions?: InMemoryLandReconciliationTransitions;
}

export interface InMemoryLandReconciliationTransitions {
	readonly onRestackSuccess?: Readonly<Record<string, InMemoryLandRestackTransition>>;
	readonly onSubmitUpdateSuccess?: Readonly<Record<string, InMemoryLandSubmitTransition>>;
}

export interface InMemoryLandRestackTransition {
	/** New local branch tip after the successful restack. */
	readonly localSha?: string;
	/** Ancestry facts after the restack, keyed by parent branch. */
	readonly containsParents?: Readonly<Record<string, boolean>>;
	/** Provider-reported parent after the restack. */
	readonly providerParent?: string;
}

export interface InMemoryLandSubmitTransition {
	/** Remote PR head OID after the successful submit. */
	readonly headRefOid?: string;
	/** Remote PR base ref after the successful submit. */
	readonly baseRefName?: string;
}

export interface InMemoryLandContext {
	readonly context: LandContext;
	readonly git: InMemoryLandGitGateway;
	readonly graphite: InMemoryLandGraphiteGateway;
	readonly github: InMemoryLandGithubPrGateway;
	readonly worktrees: InMemoryLandWorktreeSlotFactsGateway;
	/** Testing-only, clone-on-read ordering view across semantic gateway calls. */
	readonly callEvents: readonly InMemoryLandCallEvent[];
}

export function createInMemoryLandContext(
	state: InMemoryLandContextState = {},
): InMemoryLandContext {
	const callEvents: InMemoryLandCallEvent[] = [];
	const recordCall: RecordInMemoryLandCall = (event) => callEvents.push(cloneData(event));
	const git = new InMemoryLandGitGateway(state.git, recordCall);
	const github = new InMemoryLandGithubPrGateway(state.github, recordCall);
	const transitions = state.transitions ?? {};
	let graphiteRef: InMemoryLandGraphiteGateway | undefined;
	const hooks: InMemoryLandGraphiteMutationHooks = {
		onRestackSuccess: (branch) => {
			const transition = transitions.onRestackSuccess?.[branch];
			if (transition === undefined) return;
			if (transition.localSha !== undefined) git.setLocalBranchSha(branch, transition.localSha);
			for (const [parent, contains] of Object.entries(transition.containsParents ?? {})) {
				git.setBranchContainsParent(branch, parent, contains);
			}
			if (transition.providerParent !== undefined) {
				graphiteRef?.setBranchParent(branch, transition.providerParent);
			}
		},
		onSubmitUpdateSuccess: (branch) => {
			const transition = transitions.onSubmitUpdateSuccess?.[branch];
			if (transition === undefined) return;
			github.updatePullRequest(branch, {
				...(transition.headRefOid === undefined ? {} : { headRefOid: transition.headRefOid }),
				...(transition.baseRefName === undefined ? {} : { baseRefName: transition.baseRefName }),
			});
		},
	};
	const graphite = new InMemoryLandGraphiteGateway(state.graphite, recordCall, hooks);
	graphiteRef = graphite;
	const worktrees = new InMemoryLandWorktreeSlotFactsGateway(state.worktrees);
	return {
		context: { git, graphite, github, worktrees },
		git,
		graphite,
		github,
		worktrees,
		get callEvents() {
			return cloneData(callEvents);
		},
	};
}

export function pullRequestFacts(overrides: Partial<PullRequestFacts> = {}): PullRequestFacts {
	const number = overrides.number ?? 1;
	const branch = overrides.headRefName ?? "feature/current";
	return {
		id: overrides.id ?? `PR_node_${number}`,
		number,
		title: overrides.title ?? `PR ${number}`,
		body: overrides.body ?? null,
		state: overrides.state ?? "OPEN",
		isDraft: overrides.isDraft ?? false,
		headRefName: branch,
		baseRefName: overrides.baseRefName ?? "main",
		headRefOid: overrides.headRefOid ?? "1111111111111111111111111111111111111111",
		...(overrides.mergeStateStatus === undefined
			? {}
			: { mergeStateStatus: overrides.mergeStateStatus }),
		...(overrides.url === undefined ? {} : { url: overrides.url }),
		...(overrides.mergedAt === undefined ? {} : { mergedAt: overrides.mergedAt }),
	};
}

export function stackSnapshot(overrides: Partial<StackSnapshot> = {}): StackSnapshot {
	return {
		trunk: overrides.trunk ?? "main",
		current: overrides.current ?? "feature/current",
		actualCurrentBranch: overrides.actualCurrentBranch ?? overrides.current ?? "feature/current",
		landingTargetBranch: overrides.landingTargetBranch ?? overrides.current ?? "feature/current",
		landingBranches: [...(overrides.landingBranches ?? [overrides.current ?? "feature/current"])],
		remainingLandingBranches: [...(overrides.remainingLandingBranches ?? [])],
		descendantBranches: [...(overrides.descendantBranches ?? [])],
		descendantRootBranches: [...(overrides.descendantRootBranches ?? [])],
		warnings: (overrides.warnings ?? []).map((warning) => ({ ...warning })),
	};
}

interface ValueResultOptions<T> {
	readonly state: ValueState<T>;
	readonly source: LandingBoundaryFailure["source"];
	readonly phase: LandingBoundaryFailure["phase"];
	readonly code: string;
	readonly message: string;
	readonly copyValue?: (value: T) => T;
}

function valueResult<T>(options: ValueResultOptions<T>): LandResult<T> {
	const copyValue = options.copyValue ?? cloneData;
	if (isFailureState(options.state)) {
		return {
			type: "failure",
			failure: cloneOptionalData(options.state.failure) ?? boundaryFailure(options),
		};
	}
	return { type: "success", value: copyValue(options.state) };
}

function operationOutcome(state: OperationState | undefined): LandOutcome {
	if (state === undefined || state.type === "success") return { type: "completed" };
	return {
		type: "failure",
		failure:
			cloneOptionalData(state.failure) ??
			boundaryFailure({
				source: "graphite",
				phase: "submit-preparation",
				code: "operation_failed",
				message: "Graphite preparation failed.",
			}),
	};
}

function commandResult(state: OperationState | undefined): LandGraphiteCommandResult {
	if (state === undefined || state.type === "success") {
		return { type: "success", result: emptyExecResult() };
	}
	return {
		type: "failure",
		commandDisplay: state.commandDisplay ?? "gt operation",
		result: cloneOptionalData(state.result) ?? emptyExecResult(1),
	};
}

function emptyExecResult(code = 0): ExecResult {
	return { type: "exited", stdout: "", stderr: "", code, signal: null };
}

function isFailureState<T>(state: ValueState<T>): state is FailureState {
	return typeof state === "object" && state !== null && "type" in state && state.type === "failure";
}

function cloneData<T>(value: T): T {
	return structuredClone(value);
}

function cloneOptionalData<T>(value: T | undefined): T | undefined {
	return value === undefined ? undefined : cloneData(value);
}

function copyValueState<T>(state: ValueState<T>, copyValue: (value: T) => T): ValueState<T> {
	if (isFailureState(state)) return cloneData(state);
	return copyValue(state);
}

function branchPairKey(branch: string, parent: string): string {
	return `${branch}|${parent}`;
}

function restackResultKey(branch: string, scope: LandGraphiteRestackScope): string {
	return `${scope}:${branch}`;
}

interface BoundaryFailureOptions {
	readonly source: LandingBoundaryFailure["source"];
	readonly phase: LandingBoundaryFailure["phase"];
	readonly code: string;
	readonly message: string;
}

function boundaryFailure(options: BoundaryFailureOptions): LandingBoundaryFailure {
	return {
		type: "boundary",
		source: options.source,
		phase: options.phase,
		code: options.code,
		message: options.message,
	};
}
