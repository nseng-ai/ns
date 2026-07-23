import type { ExecResult } from "@nseng-ai/foundation/command";

export type LandingTarget = StackLandingTarget | SingleBranchPullRequestLandingTarget;

export interface StackLandingTarget {
	readonly type: "stack";
	readonly landingBranchLimit?: number;
}

export interface SingleBranchPullRequestLandingTarget {
	readonly type: "single-branch-pull-request";
	readonly branchOrNumber: string;
}

export interface LandingRequest {
	readonly cwd: string;
	readonly target: LandingTarget;
	readonly mode: LandingMode;
	readonly preflight: LandingPreflightMode;
	readonly cleanup: LandingCleanupPolicy;
}

export type LandingMode = "execute" | "dry-run";

export interface LandingPreflightMode {
	readonly shouldAllowSubmitRequiredState: boolean;
}

/**
 * Closed post-landing cleanup policy for the current managed-slot worktree.
 *
 * - `preserve`: keep the current slot and local branch; never prompt or mutate.
 * - `free-slot`: free the current managed slot after a successful landing after confirmation.
 * - `force-cleanup`: authorized cleanup without a new cleanup prompt.
 *
 * `mode: "dry-run"` always dominates cleanup policy and performs no cleanup mutation.
 */
export type LandingCleanupPolicy = "preserve" | "free-slot" | "force-cleanup";

export interface LandContext {
	readonly git: LandGitGateway;
	readonly graphite: LandGraphiteGateway;
	readonly github: LandGithubPrGateway;
	readonly worktrees: LandWorktreeSlotFactsGateway;
}

export type LandResult<T> =
	| { readonly type: "success"; readonly value: T }
	| { readonly type: "failure"; readonly failure: LandingFailure };

export type LandOutcome =
	| { readonly type: "completed" }
	| { readonly type: "failure"; readonly failure: LandingFailure };

export type LandingPhase =
	| "request-validation"
	| "repo-discovery"
	| "stack-shape"
	| "preflight"
	| "confirmation"
	| "submit-preparation"
	| "dry-run"
	| "merge"
	| "descendant-maintenance"
	| "merge-maintenance-cleanup"
	| "post-landing-cleanup";

export type LandingFailure =
	| LandingBoundaryFailure
	| LandingDomainFailure
	| LandingExecutionFailure
	| LandingNotImplementedFailure;

export interface LandingBoundaryFailure {
	readonly type: "boundary";
	readonly phase: LandingPhase;
	readonly source: "git" | "graphite" | "github" | "worktree" | "slot";
	readonly code: string;
	readonly message: string;
	readonly displayCommand?: string;
	readonly execResult?: LandCommandResult;
	readonly suggestedAction?: string;
}

export interface LandingDomainFailure {
	readonly type: "domain";
	readonly phase: LandingPhase;
	readonly reason: LandingDomainFailureReason;
	readonly message: string;
	readonly failedBranch?: string;
	readonly failedPrNumber?: number;
	readonly suggestedAction?: string;
}

export type LandingDomainFailureReason =
	| "nothing-to-land"
	| "dirty-worktree"
	| "operation-in-progress"
	| "local-branch-missing"
	| "forked-stack"
	| "pull-request-not-open"
	| "pull-request-draft"
	| "pull-request-head-mismatch"
	| "pull-request-base-mismatch"
	| "manual-worktree-conflict"
	| "descendant-maintenance-blocked";

export type NotifyLevel = "info" | "success" | "warning" | "error";

export interface LandingExecutionFailure {
	type: "execution";
	level: NotifyLevel;
	message: string;
	displayCommand?: string;
	execResult?: ExecResult;
	failedBranch?: string;
	failedPrNumber?: number;
	suggestedAction?: string;
	outcome: "refusal" | "failure";
	refusalReason?: "declined" | "non-interactive";
}

export interface LandingNotImplementedFailure {
	readonly type: "not-implemented";
	readonly phase: LandingPhase;
	readonly message: string;
}

/**
 * Outcome-rich report carried by both {@link LandingExecutionResult} variants. Early failures omit
 * discovery facts (`repoRoot`, `plan`) that were never observed. Phases are an observational audit
 * trail for presentation: callers route on typed result and report facts, never phase names or order.
 * A completed `stack-shape` entry means a usable shape was observed, whether loaded from the
 * repository or supplied by the caller; `repo-discovery` records only repository loading work.
 */
