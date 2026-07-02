import type {
	LandContext,
	LandingBoundaryFailure,
	LandGitGateway,
	LandGithubPrFactsGateway,
	LandGraphiteGateway,
	LandOutcome,
	LandResult,
	LandWorktreeSlotFactsGateway,
	LocalBranchTip,
	PullRequestFacts,
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
	private readonly resolveRepoRootLog: LandRepoRootCall[] = [];
	private readonly currentBranchLog: LandRepoCall[] = [];
	private readonly workingTreeStatusLog: LandRepoCall[] = [];
	private readonly localBranchExistsLog: LandBranchCall[] = [];
	private readonly localBranchShaLog: LandBranchCall[] = [];
	private readonly listLocalBranchesLog: LandRepoCall[] = [];
	private readonly branchContainsParentLog: LandBranchContainsParentCall[] = [];

	constructor(state: InMemoryLandGitGatewayState = {}) {
		this.repoRootState = state.repoRoot ?? "/repo";
		this.currentBranchState = state.currentBranch ?? "feature/current";
		this.workingTreeStatusState = state.workingTreeStatus ?? { isClean: true };
		this.branches = new Map((state.localBranches ?? []).map((branch) => [branch.name, branch.sha]));
		this.branchContainsParents = new Map(Object.entries(state.branchContainsParents ?? {}));
		this.shouldDefaultBranchContainParent = state.shouldDefaultBranchContainParent ?? true;
		this.listLocalBranchesFailure = copyOptionalBoundaryFailure(state.listLocalBranchesFailure);
		this.localBranchExistsFailures = new Map(
			Object.entries(state.localBranchExistsFailures ?? {}).map(([branch, failure]) => [
				branch,
				copyBoundaryFailure(failure),
			]),
		);
		this.localBranchShaFailures = new Map(
			Object.entries(state.localBranchShaFailures ?? {}).map(([branch, failure]) => [
				branch,
				copyBoundaryFailure(failure),
			]),
		);
	}

	get resolveRepoRootCalls(): readonly LandRepoRootCall[] {
		return this.resolveRepoRootLog.map(copyRepoRootCall);
	}

	get currentBranchCalls(): readonly LandRepoCall[] {
		return this.currentBranchLog.map(copyRepoCall);
	}

	get workingTreeStatusCalls(): readonly LandRepoCall[] {
		return this.workingTreeStatusLog.map(copyRepoCall);
	}

	get localBranchExistsCalls(): readonly LandBranchCall[] {
		return this.localBranchExistsLog.map(copyBranchCall);
	}

	get localBranchShaCalls(): readonly LandBranchCall[] {
		return this.localBranchShaLog.map(copyBranchCall);
	}

	get listLocalBranchesCalls(): readonly LandRepoCall[] {
		return this.listLocalBranchesLog.map(copyRepoCall);
	}

	get branchContainsParentCalls(): readonly LandBranchContainsParentCall[] {
		return this.branchContainsParentLog.map(copyBranchContainsParentCall);
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
			copyValue: copyWorkingTreeStatus,
		});
	}

	async localBranchExists(request: {
		readonly repoRoot: string;
		readonly branch: string;
	}): Promise<LandOutcome> {
		this.localBranchExistsLog.push({ repoRoot: request.repoRoot, branch: request.branch });
		const failure = this.localBranchExistsFailures.get(request.branch);
		if (failure !== undefined) return { type: "failure", failure: copyBoundaryFailure(failure) };
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
		if (failure !== undefined) return { type: "failure", failure: copyBoundaryFailure(failure) };
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
			return { type: "failure", failure: copyBoundaryFailure(this.listLocalBranchesFailure) };
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
}

export interface InMemoryLandGraphiteGatewayState {
	readonly trunk?: ValueState<string>;
	readonly metadataDbPath?: ValueState<string>;
	readonly stackShape?: ValueState<StackSnapshot>;
	readonly submitUpdateResults?: Readonly<Record<string, OperationState>>;
	readonly restackForSubmitResults?: Readonly<Record<string, OperationState>>;
}

export interface LandStackShapeCall extends LandRepoCall {
	readonly metadataDbPath: string;
	readonly current: string;
	readonly trunk: string;
	readonly liveLocalBranches: readonly string[];
}

