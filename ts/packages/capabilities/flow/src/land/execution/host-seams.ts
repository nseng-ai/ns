import type {
	LandingFailure,
	LandingPlan,
	ManagedSlotWorktree,
	PrSubmitRequirement,
	RestackRequirement,
	LandedPullRequest,
	PullRequestFacts,
} from "../types.ts";

export type LandConfirmationRequest =
	| { readonly kind: "main-landing"; readonly plan: LandingPlan }
	| {
			readonly kind: "isolated-main-landing";
			readonly pullRequest: PullRequestFacts;
			readonly trunk: string;
	  }
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
	| {
			readonly type: "approved";
			readonly approvalSource: "prompted" | "approved-upfront";
	  }
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

/** Status-only progress for executors that surface a single transient status line. */
export interface LandExecutionStatusProgress {
	readonly setStatus: (message: string | undefined) => void;
}

/** Message/status progress for executors that report milestones and a status line. */
export interface LandExecutionMessageProgress extends LandExecutionStatusProgress {
	readonly note: (message: string) => void;
}

/** Stack-observation events owned by canonical stack execution: per-branch step matrix, merged-PR records, and plan recalculation. */
export interface LandExecutionStackObservationProgress {
	readonly setStep: (
		branch: string,
		step: LandExecutionStep,
		state: LandExecutionStepState,
	) => void;
	readonly recordMergedPullRequest: (pullRequest: LandedPullRequest) => void;
	readonly planRecalculated: (plan: LandingPlan) => void;
}

/** Full canonical stack execution progress: the composition of message/status and stack observation. */
export type LandExecutionProgress = LandExecutionMessageProgress &
	LandExecutionStackObservationProgress;

function ignoreProgress(): void {}

export const nullLandExecutionProgress: LandExecutionProgress = {
	note: ignoreProgress,
	setStatus: ignoreProgress,
	setStep: ignoreProgress,
	recordMergedPullRequest: ignoreProgress,
	planRecalculated: ignoreProgress,
};
