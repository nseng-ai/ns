import { formatCommand } from "@nseng-ai/foundation/command";

import {
	formatGraphiteOperation,
	restackOperation,
	restackTargetForSubmit,
	submitUpdateOperation,
} from "../graphite-operations.ts";
import {
	buildStackLandingPlan,
	collectSubmitRestackRequirements,
	detectWorktreeConflicts,
} from "../preflight.ts";
import { formatPrSubmitRequirementLine } from "../confirmation-commands.ts";
import {
	landCompleted,
	landFailure,
	landingCancelledBeforeMergeFailure,
	landingExecutionFailure,
	landOutcomeFailure,
	landSuccess,
	withSuggestedAction,
} from "../results.ts";
import { operationInProgressLabel } from "../working-tree-operations.ts";

import type {
	LandContext,
	LandingFailure,
	LandingPlan,
	LandOutcome,
	LandResult,
	ManagedSlotWorktree,
	PrSubmitRequirement,
	RestackRequirement,
	WorktreeConflict,
} from "../types.ts";
import {
	formatConflict,
	formatSlotConflict,
	slotFreeArgs,
	slotNameFromPath,
} from "../worktree-paths.ts";
import type { LandConfirmationGateway, LandExecutionProgress } from "./host-seams.ts";

export interface PreMergeExecutionHost {
	readonly confirmation: LandConfirmationGateway;
	readonly progress: LandExecutionProgress;
}

export async function confirmAndFreeManagedSlots(options: {
	readonly context: LandContext;
	readonly host: PreMergeExecutionHost;
	readonly plan: LandingPlan;
}): Promise<LandResult<readonly ManagedSlotWorktree[]>> {
	const slots = options.plan.managedSlotConflicts.map(toManagedSlotWorktree);
	const decision = await options.host.confirmation.confirm({ kind: "free-managed-slots", slots });
	if (decision.type === "declined") return landFailure(landingCancelledBeforeMergeFailure());
	if (decision.type === "refused-with-fully-worded-failure") return landFailure(decision.failure);

	options.host.progress.setStatus("freeing landing slots...");
	const result = await options.context.worktrees.freeSlots({
		repoRoot: options.plan.repoRoot,
		slots,
	});
	if (result.type === "failure") return landFailure(preMergeSlotFailure(result.failure));

	options.host.progress.setStatus("rechecking landing worktrees...");
	const cleanRepo = await assertCleanRepoForExecution(options.context, options.plan.repoRoot);
	if (cleanRepo.type === "failure") return cleanRepo;
	const conflicts = await detectWorktreeConflicts({
		context: options.context,
		repoRoot: options.plan.repoRoot,
		currentBranch: options.plan.stack.actualCurrentBranch,
		relevantBranches: options.plan.stack.landingBranches,
	});
	if (conflicts.type === "failure") return conflicts;
	const remaining = conflicts.value.filter((conflict) => conflict.type !== "current");
	if (remaining.length > 0) {
		return landFailure(
			landingExecutionFailure(
				[
					"ns slot free completed, but landing branches are still checked out in other worktrees.",
					...remaining.map((conflict) => `- ${formatConflict(conflict)}`),
					"No PRs were landed.",
				].join("\n"),
				{
					suggestedAction:
						"Resolve the remaining landing-branch worktree checkouts manually, then rerun /ns:flow:land.",
				},
			),
		);
	}
	return landSuccess(slots);
}

export async function confirmAndSubmitRequiredPrUpdates(options: {
	readonly context: LandContext;
	readonly host: PreMergeExecutionHost;
	readonly plan: LandingPlan;
}): Promise<LandResult<void>> {
	const { context, host, plan } = options;
	const restackTarget = restackTargetForSubmit(plan);
	const decision = await host.confirmation.confirm({
		kind: "submit-required-updates",
		landingTargetBranch: plan.stack.landingTargetBranch,
		...(restackTarget === undefined ? {} : { restackTarget }),
		requirements: plan.prSubmitRequirements,
		restackRequirements: plan.submitRestackRequirements,
	});
	if (decision.type === "declined") return landFailure(landingCancelledBeforeMergeFailure());
	if (decision.type === "refused-with-fully-worded-failure") return landFailure(decision.failure);

	const submitOperation = submitUpdateOperation({ branch: plan.stack.landingTargetBranch });
	if (restackTarget !== undefined) {
		const restackForSubmitOperation = restackOperation({ branch: restackTarget, scope: "upstack" });
		host.progress.setStatus(`restacking ${restackTarget}...`);
		const restacked = await context.graphite.prepareRestackForSubmit({
			repoRoot: plan.repoRoot,
			branch: restackTarget,
		});
		if (restacked.type === "failure") {
			return landFailure(
				withSuggestedAction(
					restacked.failure,
					`Resolve the restack failure, run ${formatGraphiteOperation(restackForSubmitOperation)} and ${formatGraphiteOperation(submitOperation)} manually if appropriate, then rerun /ns:flow:land.`,
				),
			);
		}
		host.progress.setStatus("verifying restack...");
		const remaining = await collectSubmitRestackRequirements(context, plan.repoRoot, plan.stack);
		if (remaining.type === "failure") return remaining;
		if (remaining.value.length > 0) {
			return landFailure(
				landingExecutionFailure(formatRemainingSubmitRestackRequirements(remaining.value), {
					suggestedAction:
						"Free or detach the holding worktrees, restack the stack, then rerun /ns:flow:land.",
				}),
			);
		}
	}

	host.progress.setStatus(`submitting ${plan.stack.landingTargetBranch}...`);
	const submitted = await context.graphite.prepareSubmitUpdate({
		repoRoot: plan.repoRoot,
		branch: plan.stack.landingTargetBranch,
	});
	if (submitted.type === "failure") {
		return landFailure(
			withSuggestedAction(
				submitted.failure,
				`Resolve the submit failure, run ${formatGraphiteOperation(submitOperation)} manually if appropriate, then rerun /ns:flow:land.`,
			),
		);
	}
	return landSuccess(undefined);
}

