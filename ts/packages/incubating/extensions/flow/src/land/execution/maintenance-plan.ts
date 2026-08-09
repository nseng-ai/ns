import { LAND_BACKUP_RECOVERY_HINT } from "../graphite-operations.ts";
import type { DescendantMaintenancePlan, LandingExecutionFailure, LandingPlan } from "../types.ts";
import { landingExecutionFailure } from "../results.ts";
import type { CheckedOutElsewhere } from "../graphite-operations.ts";
import { formatConflict, slotNameFromPath } from "../worktree-paths.ts";

export type MaintenanceMode =
	| "required-next-landing"
	| "required-descendants"
	| "none"
	| "blocked-descendants";

export type MaintenanceTargetPlan =
	| { readonly mode: "required-next-landing"; readonly branches: readonly string[] }
	| { readonly mode: "required-descendants"; readonly branches: readonly string[] }
	| { readonly mode: "none"; readonly branches: readonly [] }
	| { readonly mode: "blocked-descendants"; readonly branches: readonly [] };

export type RequiredNextLandingMaintenance = Extract<
	MaintenanceTargetPlan,
	{ mode: "required-next-landing" }
>;

export type RequiredDescendantMaintenance = Extract<
	MaintenanceTargetPlan,
	{ mode: "required-descendants" }
>;

export type NoMaintenance = Extract<MaintenanceTargetPlan, { mode: "none" }>;

export function planGraphiteMaintenanceTargets(
	plan: LandingPlan,
	index: number,
): MaintenanceTargetPlan {
	const nextLandingBranch = plan.stack.landingBranches[index + 1];
	if (nextLandingBranch !== undefined) {
		return { mode: "required-next-landing", branches: [nextLandingBranch] };
	}
	return planPostTargetMaintenance(plan);
}

export function planPostTargetMaintenance(plan: LandingPlan): MaintenanceTargetPlan {
	const nextFutureLandingBranch = plan.stack.remainingLandingBranches[0];
	if (nextFutureLandingBranch !== undefined) {
		return { mode: "required-next-landing", branches: [nextFutureLandingBranch] };
	}
	if (plan.descendantMaintenance.type === "auto") {
		return {
			mode: "required-descendants",
			branches: plan.descendantMaintenance.targetBranches,
		};
	}
	if (plan.descendantMaintenance.type === "blocked") {
		return { mode: "blocked-descendants", branches: [] };
	}
	return { mode: "none", branches: [] };
}

export function refreshTargetsAfterMaintainedBranch(
	plan: LandingPlan,
	maintainedBranch: string,
): readonly string[] {
	const refreshOrder = refreshTargetOrder(plan);
	const maintainedIndex = refreshOrder.indexOf(maintainedBranch);
	if (maintainedIndex < 0) return [];
	const downstreamTargets = refreshOrder.slice(maintainedIndex + 1);
	if (downstreamTargets.length === 0) return [];

	if (isDescendantMaintenanceRoot(plan, maintainedBranch)) {
		// Descendant roots are siblings above the landed branch. Restacking one root
		// should not rewrite another root's local SHA expectation.
		return [];
	}

	const next = downstreamTargets[0];
	if (next === undefined) return [];
	if (isDescendantMaintenanceRoot(plan, next)) return downstreamTargets;
	return [next];
}

/**
 * Required completion failure for a landing whose descendants were disclosed as blocked by other
 * worktree checkouts. The parent merge was explicitly consented to, but the landing is only
 * partially complete: nothing was mutated in the blocked checkouts and the landed local branch
 * was retained.
 */
export function blockedDescendantMaintenanceFailure(
	plan: LandingPlan,
	branch: string,
	prNumber: number,
): LandingExecutionFailure {
	const maintenance = plan.descendantMaintenance;
	if (maintenance.type !== "blocked") {
		return landingExecutionFailure(
			`PR #${prNumber} merged, but required descendant reconciliation for ${branch} could not run.`,
			{
				failedBranch: branch,
				failedPrNumber: prNumber,
				suggestedAction: `Inspect the stack, restack/update descendant PRs manually, and delete local branch ${branch} when safe. ${LAND_BACKUP_RECOVERY_HINT}`,
			},
		);
	}

	const conflictText = maintenance.conflicts.map(formatConflict).join("; ");
	return landingExecutionFailure(
		`PR #${prNumber} merged, but descendant maintenance was deferred because ${maintenance.reason}: ${conflictText}. Descendant branches ${maintenance.branches.join(", ")} were not restacked or updated, and local branch ${branch} was retained; the landing is only partially complete.`,
		{
			failedBranch: branch,
			failedPrNumber: prNumber,
			suggestedAction: `${blockedDescendantRepairAction(maintenance)} Then delete local branch ${branch} manually when safe. ${LAND_BACKUP_RECOVERY_HINT}`,
		},
	);
}

export function formatCheckedOutElsewhere(checkoutConflict: CheckedOutElsewhere): string {
	return `${checkoutConflict.branch} is checked out at ${checkoutConflict.path}`;
}

export function formatRestackFailureMessage(
	previousPrNumber: number,
	branch: string,
	shouldStopBeforeAnotherMerge: boolean,
): string {
	return formatMaintenanceFailureMessage({
		operation: "Restack",
		manualAction: "manual restack/update",
		previousPrNumber,
		branch,
		shouldStopBeforeAnotherMerge,
	});
}

export function formatSubmitFailureMessage(
	previousPrNumber: number,
	branch: string,
	shouldStopBeforeAnotherMerge: boolean,
): string {
	return formatMaintenanceFailureMessage({
		operation: "Submit/update",
		manualAction: "manual PR update",
		previousPrNumber,
		branch,
		shouldStopBeforeAnotherMerge,
	});
}

function formatMaintenanceFailureMessage(input: {
	operation: "Restack" | "Submit/update";
	manualAction: "manual restack/update" | "manual PR update";
	previousPrNumber: number;
	branch: string;
	shouldStopBeforeAnotherMerge: boolean;
}): string {
	if (input.shouldStopBeforeAnotherMerge) {
		return `${input.operation} failed after merging #${input.previousPrNumber}; stopping before merging ${input.branch}.`;
	}
	return `${input.operation} failed after merging #${input.previousPrNumber}; descendant branch ${input.branch} was left for ${input.manualAction}.`;
}

function isDescendantMaintenanceRoot(plan: LandingPlan, branch: string): boolean {
	return (
		plan.descendantMaintenance.type === "auto" &&
		plan.descendantMaintenance.targetBranches.includes(branch)
	);
}

function refreshTargetOrder(plan: LandingPlan): readonly string[] {
	return [
		...plan.stack.landingBranches,
		...plan.stack.remainingLandingBranches,
		...(plan.descendantMaintenance.type === "auto"
			? plan.descendantMaintenance.targetBranches
			: []),
	];
}

export function blockedDescendantRepairAction(
	maintenance: Extract<DescendantMaintenancePlan, { type: "blocked" }>,
): string {
	const branches = maintenance.branches.join(", ");
	const conflict = maintenance.conflicts[0];
	if (conflict === undefined) {
		return `Restack/update ${branches}.`;
	}

	if (maintenance.conflicts.length > 1) {
		return `Free/detach ${maintenance.conflicts.length} descendant worktrees; then restack/update ${branches}.`;
	}

	if (conflict.type === "managed-slot") {
		const slot = slotNameFromPath(conflict.path) ?? conflict.path;
		return `Free ${slot} for ${conflict.branch}; then restack/update ${branches}.`;
	}

	return `Detach ${conflict.path} for ${conflict.branch}; then restack/update ${branches}.`;
}
