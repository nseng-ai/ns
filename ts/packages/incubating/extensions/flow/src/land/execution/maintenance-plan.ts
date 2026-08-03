import { LAND_BACKUP_RECOVERY_HINT } from "../graphite-operations.ts";
import type {
	DescendantMaintenancePlan,
	LandingExecutionFailure,
	LandingPlan,
	LandGraphiteRestackScope,
} from "../types.ts";
import type { LandingWarning } from "../types.ts";
import { landingExecutionFailure } from "../results.ts";
import type { CheckedOutElsewhere } from "../graphite-operations.ts";
import { formatConflict, slotNameFromPath } from "../worktree-paths.ts";

export type MaintenanceMode =
	| "required-next-landing"
	| "required-descendants"
	| "none"
	| "blocked-descendants";

export interface MaintenanceTargetPlan {
	readonly mode: MaintenanceMode;
	readonly cleanupFailureHandling: "fail" | "warn";
	readonly branches: readonly string[];
	readonly refreshCheckedOutConflictHandling: "defer" | "fail";
	readonly deleteCheckedOutConflictHandling: "retain" | "fail";
	readonly skippedScopeText: (branch: string) => string;
	readonly isDescendantRoot: boolean;
}

export interface BranchMaintenanceWarning {
	readonly branch: string;
	readonly warning: LandingWarning;
}

export interface BranchMaintenanceFailure {
	readonly branch: string;
	readonly failure: LandingExecutionFailure;
}

export function planGraphiteMaintenanceTargets(
	plan: LandingPlan,
	index: number,
): MaintenanceTargetPlan {
	const nextLandingBranch = plan.stack.landingBranches[index + 1];
	if (nextLandingBranch !== undefined) {
		return buildMaintenanceTargetPlan("required-next-landing", [nextLandingBranch]);
	}

	if (index !== plan.stack.landingBranches.length - 1) {
		return buildMaintenanceTargetPlan("none", []);
	}

	const nextFutureLandingBranch = plan.stack.remainingLandingBranches[0];
	if (nextFutureLandingBranch !== undefined) {
		return buildMaintenanceTargetPlan("required-next-landing", [nextFutureLandingBranch]);
	}

	if (plan.descendantMaintenance.type === "auto") {
		return buildMaintenanceTargetPlan(
			"required-descendants",
			plan.descendantMaintenance.targetBranches,
		);
	}
	if (plan.descendantMaintenance.type === "blocked") {
		return buildMaintenanceTargetPlan("blocked-descendants", []);
	}
	return buildMaintenanceTargetPlan("none", []);
}

export function scopeForMaintenanceRestack(
	maintenance: MaintenanceTargetPlan,
): LandGraphiteRestackScope {
	return maintenance.isDescendantRoot ? "upstack" : "branch-only";
}

export function shouldRefreshExpectedShasAfterRestack(maintenance: MaintenanceTargetPlan): boolean {
	return scopeForMaintenanceRestack(maintenance) === "upstack";
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

/**
 * One aggregated failure for required descendant reconciliation across multiple roots. Every
 * attempted root's branch-specific failure is preserved so no later failure hides an earlier one.
 */
export function aggregateDescendantReconciliationFailure(options: {
	readonly failures: readonly BranchMaintenanceFailure[];
	readonly landedBranch: string;
	readonly landedPrNumber: number;
	readonly targetBranches: readonly string[];
	readonly landedBranchCleanupState: "retained" | "deleted";
}): LandingExecutionFailure {
	const { failures, landedBranch, landedPrNumber, targetBranches, landedBranchCleanupState } =
		options;
	const onlyFailure = failures.length === 1 ? failures[0] : undefined;
	if (onlyFailure !== undefined) return onlyFailure.failure;

	const affectedRoots = failures.map(({ branch }) => branch);
	const cleanupText =
		landedBranchCleanupState === "retained"
			? `local branch ${landedBranch} was retained`
			: `local branch ${landedBranch} was already deleted`;
	return landingExecutionFailure(
		[
			`All target PRs were merged, but required descendant reconciliation failed for ${affectedRoots.join(", ")}; ${cleanupText}.`,
			...failures.map(({ failure }) => `- ${failure.message}`),
		].join("\n"),
		{
			...(affectedRoots[0] === undefined ? {} : { failedBranch: affectedRoots[0] }),
			failedPrNumber: landedPrNumber,
			suggestedAction: `Inspect descendant roots ${targetBranches.join(", ")}, restack/update them manually, and verify each PR head and base on GitHub${landedBranchCleanupState === "retained" ? `; delete local branch ${landedBranch} manually when safe` : ""}. ${LAND_BACKUP_RECOVERY_HINT}`,
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

function localCleanupOnlyScopeText(branch: string): string {
	return `local branch ${branch} cleanup was`;
}

function localCleanupAndDescendantScopeText(branch: string): string {
	return `local branch ${branch} cleanup and descendant restack/update were`;
}

function buildMaintenanceTargetPlan(
	mode: MaintenanceMode,
	branches: readonly string[],
): MaintenanceTargetPlan {
	switch (mode) {
		case "required-next-landing":
			return {
				mode,
				cleanupFailureHandling: "fail",
				branches,
				refreshCheckedOutConflictHandling: "fail",
				deleteCheckedOutConflictHandling: "fail",
				skippedScopeText: localCleanupOnlyScopeText,
				isDescendantRoot: false,
			};
		case "required-descendants":
			return {
				mode,
				cleanupFailureHandling: "fail",
				branches,
				refreshCheckedOutConflictHandling: "defer",
				deleteCheckedOutConflictHandling: "fail",
				skippedScopeText: localCleanupAndDescendantScopeText,
				isDescendantRoot: true,
			};
		case "none":
			return {
				mode,
				cleanupFailureHandling: "warn",
				branches,
				refreshCheckedOutConflictHandling: "fail",
				deleteCheckedOutConflictHandling: "retain",
				skippedScopeText: localCleanupOnlyScopeText,
				isDescendantRoot: false,
			};
		case "blocked-descendants":
			return {
				mode,
				cleanupFailureHandling: "fail",
				branches,
				refreshCheckedOutConflictHandling: "fail",
				deleteCheckedOutConflictHandling: "fail",
				skippedScopeText: localCleanupAndDescendantScopeText,
				isDescendantRoot: true,
			};
		default:
			assertNever(mode);
	}
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

function assertNever(value: never): never {
	throw new Error(`Unhandled Graphite maintenance planning mode: ${JSON.stringify(value)}`);
}
