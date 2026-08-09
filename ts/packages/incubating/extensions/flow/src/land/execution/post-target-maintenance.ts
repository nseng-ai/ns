import type {
	LandedPullRequest,
	LandingFailure,
	LandingPhase,
	LandingPhaseOutcome,
	LandingPlan,
} from "../types.ts";
import type { LandExecutionContext } from "./execution-context.ts";
import { reconcilePostTargetSurvivors } from "./maintenance.ts";
import { planPostTargetMaintenance } from "./maintenance-plan.ts";
import type { MergeLoopState } from "./merge-loop.ts";

interface RunPostTargetMaintenanceOptions {
	readonly plan: LandingPlan;
	readonly landed: readonly LandedPullRequest[];
	readonly state: MergeLoopState;
}

export type PostTargetMaintenanceResult =
	| { readonly type: "completed"; readonly phases: readonly LandingPhaseOutcome[] }
	| {
			readonly type: "halted";
			readonly phases: readonly LandingPhaseOutcome[];
			readonly phase: Extract<LandingPhase, "post-target-maintenance" | "descendant-maintenance">;
			readonly failure: LandingFailure;
	  };

/** Reconciles post-target survivors and records phase outcomes as each operation finishes. */
export async function runPostTargetMaintenance(
	executionContext: LandExecutionContext,
	options: RunPostTargetMaintenanceOptions,
): Promise<PostTargetMaintenanceResult> {
	const phases: LandingPhaseOutcome[] = [];
	const maintenance = planPostTargetMaintenance(options.plan);
	const reconciliation = await reconcilePostTargetSurvivors(
		executionContext,
		options.plan,
		options.landed,
		options.state,
	);
	if (maintenance.mode === "none") {
		phases.push(
			skipped("post-target-maintenance", "no remaining landing branches require maintenance"),
			skipped("descendant-maintenance", "no descendant branches require maintenance"),
		);
	} else if (maintenance.mode === "required-next-landing") {
		if (reconciliation.kind !== "halt") {
			phases.push(
				completed("post-target-maintenance"),
				skipped("descendant-maintenance", "no descendant branches require maintenance"),
			);
		}
	} else {
		phases.push(
			skipped("post-target-maintenance", "no remaining landing branches require maintenance"),
		);
		if (maintenance.mode === "required-descendants" && reconciliation.kind !== "halt") {
			phases.push(completed("descendant-maintenance"));
		}
	}

	if (reconciliation.kind === "halt") {
		return {
			type: "halted",
			phases,
			phase:
				reconciliation.phase === "merge-maintenance-cleanup"
					? "post-target-maintenance"
					: reconciliation.phase,
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
