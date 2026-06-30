import type { LandContext, LandingOutcome, LandingRequest, LandResult } from "./types.ts";

export const LAND_CAPABILITY_ID = "land";
export const LAND_PACKAGE_NAME = "sdl-land";

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
 * Stack-first land-domain entry point. The domain implementation is intentionally deferred until the
 * Flow land behavior moves into this package; callers can wire against the stable request/result
 * vocabulary without importing Flow internals.
 */
export async function executeLanding(
	context: LandContext,
	request: LandingRequest,
): Promise<LandResult<LandingOutcome>> {
	void context;
	return {
		type: "failure",
		failure: {
			type: "not-implemented",
			phase: request.mode === "dry-run" ? "dry-run" : "preflight",
			message: "sdl-land executeLanding is not implemented until Flow land behavior moves here.",
		},
	};
}

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
	StackLandingTarget,
	StackSnapshot,
	WorkingTreeStatus,
	WorktreeClassification,
	WorktreeConflict,
	WorktreeEntry,
} from "./types.ts";
