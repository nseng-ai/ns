import type { ExecResult } from "@nseng-ai/foundation/command";

export type LandingTarget = StackLandingTarget | IsolatedPullRequestLandingTarget;

export interface StackLandingTarget {
	readonly type: "stack";
	readonly landingBranchLimit?: number;
}

export interface IsolatedPullRequestLandingTarget {
	readonly type: "isolated-pull-request";
	readonly branchOrNumber: string;
}

export interface LandingRequest {
	readonly cwd: string;
	readonly target: LandingTarget;
	readonly mode: LandingMode;
	readonly preflight: LandingPreflightMode;
	readonly cleanup: LandingCleanupMode;
}

export type LandingMode = "execute" | "dry-run";

export interface LandingPreflightMode {
	readonly shouldAllowSubmitRequiredState: boolean;
}

export interface LandingCleanupMode {
	readonly shouldFreeSlot: boolean;
	readonly shouldForceCleanup: boolean;
}

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
	| "submit-preparation"
	| "dry-run"
	| "merge"
	| "descendant-maintenance"
	| "cleanup";

export type LandingFailure =
	| LandingBoundaryFailure
	| LandingDomainFailure
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

export interface LandingNotImplementedFailure {
	readonly type: "not-implemented";
	readonly phase: LandingPhase;
	readonly message: string;
}

export interface LandingOutcome {
	readonly repoRoot: string;
	readonly target: LandingTarget;
	readonly mode: LandingMode;
	readonly phases: readonly LandingPhaseOutcome[];
	readonly plan?: LandingPlan;
	readonly landedChunks: readonly LandedChunk[];
	readonly cleanup: LandingCleanupOutcome;
}

export type LandingPhaseOutcome =
	| { readonly type: "completed"; readonly phase: LandingPhase }
	| { readonly type: "skipped"; readonly phase: LandingPhase; readonly reason: string }
	| { readonly type: "failed"; readonly phase: LandingPhase; readonly failure: LandingFailure };

export interface LandingCleanupOutcome {
	readonly retainedLocalBranches: readonly RetainedLocalBranchCleanup[];
	readonly freedSlots: readonly ManagedSlotWorktree[];
}

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
	readonly suggestedAction?: string;
}

export function toWarningNotifications(messages: readonly string[]): LandingWarning[] {
	return messages.map((message) => ({ level: "warning", message }));
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
	advanceBranchFromRemote(request: {
		readonly repoRoot: string;
		readonly branch: string;
	}): Promise<LandAdvanceBranchResult>;
	pushBranchToRemoteWithLease(request: {
		readonly repoRoot: string;
		readonly branch: string;
		readonly expectedRemoteSha: string;
	}): Promise<LandPushBranchWithLeaseResult>;
}

export interface LandGitRanCommand {
	readonly commandDisplay: string;
	readonly result: LandCommandResult;
}

export type LandAdvanceBranchResult =
	| { readonly type: "advanced" }
	| { readonly type: "checked-out"; readonly branch: string; readonly path: string }
	| ({ readonly type: "failure" } & LandGitRanCommand);

export type LandPushBranchWithLeaseResult =
	| { readonly type: "pushed" }
	| { readonly type: "lease-rejected" }
	| ({ readonly type: "failure" } & LandGitRanCommand);

export type LandRetargetPullRequestBaseResult =
	| { readonly type: "retargeted" }
	| ({ readonly type: "failure"; readonly message?: string } & LandGitRanCommand);

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

export interface LandRanCommand {
	readonly commandDisplay: string;
	readonly result: LandCommandResult;
}

export type LandGraphiteRanCommand = LandRanCommand;

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
	| ({ readonly type: "failed" } & LandGraphiteRanCommand);

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
	retargetPullRequestBase(request: {
		readonly repoRoot: string;
		readonly pullRequest: PullRequestFacts;
		readonly baseRefName: string;
	}): Promise<LandRetargetPullRequestBaseResult>;
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