export async function submitRequiredUpdatesAndRecheckPlan(options: {
	readonly context: LandContext;
	readonly host: PreMergeExecutionHost;
	readonly cwd: string;
	readonly plan: LandingPlan;
}): Promise<LandResult<LandingPlan>> {
	const submitted = await confirmAndSubmitRequiredPrUpdates(options);
	if (submitted.type === "failure") return submitted;
	options.host.progress.note("Rechecking landing preflight...");
	options.host.progress.setStatus("rechecking preflight...");
	const rechecked = await buildStackLandingPlan(options.context, options.cwd, {
		shouldAllowSubmitRequiredState: true,
		landingBranchLimit: options.plan.stack.landingBranches.length,
	});
	if (rechecked.type === "failure") return rechecked;
	options.host.progress.planRecalculated(rechecked.value);
	const residualFailure = residualPreMergeFailure(rechecked.value);
	return residualFailure === undefined
		? landSuccess(rechecked.value)
		: landFailure(residualFailure);
}

export function residualPreMergeFailure(plan: LandingPlan): LandingFailure | undefined {
	if (plan.managedSlotConflicts.length > 0) {
		return landingExecutionFailure(formatRemainingManagedSlotConflicts(plan.managedSlotConflicts), {
			suggestedAction: `Run ${formatCommand("ns", ["slot", ...slotFreeArgs(plan.managedSlotConflicts)])} manually, inspect worktrees, and rerun /ns:flow:land.`,
		});
	}
	if (plan.prSubmitRequirements.length > 0) {
		return landingExecutionFailure(formatRemainingSubmitRequirements(plan.prSubmitRequirements), {
			suggestedAction: `Run ${formatGraphiteOperation({ kind: "submit-update", branch: plan.stack.landingTargetBranch })} manually, inspect PR heads, and rerun /ns:flow:land.`,
		});
	}
	return undefined;
}

export async function assertCleanRepoForExecution(
	context: LandContext,
	repoRoot: string,
): Promise<LandOutcome> {
	const status = await context.git.workingTreeStatus({ repoRoot });
	if (status.type === "failure") return status;
	if (!status.value.isClean) {
		return landOutcomeFailure(
			landingExecutionFailure("Working tree is dirty; refusing to start stack landing."),
		);
	}
	if (status.value.inProgressOperation !== undefined) {
		return landOutcomeFailure(
			landingExecutionFailure(
				`${operationInProgressLabel(status.value.inProgressOperation)} is in progress; refusing to start stack landing.`,
			),
		);
	}
	return landCompleted();
}

function toManagedSlotWorktree(conflict: WorktreeConflict): ManagedSlotWorktree {
	const slotName =
		conflict.type === "managed-slot" ? conflict.slotName : slotNameFromPath(conflict.path);
	return {
		type: "managed-slot",
		branch: conflict.branch,
		path: conflict.path,
		...(slotName === undefined ? {} : { slotName }),
	};
}

function preMergeSlotFailure(failure: LandingFailure): LandingFailure {
	return withSuggestedAction(
		failure,
		"Inspect the slot state, free or detach blocking landing-branch worktrees manually, then rerun /ns:flow:land.",
	);
}

function formatRemainingManagedSlotConflicts(conflicts: readonly WorktreeConflict[]): string {
	return [
		"Landing branches are checked out in managed slots after submit/update.",
		"No PRs were landed.",
		"",
		...conflicts.map((conflict) => `- ${formatSlotConflict(conflict)}`),
	].join("\n");
}

function formatRemainingSubmitRequirements(requirements: readonly PrSubmitRequirement[]): string {
	return [
		"gt submit/update completed, but GitHub PR metadata still differs from local Graphite refs.",
		"No PRs were landed.",
		"",
		...requirements.map(formatPrSubmitRequirementLine),
	].join("\n");
}

function formatRemainingSubmitRestackRequirements(
	requirements: readonly RestackRequirement[],
): string {
	return [
		"gt restack completed, but these branches are still not restacked onto their parents:",
		...requirements.map((requirement) => `- ${requirement.branch} on ${requirement.parent}`),
		"",
		"gt restack exits 0 while skipping branches checked out in other worktrees.",
		"No PRs were landed; gt submit was not run.",
	].join("\n");
}
