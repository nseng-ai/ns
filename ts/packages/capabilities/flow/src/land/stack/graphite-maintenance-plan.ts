import { LAND_BACKUP_RECOVERY_HINT } from "./backup-refs.ts";
import type { DescendantMaintenancePlan, LandingPlan, LandGraphiteRestackScope } from "../api.ts";
import type { UiLandingWarning } from "./types.ts";
import {
	formatGraphiteOperation,
	restackOperation,
	type CheckedOutElsewhere,
} from "./graphite-command-channel.ts";
import { formatConflict, slotNameFromPath } from "./worktrees.ts";

export type MaintenanceMode =
	| "required-next-landing"
	| "optional-descendants"
	| "none"
	| "skip-descendant";

export type MaintenanceSeverity = "fail" | "warn";

export interface MaintenanceTargetPlan {
	readonly mode: MaintenanceMode;
	readonly severity: MaintenanceSeverity;
	readonly branches: readonly string[];
	readonly refreshCheckedOutConflictHandling: "defer" | "fail";
	readonly deleteCheckedOutConflictHandling: "retain" | "fail";
	readonly skippedScopeText: (branch: string) => string;
	readonly isOptionalDescendant: boolean;
	readonly shouldHaltOnRefreshFailure: boolean;
}

export interface BranchMaintenanceWarning {
	readonly branch: string;
	readonly warning: UiLandingWarning;
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
			"optional-descendants",
			plan.descendantMaintenance.targetBranches,
		);
	}
	if (plan.descendantMaintenance.type === "skipped") {
		return buildMaintenanceTargetPlan("skip-descendant", []);
	}
	return buildMaintenanceTargetPlan("none", []);
}

export function scopeForMaintenanceRestack(
	maintenance: MaintenanceTargetPlan,
): LandGraphiteRestackScope {
	return maintenance.isOptionalDescendant ? "upstack" : "branch-only";
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

export function skippedDescendantMaintenanceWarning(
	plan: LandingPlan,
	branch: string,
): UiLandingWarning {
	const maintenance = plan.descendantMaintenance;
	if (maintenance.type !== "skipped") {
		return {
			level: "warning",
			message: `Descendant restack/update was skipped for ${branch}.`,
			suggestedAction: "Inspect the stack and update descendant PRs manually if needed.",
		};
	}

	const conflictText = maintenance.conflicts.map(formatConflict).join("; ");
	return {
		level: "warning",
		message: `Final local Graphite cleanup for ${branch} and descendant restack/update were skipped because ${maintenance.reason}: ${conflictText}.`,
		suggestedAction: `Detach or free the descendant worktrees, then restack/update ${maintenance.branches.join(", ")} and delete local branch ${branch} manually if appropriate.`,
		notificationAction: skippedDescendantNotificationAction(maintenance),
	};
}

interface OptionalDescendantRefreshDeferredWarningOptions {
	readonly descendantBranch: string;
	readonly landedBranch: string;
	readonly getCommandDisplay: string;
	readonly checkoutConflict: CheckedOutElsewhere;
}

export function optionalDescendantRefreshDeferredWarning(
	options: OptionalDescendantRefreshDeferredWarningOptions,
): UiLandingWarning {
	const { descendantBranch, landedBranch, getCommandDisplay, checkoutConflict } = options;
	const restackCommandDisplay = formatGraphiteOperation(
		restackOperation({ branch: descendantBranch, scope: "upstack" }),
	);
	const submitCommandDisplay = formatGraphiteOperation({
		kind: "submit-update",
		branch: descendantBranch,
	});
	return {
		level: "info",
		message: `Optional descendant restack/update was deferred because Graphite could not refresh descendant branch ${descendantBranch}: ${formatCheckedOutElsewhere(checkoutConflict)}.`,
		suggestedAction: `When convenient, switch/detach ${checkoutConflict.path} from ${checkoutConflict.branch} or run the Graphite refresh from that checkout, then run ${getCommandDisplay}, ${restackCommandDisplay}, and ${submitCommandDisplay} if appropriate. Delete local branch ${landedBranch} manually when safe.`,
	};
}

export function aggregateOptionalDescendantMaintenanceWarnings(options: {
	readonly warnings: readonly BranchMaintenanceWarning[];
	readonly landedBranch: string;
	readonly targetBranches: readonly string[];
	readonly cleanupState: "skipped" | "completed";
}): UiLandingWarning {
	const { warnings, landedBranch, targetBranches, cleanupState } = options;
	if (warnings.length === 1) {
		const [onlyWarning] = warnings;
		if (onlyWarning !== undefined) return onlyWarning.warning;
	}
	const constituentWarnings = warnings.map(({ warning }) => warning);
	const isOnlyInformational = constituentWarnings.every((warning) => warning.level === "info");
	const affectedRoots = warnings.map(({ branch }) => branch);
	const cleanupText =
		cleanupState === "skipped"
			? `local branch ${landedBranch} cleanup and descendant restack/update were skipped`
			: `local branch ${landedBranch} cleanup may already have completed; optional descendant restack/update did not complete`;
	return {
		level: isOnlyInformational ? "info" : "warning",
		message: [
			`All target PRs were merged, but optional descendant maintenance did not complete for ${affectedRoots.join(", ")}; ${cleanupText}.`,
			...constituentWarnings.map((warning) => `- ${warning.message}`),
		].join("\n"),
		suggestedAction: `Inspect descendant roots ${targetBranches.join(", ")}, restack/update them manually as needed${cleanupState === "skipped" ? `, and delete local branch ${landedBranch} manually when safe` : ""}. ${LAND_BACKUP_RECOVERY_HINT}`,
	};
}

export function formatCheckedOutElsewhere(checkoutConflict: CheckedOutElsewhere): string {
	return `${checkoutConflict.branch} is checked out at ${checkoutConflict.path}`;
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
				severity: "fail",
				branches,
				refreshCheckedOutConflictHandling: "fail",
				deleteCheckedOutConflictHandling: "fail",
				skippedScopeText: localCleanupOnlyScopeText,
				isOptionalDescendant: false,
				shouldHaltOnRefreshFailure: true,
			};
		case "optional-descendants":
			return {
				mode,
				severity: "warn",
				branches,
				refreshCheckedOutConflictHandling: "defer",
				deleteCheckedOutConflictHandling: "fail",
				skippedScopeText: localCleanupAndDescendantScopeText,
				isOptionalDescendant: true,
				shouldHaltOnRefreshFailure: false,
			};
		case "none":
			return {
				mode,
				severity: "warn",
				branches,
				refreshCheckedOutConflictHandling: "fail",
				deleteCheckedOutConflictHandling: "retain",
				skippedScopeText: localCleanupOnlyScopeText,
				isOptionalDescendant: false,
				shouldHaltOnRefreshFailure: false,
			};
		case "skip-descendant":
			return {
				mode,
				severity: "warn",
				branches,
				refreshCheckedOutConflictHandling: "fail",
				deleteCheckedOutConflictHandling: "fail",
				skippedScopeText: localCleanupAndDescendantScopeText,
				isOptionalDescendant: true,
				shouldHaltOnRefreshFailure: false,
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

function skippedDescendantNotificationAction(
	maintenance: Extract<DescendantMaintenancePlan, { type: "skipped" }>,
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