export class InMemoryLandGraphiteGateway implements LandGraphiteGateway {
	private readonly trunkState: ValueState<string>;
	private readonly metadataDbPathState: ValueState<string>;
	private readonly stackShapeState: ValueState<StackSnapshot>;
	private readonly submitUpdateResults: ReadonlyMap<string, OperationState>;
	private readonly restackForSubmitResults: ReadonlyMap<string, OperationState>;
	private readonly trunkLog: LandRepoCall[] = [];
	private readonly metadataDbPathLog: LandRepoCall[] = [];
	private readonly stackShapeLog: LandStackShapeCall[] = [];
	private readonly prepareSubmitUpdateLog: LandBranchCall[] = [];
	private readonly prepareRestackForSubmitLog: LandBranchCall[] = [];

	constructor(state: InMemoryLandGraphiteGatewayState = {}) {
		this.trunkState = state.trunk ?? "main";
		this.metadataDbPathState = state.metadataDbPath ?? "/repo/.git/graphite.db";
		this.stackShapeState = copyValueState(state.stackShape ?? stackSnapshot(), copyStackSnapshot);
		this.submitUpdateResults = new Map(
			Object.entries(state.submitUpdateResults ?? {}).map(([branch, result]) => [
				branch,
				copyOperationState(result),
			]),
		);
		this.restackForSubmitResults = new Map(
			Object.entries(state.restackForSubmitResults ?? {}).map(([branch, result]) => [
				branch,
				copyOperationState(result),
			]),
		);
	}

	get trunkCalls(): readonly LandRepoCall[] {
		return this.trunkLog.map(copyRepoCall);
	}

	get metadataDbPathCalls(): readonly LandRepoCall[] {
		return this.metadataDbPathLog.map(copyRepoCall);
	}

	get stackShapeCalls(): readonly LandStackShapeCall[] {
		return this.stackShapeLog.map(copyStackShapeCall);
	}

	get prepareSubmitUpdateCalls(): readonly LandBranchCall[] {
		return this.prepareSubmitUpdateLog.map(copyBranchCall);
	}

	get prepareRestackForSubmitCalls(): readonly LandBranchCall[] {
		return this.prepareRestackForSubmitLog.map(copyBranchCall);
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
			copyValue: copyStackSnapshot,
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
}

export interface InMemoryLandGithubPrFactsGatewayState {
	readonly pullRequests?: readonly PullRequestFacts[];
	readonly failures?: Readonly<Record<string, LandingBoundaryFailure>>;
}

export interface LandPullRequestFactsCall extends LandRepoCall {
	readonly branchOrNumber: string;
}

export class InMemoryLandGithubPrFactsGateway implements LandGithubPrFactsGateway {
	private readonly pullRequests: ReadonlyMap<string, PullRequestFacts>;
	private readonly failures: ReadonlyMap<string, LandingBoundaryFailure>;
	private readonly pullRequestFactsLog: LandPullRequestFactsCall[] = [];

	constructor(state: InMemoryLandGithubPrFactsGatewayState = {}) {
		const entries: [string, PullRequestFacts][] = [];
		for (const pr of state.pullRequests ?? []) {
			const copied = copyPullRequestFacts(pr);
			entries.push([copied.headRefName, copied], [String(copied.number), copied]);
		}
		this.pullRequests = new Map(entries);
		this.failures = new Map(
			Object.entries(state.failures ?? {}).map(([key, failure]) => [
				key,
				copyBoundaryFailure(failure),
			]),
		);
	}

	get pullRequestFactsCalls(): readonly LandPullRequestFactsCall[] {
		return this.pullRequestFactsLog.map(copyPullRequestFactsCall);
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
		if (failure !== undefined) return { type: "failure", failure: copyBoundaryFailure(failure) };
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
		return { type: "success", value: copyPullRequestFacts(pr) };
	}
}

export interface InMemoryLandWorktreeSlotFactsGatewayState {
	readonly worktrees?: readonly WorktreeEntry[];
	readonly classifications?: Readonly<Record<string, WorktreeClassification>>;
	readonly worktreesFailure?: LandingBoundaryFailure;
	readonly classifyFailures?: Readonly<Record<string, LandingBoundaryFailure>>;
}

export interface LandClassifyWorktreeCall extends LandRepoCall {
	readonly path: string;
	readonly branch?: string;
}

export class InMemoryLandWorktreeSlotFactsGateway implements LandWorktreeSlotFactsGateway {
	private readonly worktreeEntries: readonly WorktreeEntry[];
	private readonly classifications: ReadonlyMap<string, WorktreeClassification>;
	private readonly worktreesFailure: LandingBoundaryFailure | undefined;
	private readonly classifyFailures: ReadonlyMap<string, LandingBoundaryFailure>;
	private readonly worktreesLog: LandRepoCall[] = [];
	private readonly classifyWorktreeLog: LandClassifyWorktreeCall[] = [];

