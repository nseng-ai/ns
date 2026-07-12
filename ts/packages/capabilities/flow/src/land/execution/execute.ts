import { landingExecutionFailure } from "../results.ts";
import type {
	LandContext,
	LandedChunk,
	LandedPullRequest,
	LandingCleanupOutcome,
	LandingFailure,
	LandingPhase,
	LandingPhaseOutcome,
	LandingPlan,
	LandingWarning,
	ManagedSlotWorktree,
} from "../types.ts";
import type { LandConfirmationGateway, LandExecutionProgress } from "./host-seams.ts";
import { runMergeLoop } from "./merge-loop.ts";
import { confirmAndFreeManagedSlots, submitRequiredUpdatesAndRecheckPlan } from "./pre-merge.ts";

export interface LandStackExecutionHost {
	readonly confirmation: LandConfirmationGateway;
	readonly progress: LandExecutionProgress;
}

export interface ExecuteStackLandingPlanOptions {
	readonly cwd: string;
	readonly mainConfirmationAlreadyApproved?: boolean;
	readonly preMergeConfirmationAlreadyApproved?: boolean;
	readonly warnings?: readonly LandingWarning[];
}

export interface StackLandingExecutionValue {
	readonly plan: LandingPlan;
	readonly phases: readonly LandingPhaseOutcome[];
	readonly landed: readonly LandedPullRequest[];
	readonly landedChunks: readonly LandedChunk[];
	readonly warnings: readonly LandingWarning[];
	readonly cleanup: LandingCleanupOutcome;
}

export type StackLandingExecutionResult =
	| { readonly type: "success"; readonly value: StackLandingExecutionValue }
	| ({
			readonly type: "failure";
			readonly failure: LandingFailure;
	  } & Omit<StackLandingExecutionValue, "plan"> & { readonly plan: LandingPlan });

export async function executeStackLandingPlan(
	context: LandContext,
	host: LandStackExecutionHost,
	plan: LandingPlan,
	options: ExecuteStackLandingPlanOptions,
): Promise<StackLandingExecutionResult> {
	const phases: LandingPhaseOutcome[] = [];
	const initialWarnings = [...(options.warnings ?? [])];
	const emptyCleanup: LandingCleanupOutcome = { retainedLocalBranches: [], freedSlots: [] };

	if (!options.mainConfirmationAlreadyApproved) {
		const decision = await host.confirmation.confirm({ kind: "main-landing", plan });
		if (decision.type !== "approved") {
			const failure =
				decision.type === "declined"
					? landingExecutionFailure("Cancelled before merge; no PRs were landed.", {
							level: "info",
							outcome: "refusal",
							refusalReason: "declined",
						})
					: decision.failure;
			return executionFailure(plan, phases, "merge", failure, [], initialWarnings, emptyCleanup);
		}
	}

	host.progress.note(formatPreparingLandingMilestone(plan));
	let readyPlan = plan;
	let freedSlots: readonly ManagedSlotWorktree[] | undefined =
		plan.managedSlotConflicts.length === 0 ? [] : undefined;
	if (plan.managedSlotConflicts.length > 0) {
		const freed = await confirmAndFreeManagedSlots({
			context,
			host,
			plan,
			...(options.preMergeConfirmationAlreadyApproved === undefined
				? {}
				: { confirmationAlreadyApproved: options.preMergeConfirmationAlreadyApproved }),
		});
		if (freed.type === "failure") {
			return executionFailure(
				plan,
				phases,
				"submit-preparation",
				freed.failure,
				[],
				initialWarnings,
				emptyCleanup,
			);
		}
		freedSlots = [...plan.managedSlotConflicts];
	}
	if (plan.prSubmitRequirements.length > 0) {
		const submitted = await submitRequiredUpdatesAndRecheckPlan({
			context,
			host,
			cwd: options.cwd,
			plan,
			...(options.preMergeConfirmationAlreadyApproved === undefined
				? {}
				: { confirmationAlreadyApproved: options.preMergeConfirmationAlreadyApproved }),
		});
		if (submitted.type === "failure") {
			return executionFailure(
				plan,
				phases,
				"submit-preparation",
				submitted.failure,
				[],
				initialWarnings,
				{ retainedLocalBranches: [], freedSlots: freedSlots ?? [] },
			);
		}
		readyPlan = submitted.value;
	}
	if (plan.managedSlotConflicts.length > 0 || plan.prSubmitRequirements.length > 0) {
		phases.push({ type: "completed", phase: "submit-preparation" });
	}

	const mergeOutcome = await runMergeLoop({
		context,
		progress: host.progress,
		plan: readyPlan,
		warnings: initialWarnings,
	});
	if (mergeOutcome.type === "failure") {
		return executionFailure(
			readyPlan,
			phases,
			"merge",
			mergeOutcome.failure,
			mergeOutcome.landed,
			mergeOutcome.warnings,
			{
				retainedLocalBranches: mergeOutcome.cleanup.retainedLocalBranches,
				freedSlots: freedSlots ?? [],
			},
		);
	}

	phases.push({ type: "completed", phase: "merge" });
	if (readyPlan.descendantMaintenance.type === "none") {
		phases.push({
			type: "skipped",
			phase: "descendant-maintenance",
			reason: "no descendant branches require maintenance",
		});
	} else {
		phases.push({ type: "completed", phase: "descendant-maintenance" });
	}
	phases.push({ type: "completed", phase: "cleanup" });
	const cleanup: LandingCleanupOutcome = {
		retainedLocalBranches: mergeOutcome.value.cleanup.retainedLocalBranches,
		freedSlots: freedSlots ?? [],
	};
	const value: StackLandingExecutionValue = {
		plan: readyPlan,
		phases,
		landed: mergeOutcome.value.landed,
		landedChunks: landedChunks(readyPlan, mergeOutcome.value.landed),
		warnings: mergeOutcome.value.warnings,
		cleanup,
	};
	return { type: "success", value };
}

function executionFailure(
	plan: LandingPlan,
	completedPhases: readonly LandingPhaseOutcome[],
	phase: LandingPhase,
	failure: LandingFailure,
	landed: readonly LandedPullRequest[],
	warnings: readonly LandingWarning[],
	cleanup: LandingCleanupOutcome,
): StackLandingExecutionResult {
	return {
		type: "failure",
		failure,
		plan,
		phases: [...completedPhases, { type: "failed", phase, failure }],
		landed: [...landed],
		landedChunks: landedChunks(plan, landed),
		warnings: [...warnings],
		cleanup,
	};
}

function landedChunks(
	plan: LandingPlan,
	landed: readonly LandedPullRequest[],
): readonly LandedChunk[] {
	return landed.length === 0
		? []
		: [{ index: 0, landingTargetBranch: plan.stack.landingTargetBranch, landed: [...landed] }];
}

function formatPreparingLandingMilestone(plan: LandingPlan): string {
	return `Preparing to land ${plan.stack.landingBranches.length} PR${plan.stack.landingBranches.length === 1 ? "" : "s"} through ${plan.stack.landingTargetBranch}...`;
}