export type LandingCompletionDisposition =
	| { readonly type: "stack-execution" }
	| { readonly type: "cleanup-only" }
	| { readonly type: "nothing-to-land"; readonly currentBranch: string };

export interface LandingExecutionReport {
	readonly target: LandingTarget;
	readonly mode: LandingMode;
	/** Canonical classification of how this request completed or was being executed when it failed. */
	readonly completionDisposition: LandingCompletionDisposition;
	readonly repoRoot?: string;
	readonly plan?: LandingPlan;
	readonly phases: readonly LandingPhaseOutcome[];
	readonly landedChunks: readonly LandedChunk[];
	readonly warnings: readonly LandingWarning[];
	readonly cleanup: LandingCleanupReport;
}

/** Canonical result of {@link LandingRequest} execution. Both variants carry the same report. */
export type LandingExecutionResult =
	| { readonly type: "completed"; readonly report: LandingExecutionReport }
	| {
			readonly type: "failed";
			readonly failedPhase: LandingPhase;
			readonly report: LandingExecutionReport;
			readonly failure: LandingFailure;
	  };

/**
 * Deliberate compatibility alias: the previously public `LandingOutcome` vocabulary now names the
 * canonical execution report so there is exactly one execution report model.
 */
export type LandingOutcome = LandingExecutionReport;

export type LandingPhaseOutcome =
	| { readonly type: "completed"; readonly phase: LandingPhase }
	| { readonly type: "skipped"; readonly phase: LandingPhase; readonly reason: string }
	| { readonly type: "failed"; readonly phase: LandingPhase; readonly failure: LandingFailure };

export interface LandingCleanupReport {
	readonly preMergeFreedSlots: readonly ManagedSlotWorktree[];
	readonly mergeMaintenanceCleanup: MergeMaintenanceCleanupReport;
	readonly postLandingSlotCleanup: PostLandingSlotCleanupReport;
}

/** Local-branch cleanup observed during per-merge Graphite maintenance. */
export interface MergeMaintenanceCleanupReport {
	readonly deletedLocalBranches: readonly string[];
	readonly retainedLocalBranches: readonly RetainedLocalBranchCleanup[];
}

/** Observed outcome of post-landing managed-slot cleanup. */
export type PostLandingSlotCleanupReport =
	| { readonly type: "not-applicable" }
	| { readonly type: "preserved" }
	| { readonly type: "dry-run" }
	| {
			readonly type: "slots-extension-not-installed";
			readonly slotName: string;
			readonly branch: string;
			readonly worktreePath: string;
	  }
	| { readonly type: "not-run"; readonly reason: string }
	| { readonly type: "declined"; readonly slotName: string; readonly branch: string }
	| {
			readonly type: "completed";
			readonly freedSlot: ManagedSlotWorktree;
			readonly deletedLocalBranch?: string;
			readonly keptTrunkBranch?: string;
	  }
	| {
			readonly type: "failed";
			readonly freedSlot?: ManagedSlotWorktree;
			readonly failure: LandingFailure;
	  };

export interface StackSnapshot {
	readonly trunk: string;
	readonly current: string;
	readonly actualCurrentBranch: string;
	readonly landingTargetBranch: string;
	readonly landingBranches: readonly string[];
	readonly remainingLandingBranches: readonly string[];
	readonly descendantBranches: readonly string[];
	readonly descendantRootBranches: readonly string[];
	readonly warnings: readonly LandingWarning[];
}

export interface LandingShape {
	readonly repoRoot: string;
	readonly current: string;
	readonly trunk: string;
	readonly metadataDbPath: string;
	readonly stack: StackSnapshot;
}

export interface LandingPlan {
	readonly repoRoot: string;
	readonly metadataDbPath: string;
	readonly stack: StackSnapshot;
	readonly branchPlans: readonly BranchLandingPlan[];
	readonly preflight: LandingPreflightReport;
	readonly prSubmitRequirements: readonly PrSubmitRequirement[];
	readonly submitRestackRequirements: readonly RestackRequirement[];
	readonly managedSlotConflicts: readonly ManagedSlotWorktree[];
	readonly descendantMaintenance: DescendantMaintenancePlan;
}

export interface BranchLandingPlan {
	readonly branch: string;
	readonly localSha: string;
	readonly pr: PullRequestFacts;
}

export interface LandingPreflightReport {
	readonly status: "ready" | "submit-required" | "blocked";
	readonly checkedBranches: readonly string[];
	readonly warnings: readonly LandingWarning[];
	readonly failures: readonly LandingDomainFailure[];
}

