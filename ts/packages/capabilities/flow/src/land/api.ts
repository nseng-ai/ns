import { calculateLandingOutcome } from "./preflight.ts";
import { nullLandConfirmationGateway, nullLandExecutionProgress } from "./execution/host-seams.ts";
import type { LandStackExecutionHost } from "./execution/execute.ts";
import type { LandContext, LandingOutcome, LandingRequest, LandResult } from "./types.ts";

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
 * Stack-first land-domain entry point. This package owns renderer-independent preflight and dry-run
 * planning; Flow still owns mutation-heavy merge execution while migration continues.
 */
export async function executeLanding(
	context: LandContext,
	request: LandingRequest,
	host: LandStackExecutionHost = {
		confirmation: nullLandConfirmationGateway,
		progress: nullLandExecutionProgress,
	},
): Promise<LandResult<LandingOutcome>> {
	return await calculateLandingOutcome(context, request, host);
}

export {
	buildDescendantMaintenancePlan,
	buildStackLandingPlan,
	calculateLandingOutcome,
	collectPrSubmitRequirements,
	collectSubmitRestackRequirements,
	detectWorktreeConflicts,
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
export { executeStackLandingPlan } from "./execution/execute.ts";
export type {
	ExecuteStackLandingPlanOptions,
	LandStackExecutionHost,
	StackLandingExecutionResult,
	StackLandingExecutionValue,
} from "./execution/execute.ts";
export { executeIsolatedLanding, isIsolatedFastPath } from "./execution/isolated-landing.ts";
export {
	assertCleanRepoForExecution,
	confirmAndFreeManagedSlots,
	confirmAndSubmitRequiredPrUpdates,
	executionOperationInProgressLabel,
	residualPreMergeFailure,
	submitRequiredUpdatesAndRecheckPlan,
} from "./execution/pre-merge.ts";
export type { PreMergeExecutionHost } from "./execution/pre-merge.ts";
export type {
	ExecuteIsolatedLandingOptions,
	IsolatedLandingHost,
	IsolatedLandingOutcome,
} from "./execution/isolated-landing.ts";

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
	LandingCleanupMode,
	LandingCleanupOutcome,
	LandingDomainFailure,
	LandingDomainFailureReason,
	LandingExecutionFailure,
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
	NotifyLevel,
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

export type { DetectWorktreeConflictsOptions, StackLandingShape } from "./preflight.ts";
