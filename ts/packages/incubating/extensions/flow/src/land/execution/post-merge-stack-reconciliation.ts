import type {
	LandedPullRequest,
	LandingFailure,
	LandingPhase,
	LandingPhaseOutcome,
	LandingPlan,
} from "../types.ts";
import type { LandExecutionContext } from "./execution-context.ts";
import { reconcilePostTargetSurvivors } from "./reconciliation.ts";
import { planPostMergeStackReconciliation } from "./reconciliation-plan.ts";
import type { MergeLoopState } from "./merge-loop.ts";

interface RunPostMergeStackReconciliationOptions {
	readonly plan: LandingPlan;
	readonly landed: readonly LandedPullRequest[];
	readonly state: MergeLoopState;
}

export type PostMergeStackReconciliationResult =
	| { readonly type: "completed"; readonly phases: readonly LandingPhaseOutcome[] }
	| {
			readonly type: "halted";
			readonly phases: readonly LandingPhaseOutcome[];
			readonly phase: Extract<LandingPhase, "post-merge-stack-reconciliation">;
			readonly failure: LandingFailure;
	  };

/** Reconciles surviving stack and records phase outcomes as each operation finishes. */
export async function runPostMergeStackReconciliation(
	executionContext: LandExecutionContext,
	options: RunPostMergeStackReconciliationOptions,
): Promise<PostMergeStackReconciliationResult> {
	const phases: LandingPhaseOutcome[] = [];
	const plan = planPostMergeStackReconciliation(options.plan);
	const reconciliation = await reconcilePostTargetSurvivors(
		executionContext,
		options.plan,
		options.landed,
		options.state,
	);
	if (plan.mode === "none") {
		phases.push(
			skipped("post-merge-stack-reconciliation", "no surviving branches require reconciliation"),
		);
	} else if (reconciliation.kind !== "halt") {
		phases.push(completed("post-merge-stack-reconciliation"));
	}

	if (reconciliation.kind === "halt") {
		return {
			type: "halted",
			phases,
			phase: "post-merge-stack-reconciliation",
			failure: reconciliation.failure,
		};
	}

	return { type: "completed", phases };
}

function completed(phase: LandingPhase): LandingPhaseOutcome {
	return { type: "completed", phase };
}

function skipped(phase: LandingPhase, reason: string): LandingPhaseOutcome {
	return { type: "skipped", phase, reason };
}