export interface PullRequestFacts {
	readonly id: string;
	readonly number: number;
	readonly title: string;
	readonly body: string | null;
	readonly state: string;
	readonly isDraft: boolean;
	readonly headRefName: string;
	readonly baseRefName: string;
	readonly headRefOid: string;
	readonly mergeStateStatus?: string;
	readonly url?: string;
	readonly mergedAt?: string | null;
}

export interface PrSubmitRequirement {
	readonly branch: string;
	readonly prNumber: number;
	readonly localSha: string;
	readonly prHeadSha: string;
	readonly baseRefName: string;
	readonly expectedBaseRefName?: string;
	readonly reasons: readonly string[];
}

export interface RestackRequirement {
	readonly branch: string;
	readonly parent: string;
}

export type LandGraphiteRestackScope = "branch-only" | "upstack";

export type WorktreeConflict =
	| CurrentWorktreeConflict
	| ManagedSlotWorktree
	| ManualWorktreeConflict;

export interface CurrentWorktreeConflict {
	readonly type: "current";
	readonly branch: string;
	readonly path: string;
}

export interface ManagedSlotWorktree {
	readonly type: "managed-slot";
	readonly branch: string;
	readonly path: string;
	readonly slotName?: string;
}

export interface ManualWorktreeConflict {
	readonly type: "manual-worktree";
	readonly branch: string;
	readonly path: string;
}

export type DescendantMaintenancePlan =
	| { readonly type: "none"; readonly branches: readonly [] }
	| {
			readonly type: "auto";
			readonly branches: readonly string[];
			readonly targetBranches: readonly string[];
	  }
	| {
			readonly type: "skipped";
			readonly branches: readonly string[];
			readonly targetBranches: readonly string[];
			readonly conflicts: readonly WorktreeConflict[];
			readonly reason: string;
	  };

export interface LandedChunk {
	readonly index: number;
	readonly landingTargetBranch: string;
	readonly landed: readonly LandedPullRequest[];
}

export interface LandedPullRequest {
	readonly branch: string;
	readonly number: number;
	readonly title: string;
	readonly url?: string;
}

export interface RetainedLocalBranchCleanup {
	readonly branch: string;
	readonly path: string;
}

export interface LandingWarning {
	readonly level: "warning" | "info";
	readonly message: string;
	readonly commandDisplay?: string;
	readonly result?: LandCommandResult;
	readonly suggestedAction?: string;
	readonly notificationAction?: string;
}

export function landingWarning(input: Omit<LandingWarning, "level">): LandingWarning {
	return { level: "warning", ...input };
}

export interface LandGitGateway {
	resolveRepoRoot(request: { readonly cwd: string }): Promise<LandResult<string>>;
	currentBranch(request: { readonly repoRoot: string }): Promise<LandResult<string>>;
	workingTreeStatus(request: { readonly repoRoot: string }): Promise<LandResult<WorkingTreeStatus>>;
	localBranchExists(request: {
		readonly repoRoot: string;
		readonly branch: string;
	}): Promise<LandOutcome>;
	localBranchSha(request: {
		readonly repoRoot: string;
		readonly branch: string;
	}): Promise<LandResult<string>>;
	listLocalBranches(request: {
		readonly repoRoot: string;
	}): Promise<LandResult<readonly LocalBranchTip[]>>;
	branchContainsParent(request: {
		readonly repoRoot: string;
		readonly branch: string;
		readonly parent: string;
	}): Promise<LandResult<boolean>>;
	snapshotBackupRefs(request: {
		readonly repoRoot: string;
		readonly branches: readonly string[];
	}): Promise<LandResult<ReadonlyMap<string, string>>>;
}

export interface WorkingTreeStatus {
	readonly isClean: boolean;
	readonly inProgressOperation?: "merge" | "cherry-pick" | "revert" | "rebase" | "bisect";
}

export interface LocalBranchTip {
	readonly name: string;
	readonly sha: string;
}

