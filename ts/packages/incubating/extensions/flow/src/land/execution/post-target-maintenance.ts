import type {
	LandedPullRequest,
	LandingFailure,
	LandingPhase,
	LandingPhaseOutcome,
	LandingPlan,
	LandingWarning,
} from "../types.ts";
import type { LandExecutionContext } from "./execution-context.ts";
import { cleanUpLandedBranches, reconcilePostTargetSurvivors } from "./maintenance.ts";
import { planPostTargetMaintenance } from "./maintenance-plan.ts";
import type { MergeLoopState } from "./merge-loop.ts";

interface RunPostTargetMaintenanceOptions {
	readonly plan: LandingPlan;
	readonly landed: readonly LandedPullRequest[];
	readonly state: MergeLoopState;
	readonly shouldReconcileSurvivors: boolean;
	readonly shouldCleanUpLandedBranches: boolean;
}

export type PostTargetMaintenanceResult =
	| { readonly type: "completed"; readonly phases: readonly LandingPhaseOutcome[] }
	| {
			readonly type: "halted";
			readonly phases: readonly LandingPhaseOutcome[];
			readonly phase: Extract<
				LandingPhase,
				"post-target-maintenance" | "descendant-maintenance" | "merge-maintenance-cleanup"
			>;
			readonly failure: LandingFailure;
	  };

/** Runs selected post-target work and records phase outcomes as each operation finishes. */
export async function runPostTargetMaintenance(
	executionContext: LandExecutionContext,
	options: RunPostTargetMaintenanceOptions,
): Promise<PostTargetMaintenanceResult> {
	const phases: LandingPhaseOutcome[] = [];
	const maintenance = planPostTargetMaintenance(options.plan);
	if (!options.shouldReconcileSurvivors) {
		const survivors = postTargetSurvivors(options.plan);
		if (survivors.length > 0) {
			options.state.warnings.push(manualSurvivorMaintenanceWarning(options.plan, survivors));
		}
		if (maintenance.mode === "required-next-landing") {
			phases.push(
				skipped("post-target-maintenance", "surviving branch maintenance left for manual action"),
				skipped("descendant-maintenance", "no descendant branches require maintenance"),
			);
		} else if (maintenance.mode === "none") {
			phases.push(
				skipped("post-target-maintenance", "no remaining landing branches require maintenance"),
				skipped("descendant-maintenance", "no descendant branches require maintenance"),
			);
		} else {
			phases.push(
				skipped("post-target-maintenance", "no remaining landing branches require maintenance"),
				skipped("descendant-maintenance", "descendant maintenance left for manual action"),
			);
		}
		phases.push(
			skipped("merge-maintenance-cleanup", "preserve policy performs no post-target cleanup"),
		);
		return { type: "completed", phases };
	}

	const reconciliation = await reconcilePostTargetSurvivors(executionContext, options);
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
			phase: reconciliation.phase,
			failure: reconciliation.failure,
		};
	}

	if (!options.shouldCleanUpLandedBranches) {
		phases.push(skipped("merge-maintenance-cleanup", "landed branch cleanup was not selected"));
		return { type: "completed", phases };
	}

	const cleanup = await cleanUpLandedBranches(executionContext, options);
	if (cleanup.kind === "halt") {
		return {
			type: "halted",
			phases,
			phase: cleanup.phase,
			failure: cleanup.failure,
		};
	}
	phases.push(completed("merge-maintenance-cleanup"));
	return { type: "completed", phases };
}

function postTargetSurvivors(plan: LandingPlan): readonly string[] {
	return [
		...plan.stack.remainingLandingBranches,
		...(plan.descendantMaintenance.type === "none" ? [] : plan.descendantMaintenance.branches),
	];
}

function manualSurvivorMaintenanceWarning(
	plan: LandingPlan,
	survivors: readonly string[],
): LandingWarning {
	const firstSurvivor = survivors[0];
	if (firstSurvivor === undefined)
		throw new Error("Manual survivor maintenance requires a branch.");
	const commandDisplay = `gt get ${firstSurvivor} --downstack --no-restack --no-checkout --force --no-interactive`;
	return {
		level: "warning",
		message: `Surviving branches remain open for manual maintenance: ${survivors.join(", ")}. Start with ${firstSurvivor}; refresh, restack, and submit were not attempted after the final selected PR.`,
		commandDisplay,
		suggestedAction: `From the worktree that has ${plan.stack.trunk} checked out, run ${commandDisplay}; then inspect, restack, and update the surviving stack.`,
		notificationAction: `Maintain surviving branch ${firstSurvivor} manually from the ${plan.stack.trunk} worktree.`,
	};
}

function completed(phase: LandingPhase): LandingPhaseOutcome {
	return { type: "completed", phase };
}

function skipped(phase: LandingPhase, reason: string): LandingPhaseOutcome {
	return { type: "skipped", phase, reason };
}
