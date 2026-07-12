import type {
	LandingFailure,
	LandingPlan,
	ManagedSlotWorktree,
	PrSubmitRequirement,
	RestackRequirement,
	LandedPullRequest,
} from "../types.ts";

export type LandConfirmationRequest =
	| { readonly kind: "main-landing"; readonly plan: LandingPlan }
	| { readonly kind: "free-managed-slots"; readonly slots: readonly ManagedSlotWorktree[] }
	| {
			readonly kind: "submit-required-updates";
			readonly landingTargetBranch: string;
			readonly restackTarget?: string;
			readonly requirements: readonly PrSubmitRequirement[];
			readonly restackRequirements: readonly RestackRequirement[];
	  }
	| {
			readonly kind: "post-landing-cleanup";
			readonly branch: string;
			readonly repoRoot: string;
			readonly slotName: string;
			readonly localBranchDisposition: "delete" | "keep-trunk";
	  };

export type LandConfirmationDecision =
	| { readonly type: "approved" }
	| { readonly type: "declined" }
	| { readonly type: "refused-with-fully-worded-failure"; readonly failure: LandingFailure };

export interface LandConfirmationGateway {
	confirm(request: LandConfirmationRequest): Promise<LandConfirmationDecision>;
}

export function createRefusingLandConfirmationGateway(
	failure: LandingFailure,
): LandConfirmationGateway {
	return {
		confirm: async () => ({ type: "refused-with-fully-worded-failure", failure }),
	};
}

export const nullLandConfirmationGateway: LandConfirmationGateway =
	createRefusingLandConfirmationGateway({
		type: "execution",
		level: "error",
		message: "Landing confirmation is unavailable; refusing to continue without approval.",
		outcome: "refusal",
		refusalReason: "non-interactive",
	});

export type LandExecutionStep = "gate" | "merge" | "verify" | "restack";

/** States execution can assign after a matrix row has been initialized as pending. */
export type LandExecutionStepState = "active" | "done" | "skipped" | "failed";

export interface LandExecutionProgress {
	readonly note: (message: string) => void;
	readonly setStatus: (message: string | undefined) => void;
	readonly setStep: (
		branch: string,
		step: LandExecutionStep,
		state: LandExecutionStepState,
	) => void;
	readonly recordMergedPullRequest: (pullRequest: LandedPullRequest) => void;
	readonly planRecalculated: (plan: LandingPlan) => void;
}

function ignoreProgress(): void {}

export const nullLandExecutionProgress: LandExecutionProgress = {
	note: ignoreProgress,
	setStatus: ignoreProgress,
	setStep: ignoreProgress,
	recordMergedPullRequest: ignoreProgress,
	planRecalculated: ignoreProgress,
};
