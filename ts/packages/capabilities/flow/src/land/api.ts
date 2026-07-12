import {
	executeLandingRequest,
	type ExecuteLandingOptions,
	type LandStackExecutionHost,
} from "./execution/execute.ts";
import { nullLandConfirmationGateway, nullLandExecutionProgress } from "./execution/host-seams.ts";
import type { LandContext, LandingExecutionResult, LandingRequest } from "./types.ts";

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

/**
 * Canonical stack-landing execution entrypoint. Owns discovery, preflight planning, confirmation,
 * pre-merge preparation, merge execution, and post-landing managed-slot cleanup, and returns a
 * {@link LandingExecutionResult} whose report carries the facts observed up to every exit.
 */
export async function executeLanding(
	context: LandContext,
	request: LandingRequest,
	host: LandStackExecutionHost = {
		confirmation: nullLandConfirmationGateway,
		progress: nullLandExecutionProgress,
	},
	options: ExecuteLandingOptions = {},
): Promise<LandingExecutionResult> {
	return await executeLandingRequest(context, request, host, options);
}

export type { ExecuteLandingOptions, LandStackExecutionHost } from "./execution/execute.ts";

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
