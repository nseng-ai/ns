import { executeLandingRequest, type LandStackExecutionHost } from "./execution/execute.ts";
import { nullLandConfirmationGateway, nullLandExecutionProgress } from "./execution/host-seams.ts";
import type { StackLandingShape } from "./preflight.ts";
import type {
	LandContext,
	LandingExecutionApprovals,
	LandingExecutionResult,
	LandingRequest,
} from "./types.ts";

// Public API identifiers intentionally mirror package metadata; tests guard the invariant
// instead of reading package metadata at runtime.
export const LAND_CAPABILITY_ID = "land";
export const LAND_PACKAGE_NAME = "@nseng-ai/flow";

export interface LandCapabilityMetadata {
	readonly capabilityId: typeof LAND_CAPABILITY_ID;
	readonly packageName: typeof LAND_PACKAGE_NAME;
	readonly tier: "capability";
}

export const LAND_CAPABILITY_METADATA: LandCapabilityMetadata = {
	capabilityId: LAND_CAPABILITY_ID,
	packageName: LAND_PACKAGE_NAME,
	tier: "capability",
};

export interface ExecuteLandingOptions {
	readonly context: LandContext;
	readonly request: LandingRequest;
	readonly host?: LandStackExecutionHost;
	/** Temporary compatibility seam for confirmations already granted by the calling host. */
	readonly approvals?: LandingExecutionApprovals;
	/**
	 * Already-loaded landing shape from the calling host's routing/presentation pass. Avoids
	 * re-running discovery commands; strict pre-merge rechecks still run during execution.
	 */
	readonly preparedShape?: StackLandingShape;
}

/**
 * Canonical stack-landing execution entrypoint. Owns discovery, preflight planning, confirmation,
 * pre-merge preparation, merge execution, and post-landing managed-slot cleanup, and returns a
 * {@link LandingExecutionResult} whose report carries the facts observed up to every exit.
 */
export async function executeLanding(
	options: ExecuteLandingOptions,
): Promise<LandingExecutionResult> {
	return await executeLandingRequest({
		context: options.context,
		request: options.request,
		host: options.host ?? {
			confirmation: nullLandConfirmationGateway,
			progress: nullLandExecutionProgress,
		},
		...(options.approvals === undefined ? {} : { approvals: options.approvals }),
		...(options.preparedShape === undefined ? {} : { preparedShape: options.preparedShape }),
	});
}

export type { LandStackExecutionHost } from "./execution/execute.ts";

export {
	buildDescendantMaintenancePlan,
	buildStackLandingPlan,
	collectPrSubmitRequirements,
	collectSubmitRestackRequirements,
	landingParentEdges,
	loadStackLandingShape,
	scopeStackSnapshot,
	validateOpenPrBasics,
	validateStrictMergeGate,
} from "./preflight.ts";

export { boundaryFailureDiagnostics } from "./types.ts";

export {
	isLandFailure,
	landCompleted,
	landFailure,
	landingExecutionFailure,
	landingFailureFacts,
	landOutcomeFailure,
	landSuccess,
} from "./results.ts";

export type { LandingExecutionFailureOptions, LandingFailureFacts } from "./results.ts";

export {
	createRefusingLandConfirmationGateway,
	nullLandConfirmationGateway,
	nullLandExecutionProgress,
} from "./execution/host-seams.ts";

export type {
	LandConfirmationDecision,
	LandConfirmationGateway,
	LandConfirmationRequest,
	LandExecutionProgress,
	LandExecutionStep,
	LandExecutionStepState,
} from "./execution/host-seams.ts";

export type {
	BranchLandingPlan,
	CurrentWorktreeConflict,
	DescendantMaintenancePlan,
	IsolatedPullRequestLandingTarget,
	LandCommandResult,
	LandContext,
	LandedChunk,
	LandedPullRequest,
	LandGitGateway,
	LandGithubPrGateway,
	LandGraphiteCommandResult,
	LandGraphiteDeleteLocalBranchResult,
	LandGraphiteGateway,
	LandGraphiteRefreshBranchResult,
	LandGraphiteRestackScope,
	LandingBoundaryFailure,
	LandingBoundaryFailureDiagnostics,
	LandingCleanupPolicy,
	LandingCleanupReport,
	LandingDomainFailure,
	LandingDomainFailureReason,
	LandingExecutionApprovals,
	LandingExecutionFailure,
	LandingExecutionReport,
	LandingExecutionResult,
	LandingFailure,
	LandingMode,
	LandingNotImplementedFailure,
	LandingOutcome,
	LandingPhase,
	LandingPhaseOutcome,
	LandingPlan,
	LandingPreflightMode,
	LandingPreflightReport,
	LandingRequest,
	LandingShape,
	LandingTarget,
	LandingWarning,
	LandOutcome,
	LandResult,
	LandWorktreeSlotFactsGateway,
	LocalBranchTip,
	ManagedSlotWorktree,
	ManualWorktreeConflict,
	MergeMaintenanceCleanupReport,
	NotifyLevel,
	PostLandingSlotCleanupReport,
	PrSubmitRequirement,
	PullRequestFacts,
	RestackRequirement,
	RetainedLocalBranchCleanup,
	SquashMergePullRequestResult,
	StackLandingTarget,
	StackSnapshot,
	WorkingTreeStatus,
	WorktreeClassification,
	WorktreeConflict,
	WorktreeEntry,
} from "./types.ts";

export type { StackLandingShape } from "./preflight.ts";