	constructor(state: InMemoryLandWorktreeSlotFactsGatewayState = {}) {
		this.worktreeEntries = (state.worktrees ?? []).map(copyWorktreeEntry);
		this.classifications = new Map(
			Object.entries(state.classifications ?? {}).map(([path, classification]) => [
				path,
				copyWorktreeClassification(classification),
			]),
		);
		this.worktreesFailure = copyOptionalBoundaryFailure(state.worktreesFailure);
		this.classifyFailures = new Map(
			Object.entries(state.classifyFailures ?? {}).map(([path, failure]) => [
				path,
				copyBoundaryFailure(failure),
			]),
		);
	}

	get worktreesCalls(): readonly LandRepoCall[] {
		return this.worktreesLog.map(copyRepoCall);
	}

	get classifyWorktreeCalls(): readonly LandClassifyWorktreeCall[] {
		return this.classifyWorktreeLog.map(copyClassifyWorktreeCall);
	}

	async worktrees(request: {
		readonly repoRoot: string;
	}): Promise<LandResult<readonly WorktreeEntry[]>> {
		this.worktreesLog.push({ repoRoot: request.repoRoot });
		if (this.worktreesFailure !== undefined)
			return { type: "failure", failure: copyBoundaryFailure(this.worktreesFailure) };
		return { type: "success", value: this.worktreeEntries.map(copyWorktreeEntry) };
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
		if (failure !== undefined) return { type: "failure", failure: copyBoundaryFailure(failure) };
		return {
			type: "success",
			value: copyWorktreeClassification(
				this.classifications.get(request.path) ?? { type: "manual-worktree" },
			),
		};
	}
}

export interface InMemoryLandContextState {
	readonly git?: InMemoryLandGitGatewayState;
	readonly graphite?: InMemoryLandGraphiteGatewayState;
	readonly github?: InMemoryLandGithubPrFactsGatewayState;
	readonly worktrees?: InMemoryLandWorktreeSlotFactsGatewayState;
}

export interface InMemoryLandContext {
	readonly context: LandContext;
	readonly git: InMemoryLandGitGateway;
	readonly graphite: InMemoryLandGraphiteGateway;
	readonly github: InMemoryLandGithubPrFactsGateway;
	readonly worktrees: InMemoryLandWorktreeSlotFactsGateway;
}

export function createInMemoryLandContext(
	state: InMemoryLandContextState = {},
): InMemoryLandContext {
	const git = new InMemoryLandGitGateway(state.git);
	const graphite = new InMemoryLandGraphiteGateway(state.graphite);
	const github = new InMemoryLandGithubPrFactsGateway(state.github);
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
	const copyValue = options.copyValue ?? ((value: T) => value);
	if (isFailureState(options.state)) {
		return {
			type: "failure",
			failure: copyOptionalBoundaryFailure(options.state.failure) ?? boundaryFailure(options),
		};
	}
	return { type: "success", value: copyValue(options.state) };
}

function operationOutcome(state: OperationState | undefined): LandOutcome {
	if (state === undefined || state.type === "success") return { type: "completed" };
	return {
		type: "failure",
		failure:
			copyOptionalBoundaryFailure(state.failure) ??
			boundaryFailure({
				source: "graphite",
				phase: "submit-preparation",
				code: "operation_failed",
				message: "Graphite preparation failed.",
			}),
	};
}

function isFailureState<T>(state: ValueState<T>): state is FailureState {
	return typeof state === "object" && state !== null && "type" in state && state.type === "failure";
}

function copyOperationState(state: OperationState): OperationState {
	if (state.type === "success") return { type: "success" };
	return {
		type: "failure",
		...(state.failure === undefined ? {} : { failure: copyBoundaryFailure(state.failure) }),
	};
}

function copyValueState<T>(state: ValueState<T>, copyValue: (value: T) => T): ValueState<T> {
	if (isFailureState(state)) {
		return {
			type: "failure",
			...(state.failure === undefined ? {} : { failure: copyBoundaryFailure(state.failure) }),
		};
	}
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

function copyOptionalBoundaryFailure(
	failure: LandingBoundaryFailure | undefined,
): LandingBoundaryFailure | undefined {
	return failure === undefined ? undefined : copyBoundaryFailure(failure);
}

function copyBoundaryFailure(failure: LandingBoundaryFailure): LandingBoundaryFailure {
	return {
		type: "boundary",
		phase: failure.phase,
		source: failure.source,
		code: failure.code,
		message: failure.message,
		...(failure.displayCommand === undefined ? {} : { displayCommand: failure.displayCommand }),
		...(failure.details === undefined ? {} : { details: { ...failure.details } }),
	};
}

function copyWorkingTreeStatus(status: WorkingTreeStatus): WorkingTreeStatus {
	return {
		isClean: status.isClean,
		...(status.inProgressOperation === undefined
			? {}
			: { inProgressOperation: status.inProgressOperation }),
	};
}

function copyPullRequestFacts(pr: PullRequestFacts): PullRequestFacts {
	return {
		number: pr.number,
		title: pr.title,
		body: pr.body,
		state: pr.state,
		isDraft: pr.isDraft,
		headRefName: pr.headRefName,
		baseRefName: pr.baseRefName,
		headRefOid: pr.headRefOid,
		...(pr.mergeStateStatus === undefined ? {} : { mergeStateStatus: pr.mergeStateStatus }),
		...(pr.url === undefined ? {} : { url: pr.url }),
		...(pr.mergedAt === undefined ? {} : { mergedAt: pr.mergedAt }),
	};
}

function copyStackSnapshot(snapshot: StackSnapshot): StackSnapshot {
	return {
		trunk: snapshot.trunk,
		current: snapshot.current,
		actualCurrentBranch: snapshot.actualCurrentBranch,
		landingTargetBranch: snapshot.landingTargetBranch,
		landingBranches: [...snapshot.landingBranches],
		remainingLandingBranches: [...snapshot.remainingLandingBranches],
		descendantBranches: [...snapshot.descendantBranches],
		warnings: snapshot.warnings.map((warning) => ({ ...warning })),
	};
}

function copyWorktreeEntry(entry: WorktreeEntry): WorktreeEntry {
	return {
		path: entry.path,
		...(entry.branch === undefined ? {} : { branch: entry.branch }),
	};
}

function copyWorktreeClassification(
	classification: WorktreeClassification,
): WorktreeClassification {
	if (classification.type === "managed-slot")
		return { type: "managed-slot", slotName: classification.slotName };
	return { type: classification.type };
}

function copyRepoRootCall(call: LandRepoRootCall): LandRepoRootCall {
	return { cwd: call.cwd };
}

function copyRepoCall(call: LandRepoCall): LandRepoCall {
	return { repoRoot: call.repoRoot };
}

function copyBranchCall(call: LandBranchCall): LandBranchCall {
	return { repoRoot: call.repoRoot, branch: call.branch };
}

function copyBranchContainsParentCall(
	call: LandBranchContainsParentCall,
): LandBranchContainsParentCall {
	return { repoRoot: call.repoRoot, branch: call.branch, parent: call.parent };
}

function copyStackShapeCall(call: LandStackShapeCall): LandStackShapeCall {
	return {
		repoRoot: call.repoRoot,
		metadataDbPath: call.metadataDbPath,
		current: call.current,
		trunk: call.trunk,
		liveLocalBranches: [...call.liveLocalBranches],
	};
}

function copyPullRequestFactsCall(call: LandPullRequestFactsCall): LandPullRequestFactsCall {
	return { repoRoot: call.repoRoot, branchOrNumber: call.branchOrNumber };
}

function copyClassifyWorktreeCall(call: LandClassifyWorktreeCall): LandClassifyWorktreeCall {
	return {
		repoRoot: call.repoRoot,
		path: call.path,
		...(call.branch === undefined ? {} : { branch: call.branch }),
	};
}
