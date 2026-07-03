import { calculateLandingOutcome } from "./preflight.ts";
import type { LandContext, LandingOutcome, LandingRequest, LandResult } from "./types.ts";

// Public API identifiers intentionally mirror package metadata; tests guard the invariant
// instead of reading package metadata at runtime.
export const LAND_CAPABILITY_ID = "land";
export const LAND_PACKAGE_NAME = "sdl-flow";

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
): Promise<LandResult<LandingOutcome>> {
	return await calculateLandingOutcome(context, request);
}

export {
	buildDescendantMaintenancePlan,
	buildStackLandingPlan,
	calculateLandingOutcome,
	collectPrSubmitRequirements,
	collectSubmitRestackRequirements,
	landingParentEdges,
	scopeStackSnapshot,
	validateStrictMergeGate,
} from "./preflight.ts";

export {
	isLandFailure,
	landCompleted,
	landFailure,
	landOutcomeFailure,
	landSuccess,
} from "./results.ts";

export type {
	BranchLandingPlan,
	CurrentWorktreeConflict,
	DescendantMaintenancePlan,
	IsolatedPullRequestLandingTarget,
	LandContext,
	LandedChunk,
	LandedPullRequest,
	LandGitGateway,
	LandGithubPrFactsGateway,
	LandGraphiteGateway,
	LandingBoundaryFailure,
	LandingCleanupMode,
	LandingCleanupOutcome,
	LandingDomainFailure,
	LandingDomainFailureReason,
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
