import type { ExecResult } from "@sdl/core/command";

import type {
	LandContext,
	LandingBoundaryFailure,
	LandGitGateway,
	LandGithubPrGateway,
	LandGraphiteCommandResult,
	LandGraphiteDeleteLocalBranchResult,
	LandGraphiteGateway,
	LandGraphiteRefreshBranchResult,
	LandOutcome,
	LandResult,
	LandWorktreeSlotFactsGateway,
	LocalBranchTip,
	ManagedSlotWorktree,
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
type OperationState = { readonly type: "success" } | FailureState;

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
	private readonly currentBranchState: ValueState<string>;
	private readonly workingTreeStatusState: ValueState<WorkingTreeStatus>;
	private readonly branches: ReadonlyMap<string, string>;
	private readonly branchContainsParents: ReadonlyMap<string, boolean>;
	private readonly shouldDefaultBranchContainParent: boolean;
	private readonly listLocalBranchesFailure: LandingBoundaryFailure | undefined;
	private readonly localBranchExistsFailures: ReadonlyMap<string, LandingBoundaryFailure>;
	private readonly localBranchShaFailures: ReadonlyMap<string, LandingBoundaryFailure>;
	private readonly snapshotBackupRefsFailure: LandingBoundaryFailure | undefined;
	private readonly resolveRepoRootLog: LandRepoRootCall[] = [];
	private readonly currentBranchLog: LandRepoCall[] = [];
	private readonly workingTreeStatusLog: LandRepoCall[] = [];
	private readonly localBranchExistsLog: LandBranchCall[] = [];
	private readonly localBranchShaLog: LandBranchCall[] = [];
	private readonly listLocalBranchesLog: LandRepoCall[] = [];
	private readonly branchContainsParentLog: LandBranchContainsParentCall[] = [];
	private readonly snapshotBackupRefsLog: LandSnapshotBackupRefsCall[] = [];

	constructor(state: InMemoryLandGitGatewayState = {}) {
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
		this.currentBranchLog.push({ repoRoot: request.repoRoot });
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
		this.localBranchShaLog.push({ repoRoot: request.repoRoot, branch: request.branch });
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

	async snapshotBackupRefs(request: {
		readonly repoRoot: string;
		readonly branches: readonly string[];
	}): Promise<LandResult<ReadonlyMap<string, string>>> {
		this.snapshotBackupRefsLog.push({
			repoRoot: request.repoRoot,
			branches: [...request.branches],
		});
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
	readonly restackUpstackResults?: Readonly<Record<string, OperationState>>;
	readonly branchChildren?: Readonly<Record<string, readonly string[]>>;
	readonly branchChildrenFailure?: LandingBoundaryFailure;
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

export interface LandBranchChildrenCall extends LandBranchCall {
	readonly metadataDbPath: string;
}

export class InMemoryLandGraphiteGateway implements LandGraphiteGateway {
	private readonly trunkState: ValueState<string>;
	private readonly metadataDbPathState: ValueState<string>;
	private readonly stackShapeState: ValueState<StackSnapshot>;
	private readonly submitUpdateResults: ReadonlyMap<string, OperationState>;
	private readonly restackForSubmitResults: ReadonlyMap<string, OperationState>;
	private readonly restackUpstackResults: ReadonlyMap<string, OperationState>;
	private readonly branchChildrenByBranch: ReadonlyMap<string, readonly string[]>;
	private readonly branchChildrenFailure: LandingBoundaryFailure | undefined;
	private readonly trunkLog: LandRepoCall[] = [];
	private readonly metadataDbPathLog: LandRepoCall[] = [];
	private readonly stackShapeLog: LandStackShapeCall[] = [];
	private readonly prepareSubmitUpdateLog: LandBranchCall[] = [];
	private readonly prepareRestackForSubmitLog: LandBranchCall[] = [];
	private readonly refreshBranchFromRemoteLog: LandRefreshBranchFromRemoteCall[] = [];
	private readonly deleteLocalBranchLog: LandDeleteLocalBranchCall[] = [];
	private readonly restackUpstackLog: LandBranchCall[] = [];
	private readonly submitUpdateLog: LandSubmitUpdateCall[] = [];
	private readonly branchChildrenLog: LandBranchChildrenCall[] = [];

	constructor(state: InMemoryLandGraphiteGatewayState = {}) {
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
		this.restackUpstackResults = new Map(
			Object.entries(state.restackUpstackResults ?? {}).map(([branch, result]) => [
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

	get restackUpstackCalls(): readonly LandBranchCall[] {
		return cloneData(this.restackUpstackLog);
	}

	get submitUpdateCalls(): readonly LandSubmitUpdateCall[] {
		return cloneData(this.submitUpdateLog);
	}

	get branchChildrenCalls(): readonly LandBranchChildrenCall[] {
		return cloneData(this.branchChildrenLog);
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
		this.refreshBranchFromRemoteLog.push({
			repoRoot: request.repoRoot,
			branch: request.branch,
			checkedOutConflictHandling: request.checkedOutConflictHandling,
		});
		return { type: "success", result: emptyExecResult() };
	}

	async deleteLocalBranch(request: {
		readonly repoRoot: string;
		readonly branch: string;
		readonly checkedOutConflictHandling: "fail" | "retain";
	}): Promise<LandGraphiteDeleteLocalBranchResult> {
		this.deleteLocalBranchLog.push({
			repoRoot: request.repoRoot,
			branch: request.branch,
			checkedOutConflictHandling: request.checkedOutConflictHandling,
		});
		return { type: "deleted" };
	}

	async restackUpstack(request: {
		readonly repoRoot: string;
		readonly branch: string;
	}): Promise<LandGraphiteCommandResult> {
		this.restackUpstackLog.push({ repoRoot: request.repoRoot, branch: request.branch });
		return commandResult(this.restackUpstackResults.get(request.branch));
	}

	async submitUpdate(request: {
		readonly repoRoot: string;
		readonly branch: string;
		readonly force: boolean;
	}): Promise<LandGraphiteCommandResult> {
		this.submitUpdateLog.push({
			repoRoot: request.repoRoot,
			branch: request.branch,
			force: request.force,
		});
		return commandResult(this.submitUpdateResults.get(request.branch));
	}

	async branchChildren(request: {
		readonly repoRoot: string;
		readonly metadataDbPath: string;
		readonly branch: string;
	}): Promise<LandResult<readonly string[]>> {
		this.branchChildrenLog.push({
			repoRoot: request.repoRoot,
			metadataDbPath: request.metadataDbPath,
			branch: request.branch,
		});
		if (this.branchChildrenFailure !== undefined) {
			return { type: "failure", failure: cloneData(this.branchChildrenFailure) };
		}
		return { type: "success", value: [...(this.branchChildrenByBranch.get(request.branch) ?? [])] };
	}
}

export interface InMemoryLandGithubPrGatewayState {
	readonly pullRequests?: readonly PullRequestFacts[];
	readonly failures?: Readonly<Record<string, LandingBoundaryFailure>>;
	readonly squashMergeResults?: Readonly<Record<string, ValueState<SquashMergePullRequestResult>>>;
}

export interface LandPullRequestFactsCall extends LandRepoCall {
	readonly branchOrNumber: string;
}

export interface LandSquashMergePullRequestCall extends LandRepoCall {
	readonly pullRequest: PullRequestFacts;
}

export class InMemoryLandGithubPrGateway implements LandGithubPrGateway {
	private readonly pullRequests: ReadonlyMap<string, PullRequestFacts>;
	private readonly failures: ReadonlyMap<string, LandingBoundaryFailure>;
	private readonly squashMergeResults: ReadonlyMap<
		string,
		ValueState<SquashMergePullRequestResult>
	>;
	private readonly pullRequestFactsLog: LandPullRequestFactsCall[] = [];
	private readonly squashMergePullRequestLog: LandSquashMergePullRequestCall[] = [];

	constructor(state: InMemoryLandGithubPrGatewayState = {}) {
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
	}

	get pullRequestFactsCalls(): readonly LandPullRequestFactsCall[] {
		return cloneData(this.pullRequestFactsLog);
	}

	get squashMergePullRequestCalls(): readonly LandSquashMergePullRequestCall[] {
		return cloneData(this.squashMergePullRequestLog);
	}

	async pullRequestFacts(request: {
		readonly repoRoot: string;
		readonly branchOrNumber: string;
	}): Promise<LandResult<PullRequestFacts>> {
		this.pullRequestFactsLog.push({
			repoRoot: request.repoRoot,
			branchOrNumber: request.branchOrNumber,
		});
		const failure = this.failures.get(request.branchOrNumber);
		if (failure !== undefined) return { type: "failure", failure: cloneData(failure) };
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
		return { type: "success", value: cloneData(pr) };
	}

	async squashMergePullRequest(request: {
		readonly repoRoot: string;
		readonly pullRequest: PullRequestFacts;
	}): Promise<LandResult<SquashMergePullRequestResult>> {
		this.squashMergePullRequestLog.push({
			repoRoot: request.repoRoot,
			pullRequest: cloneData(request.pullRequest),
		});
		return valueResult({
			state: this.squashMergeResults.get(String(request.pullRequest.number)) ?? {
				stdout: "",
				stderr: "",
			},
			source: "github",
			phase: "merge",
			code: "squash_merge_failed",
			message: "Squash merge failed.",
			copyValue: cloneData,
		});
	}
}

export interface InMemoryLandWorktreeSlotFactsGatewayState {
	readonly worktrees?: readonly WorktreeEntry[];
	readonly classifications?: Readonly<Record<string, WorktreeClassification>>;
	readonly worktreesFailure?: LandingBoundaryFailure;
	readonly classifyFailures?: Readonly<Record<string, LandingBoundaryFailure>>;
	readonly freeSlotsFailure?: LandingBoundaryFailure;
}

export interface LandClassifyWorktreeCall extends LandRepoCall {
	readonly path: string;
	readonly branch?: string;
}

export interface LandFreeSlotsCall extends LandRepoCall {
	readonly slots: readonly ManagedSlotWorktree[];
}

export class InMemoryLandWorktreeSlotFactsGateway implements LandWorktreeSlotFactsGateway {
	private readonly worktreeEntries: readonly WorktreeEntry[];
	private readonly classifications: ReadonlyMap<string, WorktreeClassification>;
	private readonly worktreesFailure: LandingBoundaryFailure | undefined;
	private readonly classifyFailures: ReadonlyMap<string, LandingBoundaryFailure>;
	private readonly freeSlotsFailure: LandingBoundaryFailure | undefined;
	private readonly worktreesLog: LandRepoCall[] = [];
	private readonly classifyWorktreeLog: LandClassifyWorktreeCall[] = [];
	private readonly freeSlotsLog: LandFreeSlotsCall[] = [];

	constructor(state: InMemoryLandWorktreeSlotFactsGatewayState = {}) {
		this.worktreeEntries = cloneData(state.worktrees ?? []);
		this.classifications = new Map(
			Object.entries(state.classifications ?? {}).map(([path, classification]) => [
				path,
				cloneData(classification),
			]),
		);
		this.worktreesFailure = cloneOptionalData(state.worktreesFailure);
		this.freeSlotsFailure = cloneOptionalData(state.freeSlotsFailure);
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
		return { type: "success", value: cloneData(request.slots) };
	}
}

export interface InMemoryLandContextState {
	readonly git?: InMemoryLandGitGatewayState;
	readonly graphite?: InMemoryLandGraphiteGatewayState;
	readonly github?: InMemoryLandGithubPrGatewayState;
	readonly worktrees?: InMemoryLandWorktreeSlotFactsGatewayState;
}

export interface InMemoryLandContext {
	readonly context: LandContext;
	readonly git: InMemoryLandGitGateway;
	readonly graphite: InMemoryLandGraphiteGateway;
	readonly github: InMemoryLandGithubPrGateway;
	readonly worktrees: InMemoryLandWorktreeSlotFactsGateway;
}

export function createInMemoryLandContext(
	state: InMemoryLandContextState = {},
): InMemoryLandContext {
	const git = new InMemoryLandGitGateway(state.git);
	const graphite = new InMemoryLandGraphiteGateway(state.graphite);
	const github = new InMemoryLandGithubPrGateway(state.github);
	const worktrees = new InMemoryLandWorktreeSlotFactsGateway(state.worktrees);
	return {
		context: { git, graphite, github, worktrees },
		git,
		graphite,
		github,
		worktrees,
	};
}

export function pullRequestFacts(overrides: Partial<PullRequestFacts> = {}): PullRequestFacts {
	const number = overrides.number ?? 1;
	const branch = overrides.headRefName ?? "feature/current";
	return {
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
		commandDisplay: "gt operation",
		result: emptyExecResult(1),
	};
}

function emptyExecResult(code = 0): ExecResult {
	return { stdout: "", stderr: "", code, killed: false };
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
