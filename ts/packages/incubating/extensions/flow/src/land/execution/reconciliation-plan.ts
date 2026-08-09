import { LAND_BACKUP_RECOVERY_HINT } from "../graphite-operations.ts";
import type {
	DescendantReconciliationPlan,
	LandingExecutionFailure,
	LandingPlan,
} from "../types.ts";
import { landingExecutionFailure } from "../results.ts";
import type { CheckedOutElsewhere } from "../graphite-operations.ts";
import { formatConflict, slotNameFromPath } from "../worktree-paths.ts";

export type ReconciliationMode =
	| "required-next-landing"
	| "required-descendants"
	| "none"
	| "blocked-descendants";

export type ReconciliationTargetPlan =
	| { readonly mode: "required-next-landing"; readonly branches: readonly string[] }
	| { readonly mode: "required-descendants"; readonly branches: readonly string[] }
	| { readonly mode: "none"; readonly branches: readonly [] }
	| { readonly mode: "blocked-descendants"; readonly branches: readonly [] };

export type RequiredNextLandingReconciliation = Extract<
	ReconciliationTargetPlan,
	{ mode: "required-next-landing" }
>;

export type RequiredDescendantReconciliation = Extract<
	ReconciliationTargetPlan,
	{ mode: "required-descendants" }
>;

export type NoReconciliation = Extract<ReconciliationTargetPlan, { mode: "none" }>;

export function planPostMergeStackReconciliationTargets(
	plan: LandingPlan,
	index: number,
): ReconciliationTargetPlan {
	const nextLandingBranch = plan.stack.landingBranches[index + 1];
	if (nextLandingBranch !== undefined) {
		return { mode: "required-next-landing", branches: [nextLandingBranch] };
	}
	return planPostMergeStackReconciliation(plan);
}

export function planPostMergeStackReconciliation(plan: LandingPlan): ReconciliationTargetPlan {
	const nextFutureLandingBranch = plan.stack.remainingLandingBranches[0];
	if (nextFutureLandingBranch !== undefined) {
		return { mode: "required-next-landing", branches: [nextFutureLandingBranch] };
	}
	if (plan.descendantReconciliation.type === "auto") {
		return {
			mode: "required-descendants",
			branches: plan.descendantReconciliation.targetBranches,
		};
	}
	if (plan.descendantReconciliation.type === "blocked") {
		return { mode: "blocked-descendants", branches: [] };
	}
	return { mode: "none", branches: [] };
}

export function refreshTargetsAfterMaintainedBranch(
	plan: LandingPlan,
	reconciledBranch: string,
): readonly string[] {
	const refreshOrder = refreshTargetOrder(plan);
	const reconciledIndex = refreshOrder.indexOf(reconciledBranch);
	if (reconciledIndex < 0) return [];
	const downstreamTargets = refreshOrder.slice(reconciledIndex + 1);
	if (downstreamTargets.length === 0) return [];

	if (isDescendantReconciliationRoot(plan, reconciledBranch)) {
		// Descendant roots are siblings above the landed branch. Restacking one root
		// should not rewrite another root's local SHA expectation.
		return [];
	}

	const next = downstreamTargets[0];
	if (next === undefined) return [];
	if (isDescendantReconciliationRoot(plan, next)) return downstreamTargets;
	return [next];
}

/**
 * Required completion failure for a landing whose descendants were disclosed as blocked by other
 * worktree checkouts. The parent merge was explicitly consented to, but the landing is only
 * partially complete: nothing was mutated in the blocked checkouts and the landed local branch
 * was retained.
 */
export function blockedDescendantReconciliationFailure(
	plan: LandingPlan,
	branch: string,
	prNumber: number,
): LandingExecutionFailure {
	const reconciliation = plan.descendantReconciliation;
	if (reconciliation.type !== "blocked") {
		return landingExecutionFailure(
			`PR #${prNumber} merged, but required descendant reconciliation for ${branch} could not run.`,
			{
				failedBranch: branch,
				failedPrNumber: prNumber,
				suggestedAction: `Inspect the stack, restack/update descendant PRs manually, and delete local branch ${branch} when safe. ${LAND_BACKUP_RECOVERY_HINT}`,
			},
		);
	}

	const conflictText = reconciliation.conflicts.map(formatConflict).join("; ");
	return landingExecutionFailure(
		`PR #${prNumber} merged, but descendant reconciliation was deferred because ${reconciliation.reason}: ${conflictText}. Descendant branches ${reconciliation.branches.join(", ")} were not restacked or updated, and local branch ${branch} was retained; the landing is only partially complete.`,
		{
			failedBranch: branch,
			failedPrNumber: prNumber,
			suggestedAction: `${blockedDescendantRepairAction(reconciliation)} Then delete local branch ${branch} manually when safe. ${LAND_BACKUP_RECOVERY_HINT}`,
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
	return formatReconciliationFailureMessage({
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
	return formatReconciliationFailureMessage({
		operation: "Submit/update",
		manualAction: "manual PR update",
		previousPrNumber,
		branch,
		shouldStopBeforeAnotherMerge,
	});
}

function formatReconciliationFailureMessage(input: {
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

function isDescendantReconciliationRoot(plan: LandingPlan, branch: string): boolean {
	return (
		plan.descendantReconciliation.type === "auto" &&
		plan.descendantReconciliation.targetBranches.includes(branch)
	);
}

function refreshTargetOrder(plan: LandingPlan): readonly string[] {
	return [
		...plan.stack.landingBranches,
		...plan.stack.remainingLandingBranches,
		...(plan.descendantReconciliation.type === "auto"
			? plan.descendantReconciliation.targetBranches
			: []),
	];
}

export function blockedDescendantRepairAction(
	reconciliation: Extract<DescendantReconciliationPlan, { type: "blocked" }>,
): string {
	const branches = reconciliation.branches.join(", ");
	const conflict = reconciliation.conflicts[0];
	if (conflict === undefined) {
		return `Restack/update ${branches}.`;
	}

	if (reconciliation.conflicts.length > 1) {
		return `Free/detach ${reconciliation.conflicts.length} descendant worktrees; then restack/update ${branches}.`;
	}

	if (conflict.type === "managed-slot") {
		const slot = slotNameFromPath(conflict.path) ?? conflict.path;
		return `Free ${slot} for ${conflict.branch}; then restack/update ${branches}.`;
	}

	return `Detach ${conflict.path} for ${conflict.branch}; then restack/update ${branches}.`;
}