export interface LandGraphiteGateway {
	trunk(request: { readonly repoRoot: string }): Promise<LandResult<string>>;
	metadataDbPath(request: { readonly repoRoot: string }): Promise<LandResult<string>>;
	stackShape(request: {
		readonly repoRoot: string;
		readonly metadataDbPath: string;
		readonly current: string;
		readonly trunk: string;
		readonly liveLocalBranches: readonly string[];
	}): Promise<LandResult<StackSnapshot>>;
	prepareSubmitUpdate(request: {
		readonly repoRoot: string;
		readonly branch: string;
	}): Promise<LandOutcome>;
	prepareRestackForSubmit(request: {
		readonly repoRoot: string;
		readonly branch: string;
	}): Promise<LandOutcome>;
	refreshBranchFromRemote(request: {
		readonly repoRoot: string;
		readonly branch: string;
		readonly checkedOutConflictHandling: "fail" | "defer";
	}): Promise<LandGraphiteRefreshBranchResult>;
	deleteLocalBranch(request: {
		readonly repoRoot: string;
		readonly branch: string;
		readonly checkedOutConflictHandling: "fail" | "retain";
	}): Promise<LandGraphiteDeleteLocalBranchResult>;
	restack(request: {
		readonly repoRoot: string;
		readonly branch: string;
		readonly scope: LandGraphiteRestackScope;
	}): Promise<LandGraphiteCommandResult>;
	submitUpdate(request: {
		readonly repoRoot: string;
		readonly branch: string;
		readonly force: boolean;
	}): Promise<LandGraphiteCommandResult>;
	branchChildren(request: {
		readonly repoRoot: string;
		readonly metadataDbPath: string;
		readonly branch: string;
	}): Promise<LandResult<readonly string[]>>;
}

export type LandCommandResult = ExecResult;

export interface LandingBoundaryFailureDiagnostics {
	readonly displayCommand?: string;
	readonly execResult?: LandCommandResult;
	readonly suggestedAction?: string;
}

export function boundaryFailureDiagnostics(
	failure: LandingFailure,
): LandingBoundaryFailureDiagnostics {
	if (failure.type !== "boundary") return {};
	return {
		...(failure.displayCommand === undefined ? {} : { displayCommand: failure.displayCommand }),
		...(failure.execResult === undefined ? {} : { execResult: failure.execResult }),
		...(failure.suggestedAction === undefined ? {} : { suggestedAction: failure.suggestedAction }),
	};
}

export interface LandGraphiteRanCommand {
	readonly commandDisplay: string;
	readonly result: LandCommandResult;
}

export type LandGraphiteCommandResult =
	| { readonly type: "success"; readonly result: LandCommandResult }
	| ({ readonly type: "failure" } & LandGraphiteRanCommand);

export type LandGraphiteRefreshBranchResult =
	| { readonly type: "success"; readonly result: LandCommandResult }
	| ({
			readonly type: "checkout-conflict";
			readonly branch: string;
			readonly path: string;
	  } & LandGraphiteRanCommand)
	| ({ readonly type: "failure" } & LandGraphiteRanCommand);

export type LandGraphiteDeleteLocalBranchResult =
	| { readonly type: "deleted" }
	| { readonly type: "retained"; readonly branch: string; readonly path: string }
	| ({
			readonly type: "failed";
			readonly isLikelyInProgressGitOperation: boolean;
	  } & LandGraphiteRanCommand);

export interface SquashMergePullRequestResult {
	readonly stdout: string;
	readonly stderr: string;
}

export interface LandGithubPrGateway {
	pullRequestFacts(request: {
		readonly repoRoot: string;
		readonly branchOrNumber: string;
	}): Promise<LandResult<PullRequestFacts>>;
	pullRequestFactsByBranch?(request: {
		readonly repoRoot: string;
		readonly branches: readonly string[];
	}): Promise<LandResult<ReadonlyMap<string, PullRequestFacts>>>;
	squashMergePullRequest(request: {
		readonly repoRoot: string;
		readonly pullRequest: PullRequestFacts;
	}): Promise<LandResult<SquashMergePullRequestResult>>;
}

export interface LandWorktreeSlotFactsGateway {
	worktrees(request: { readonly repoRoot: string }): Promise<LandResult<readonly WorktreeEntry[]>>;
	classifyWorktree(request: {
		readonly repoRoot: string;
		readonly path: string;
		readonly branch?: string;
	}): Promise<LandResult<WorktreeClassification>>;
	freeSlots(request: {
		readonly repoRoot: string;
		readonly slots: readonly ManagedSlotWorktree[];
	}): Promise<LandResult<readonly ManagedSlotWorktree[]>>;
}

export interface WorktreeEntry {
	readonly path: string;
	readonly branch?: string;
}

export type WorktreeClassification =
	| { readonly type: "current" }
	| { readonly type: "managed-slot"; readonly slotName: string }
	| { readonly type: "manual-worktree" };
