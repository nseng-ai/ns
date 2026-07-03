import type { ExecResult } from "@sdl/core/command";
import { shortSha } from "../../commit-display/index.ts";
import { isLikelyInProgressGitOperationFailure } from "../../submit/git-operation-output.ts";
import { LAND_BACKUP_RECOVERY_HINT } from "./backup-refs.ts";
import type { LandStackCommandStream } from "./command-stream.ts";
import {
	formatGraphiteOperation,
	parseGitCheckedOutElsewhere,
	type CheckedOutElsewhere,
} from "./graphite-command-channel.ts";
import { landStackFailure, type LandStackFailure } from "./errors.ts";
import {
	formatRestackFailureMessage,
	formatSubmitFailureMessage,
	setStatus,
} from "./presentation.ts";
import { validateOpenPrBasics } from "../api.ts";
import { loadPr } from "./pr-facts.ts";
import { loadLocalSha } from "./stack-facts.ts";
import type { LandRuntime } from "./land-runtime.ts";
import type { LandContext } from "../api.ts";
import type {
	DescendantMaintenancePlan,
	LandStackCommandContext,
	FlowLandingPlan,
	LandingWarning,
	MergeLoopState,
	PullRequestSnapshot,
} from "./types.ts";
import { formatConflict, slotNameFromPath } from "./worktrees.ts";

export interface GraphiteMaintenanceOptions {
	commandStream?: LandStackCommandStream;
	mergeState?: MergeLoopState;
}

interface GraphiteMaintenanceStep {
	index: number;
	branch: string;
	prNumber: number;
	state: MergeLoopState;
	options: GraphiteMaintenanceOptions;
}

type MaintenanceMode =
	| "required-next-landing"
	| "optional-descendants"
	| "none"
	| "skip-descendant";

type MaintenanceSeverity = "fail" | "warn";

interface MaintenanceTargetPlan {
	readonly mode: MaintenanceMode;
	readonly severity: MaintenanceSeverity;
	readonly branches: readonly string[];
}

type GraphiteMaintenanceOutcome =
	| { kind: "proceed" }
	| { kind: "skip"; warning?: LandingWarning }
	| { kind: "halt"; failure: LandStackFailure };

type GraphiteMaintenanceStop = Extract<GraphiteMaintenanceOutcome, { kind: "halt" | "skip" }>;

function failOrWarn(
	severity: MaintenanceSeverity,
	pair: { failure: LandStackFailure; warning: LandingWarning },
): GraphiteMaintenanceStop {
	if (severity === "fail") return { kind: "halt", failure: pair.failure };
	return { kind: "skip", warning: pair.warning };
}

interface GraphiteRefreshFailureOptions {
	prNumber: number;
	maintenanceBranch: string;
	getCommandDisplay: string;
	got: ExecResult;
}

function graphiteRefreshFailure(failureOptions: GraphiteRefreshFailureOptions): LandStackFailure {
	const { prNumber, maintenanceBranch, getCommandDisplay, got } = failureOptions;
	const checkoutConflict = parseGitCheckedOutElsewhere(got);
	if (checkoutConflict) {
		return landStackFailure(
			`PR #${prNumber} merged, but Graphite could not refresh next landing branch ${maintenanceBranch}: ${formatCheckedOutElsewhere(checkoutConflict)}.`,
			{
				commandDisplay: getCommandDisplay,
				result: got,
				failedBranch: maintenanceBranch,
				suggestedAction: `Switch/detach ${checkoutConflict.path} from ${checkoutConflict.branch}, then run ${getCommandDisplay} manually, inspect the stack, and rerun /ji:flow:land if appropriate.`,
			},
		);
	}

	return landStackFailure(`PR #${prNumber} merged, but targeted Graphite refresh failed.`, {
		commandDisplay: getCommandDisplay,
		result: got,
		failedBranch: maintenanceBranch,
		suggestedAction: `Run ${getCommandDisplay} manually, inspect the stack, and rerun /ji:flow:land if appropriate.`,
	});
}

interface PerformGraphiteMaintenanceOptions {
	landContext: LandContext;
	runtime: LandRuntime;
	ctx: LandStackCommandContext;
	plan: FlowLandingPlan;
	step: GraphiteMaintenanceStep;
}

interface MaintenanceBranchContext {
	landContext: LandContext;
	runtime: LandRuntime;
	repoRoot: string;
	plan: FlowLandingPlan;
	prNumber: number;
	maintenanceBranch: string;
	severity: MaintenanceSeverity;
	state: MergeLoopState;
}

interface SubmitMaintenanceCheckOptions extends MaintenanceBranchContext {
	landedBranch: string;
}

type SubmitMaintenanceCheckOutcome =
	| { kind: "submit" }
	| { kind: "skip-submit" }
	| GraphiteMaintenanceStop;

async function checkSubmitMaintenanceBranch(
	options: SubmitMaintenanceCheckOptions,
): Promise<SubmitMaintenanceCheckOutcome> {
	const { runtime, repoRoot, plan, prNumber, landedBranch, maintenanceBranch, severity } = options;
	const localSha = await loadLocalSha(runtime.commands, repoRoot, maintenanceBranch);
	if (localSha.type === "failure") {
		return failOrWarn(severity, {
			failure: landStackFailure(
				`PR #${prNumber} merged, but could not re-read local branch ${maintenanceBranch} after restack.\n${localSha.failure.message}`,
				{
					failedBranch: maintenanceBranch,
					suggestedAction: `Inspect local branch ${maintenanceBranch}, run gt submit/update if appropriate, then rerun /ji:flow:land if needed. ${LAND_BACKUP_RECOVERY_HINT}`,
				},
			),
			warning: {
				message: `All target PRs were merged, but local branch ${maintenanceBranch} could not be re-read after optional descendant restack; submit/update for ${maintenanceBranch} was skipped.`,
				suggestedAction: `Inspect local branch ${maintenanceBranch}, update that PR manually if needed, and delete local branch ${landedBranch} manually when safe. ${LAND_BACKUP_RECOVERY_HINT}`,
			},
		});
	}

	const pr = await loadPr(runtime.commands, repoRoot, maintenanceBranch);
	if (pr.type === "failure") {
		return failOrWarn(severity, {
			failure: landStackFailure(
				`PR #${prNumber} merged, but could not verify PR metadata for ${maintenanceBranch} after restack.\n${pr.failure.message}`,
				{
					failedBranch: maintenanceBranch,
					suggestedAction: `Inspect PR metadata for ${maintenanceBranch}, run gt submit/update if appropriate, then rerun /ji:flow:land if needed.`,
				},
			),
			warning: {
				message: `All target PRs were merged, but PR metadata for ${maintenanceBranch} could not be verified after optional descendant restack; submit/update for ${maintenanceBranch} was skipped.`,
				suggestedAction: `Inspect PR metadata for ${maintenanceBranch} and update that PR manually if needed.`,
			},
		});
	}

	return isPrMetadataCurrentForMaintenance({
		pr: pr.value,
		branch: maintenanceBranch,
		localSha: localSha.value,
		trunk: plan.stack.trunk,
	})
		? { kind: "skip-submit" }
		: { kind: "submit" };
}

function isPrMetadataCurrentForMaintenance(options: {
	pr: PullRequestSnapshot;
	branch: string;
	localSha: string;
	trunk: string;
}): boolean {
	const basics = validateOpenPrBasics(options);
	return basics.type === "completed" && options.pr.baseRefName === options.trunk;
}

async function refreshExpectedShaAfterRestack(
	options: MaintenanceBranchContext,
): Promise<GraphiteMaintenanceOutcome | undefined> {
	const { runtime, repoRoot, plan, prNumber, maintenanceBranch, state } = options;
	// gt restack --upstack legitimately rewrites upstack branches, so refresh the
	// expectation for later forced refresh targets; comparing against pre-restack
	// SHAs would false-positive on every 3+ branch stack and on forked descendants.
	for (const refreshTarget of refreshTargetsAfterMaintainedBranch(plan, maintenanceBranch)) {
		const refreshedSha = await loadLocalSha(runtime.commands, repoRoot, refreshTarget);
		if (refreshedSha.type === "failure") {
			return {
				kind: "halt",
				failure: landStackFailure(
					`PR #${prNumber} merged, but could not re-read local branch ${refreshTarget} after restack.\n${refreshedSha.failure.message}`,
					{
						failedBranch: refreshTarget,
						suggestedAction: `Inspect local branch ${refreshTarget}, then rerun /ji:flow:land if appropriate. ${LAND_BACKUP_RECOVERY_HINT}`,
					},
				),
			};
		}
		state.expectedShas.set(refreshTarget, refreshedSha.value);
	}
	return undefined;
}

async function submitMaintenanceBranch(
	options: MaintenanceBranchContext,
): Promise<GraphiteMaintenanceOutcome> {
	const { landContext, repoRoot, plan, prNumber, maintenanceBranch, severity } = options;
	// Post-merge maintenance restacks after a landed PR, so the remote PR branch may
	// still be on old stack history; keep pre-merge submit/update conservative.
	const submitted = await landContext.graphite.submitUpdate({
		repoRoot,
		branch: maintenanceBranch,
		force: true,
	});
	if (submitted.type === "success") return { kind: "proceed" };

	return failOrWarn(severity, {
		failure: landStackFailure(formatSubmitFailureMessage(prNumber, maintenanceBranch, true), {
			commandDisplay: submitted.commandDisplay,
			result: submitted.result,
			failedBranch: maintenanceBranch,
			suggestedAction: `Update PR for ${maintenanceBranch} manually, verify it targets ${plan.stack.trunk}, then rerun /ji:flow:land if appropriate.`,
		}),
		warning: {
			message: formatSubmitFailureMessage(prNumber, maintenanceBranch, false),
			commandDisplay: submitted.commandDisplay,
			result: submitted.result,
			suggestedAction: `Update PR for ${maintenanceBranch} manually and verify it targets ${plan.stack.trunk}.`,
		},
	});
}

export async function performGraphiteMaintenance(
	maintenanceOptions: PerformGraphiteMaintenanceOptions,
): Promise<GraphiteMaintenanceOutcome> {
	const { landContext, runtime, ctx, plan, step } = maintenanceOptions;
	const pi = runtime.commands;
	const { repoRoot } = plan;
	const { index, branch, prNumber, state, options } = step;
	const maintenance = planGraphiteMaintenanceTargets(plan, index);

	if (maintenance.mode === "skip-descendant") {
		return { kind: "skip", warning: skippedDescendantMaintenanceWarning(plan, branch) };
	}

	const refreshFailureWarnings: LandingWarning[] = [];
	for (const maintenanceBranch of maintenance.branches) {
		// Guard every forced refresh: gt get --force resets the local branch to remote
		// state, so refuse if the branch moved since this run snapshotted it.
		const guardSha = await loadLocalSha(pi, repoRoot, maintenanceBranch);
		if (guardSha.type === "failure") {
			const guardStop = failOrWarn(maintenance.severity, {
				failure: landStackFailure(
					`PR #${prNumber} merged, but could not verify local branch ${maintenanceBranch} before refreshing it.\n${guardSha.failure.message}`,
					{
						failedBranch: maintenanceBranch,
						suggestedAction: `Inspect local branch ${maintenanceBranch}, then rerun /ji:flow:land if appropriate. ${LAND_BACKUP_RECOVERY_HINT}`,
					},
				),
				warning: {
					message: `All target PRs were merged, but local branch ${maintenanceBranch} could not be verified before optional descendant maintenance; local branch ${branch} cleanup and descendant restack/update were skipped.`,
					suggestedAction: `Inspect local branch ${maintenanceBranch}, then restack/update it and delete local branch ${branch} manually when safe. ${LAND_BACKUP_RECOVERY_HINT}`,
				},
			});
			if (guardStop.kind === "halt") return guardStop;
			if (guardStop.warning !== undefined) refreshFailureWarnings.push(guardStop.warning);
			continue;
		}
		const expectedSha = state.expectedShas.get(maintenanceBranch);
		if (expectedSha !== guardSha.value) {
			const expectedDisplay = expectedSha === undefined ? "(unrecorded)" : shortSha(expectedSha);
			const movedMessage = `local branch ${maintenanceBranch} moved from ${expectedDisplay} to ${shortSha(guardSha.value)} since landing started; refusing gt get --force to avoid clobbering local commits`;
			const guardStop = failOrWarn(maintenance.severity, {
				failure: landStackFailure(`PR #${prNumber} merged, but ${movedMessage}.`, {
					failedBranch: maintenanceBranch,
					suggestedAction: `Inspect local branch ${maintenanceBranch}, reconcile it with the remote, then rerun /ji:flow:land if appropriate. ${LAND_BACKUP_RECOVERY_HINT}`,
				}),
				warning: {
					message: `All target PRs were merged, but ${movedMessage}; local branch ${branch} cleanup and descendant restack/update were skipped.`,
					suggestedAction: `Inspect local branch ${maintenanceBranch}, then restack/update it and delete local branch ${branch} manually when safe. ${LAND_BACKUP_RECOVERY_HINT}`,
				},
			});
			if (guardStop.kind === "halt") return guardStop;
			if (guardStop.warning !== undefined) refreshFailureWarnings.push(guardStop.warning);
			continue;
		}

		options.commandStream?.note(`Refreshing stack through ${maintenanceBranch}...`);
		setStatus(ctx, `refreshing stack through ${maintenanceBranch}...`);
		const refresh = await landContext.graphite.refreshBranchFromRemote({
			repoRoot,
			branch: maintenanceBranch,
			checkedOutConflictHandling: maintenance.mode === "optional-descendants" ? "defer" : "fail",
		});
		if (refresh.type !== "success") {
			if (maintenance.mode === "required-next-landing") {
				return {
					kind: "halt",
					failure: graphiteRefreshFailure({
						prNumber,
						maintenanceBranch,
						getCommandDisplay: refresh.commandDisplay,
						got: refresh.result,
					}),
				};
			}

			if (refresh.type === "checkout-conflict") {
				options.commandStream?.note(
					`Deferred optional descendant maintenance for ${maintenanceBranch} because ${formatCheckedOutElsewhere(refresh)}.\nRun ${refresh.commandDisplay} manually when that worktree is free.`,
				);
				refreshFailureWarnings.push(
					optionalDescendantRefreshDeferredWarning(
						maintenanceBranch,
						branch,
						refresh.commandDisplay,
						refresh,
					),
				);
				continue;
			}

			refreshFailureWarnings.push({
				message: `All target PRs were merged, but Graphite refresh for descendant branch ${maintenanceBranch} failed; local branch ${branch} cleanup and descendant restack/update were skipped.`,
				commandDisplay: refresh.commandDisplay,
				result: refresh.result,
				suggestedAction: `Run ${refresh.commandDisplay} manually, restack/update ${maintenanceBranch}, and delete local branch ${branch} when safe.`,
			});
			continue;
		}
	}

	if (refreshFailureWarnings.length > 0) {
		return {
			kind: "skip",
			warning: aggregateOptionalDescendantMaintenanceWarnings({
				warnings: refreshFailureWarnings,
				landedBranch: branch,
				targetBranches: maintenance.branches,
			}),
		};
	}

	// Re-check the branch's Graphite children right before the forced delete: a
	// child that appeared since planning means another stack now depends on it.
	const skippedScope =
		maintenance.mode === "optional-descendants"
			? `local branch ${branch} cleanup and descendant restack/update were`
			: `local branch ${branch} cleanup was`;
	const children = await landContext.graphite.branchChildren({
		repoRoot,
		metadataDbPath: plan.metadataDbPath,
		branch,
	});
	if (children.type === "failure") {
		return {
			kind: "skip",
			warning: {
				message: `All target PRs were merged, but the pre-delete Graphite children re-check for ${branch} failed; ${skippedScope} skipped.\n${children.failure.message}`,
				suggestedAction: `Inspect the stack, then delete local branch ${branch} manually when safe. ${LAND_BACKUP_RECOVERY_HINT}`,
			},
		};
	}
	const childrenNow = children.value;
	const allowedChildren = new Set(state.deletedBranches);
	for (const maintenanceBranch of maintenance.branches) allowedChildren.add(maintenanceBranch);
	const unexpectedChildren = childrenNow.filter((child) => !allowedChildren.has(child));
	if (unexpectedChildren.length > 0) {
		return failOrWarn(maintenance.severity, {
			failure: landStackFailure(
				`PR #${prNumber} merged, but ${branch} now has unexpected Graphite children (${unexpectedChildren.join(", ")}); refusing gt delete to avoid destroying another stack.`,
				{
					failedBranch: branch,
					failedPr: prNumber,
					suggestedAction: `Inspect the unexpected children, land or move them, then clean up local branch ${branch} manually before rerunning /ji:flow:land. ${LAND_BACKUP_RECOVERY_HINT}`,
				},
			),
			warning: {
				message: `All target PRs were merged, but ${branch} now has unexpected Graphite children (${unexpectedChildren.join(", ")}); ${skippedScope} skipped.`,
				suggestedAction: `Inspect the unexpected children, then delete local branch ${branch} and restack descendants manually when safe. ${LAND_BACKUP_RECOVERY_HINT}`,
			},
		});
	}

	options.commandStream?.note(`Cleaning up local branch ${branch}...`);
	setStatus(ctx, `deleting local Graphite branch ${branch}...`);
	const deletion = await landContext.graphite.deleteLocalBranch({
		repoRoot,
		branch,
		checkedOutConflictHandling: maintenance.mode === "none" ? "retain" : "fail",
	});
	switch (deletion.type) {
		case "deleted":
			state.deletedBranches.add(branch);
			break;
		case "retained":
			state.cleanup.retainedLocalBranches.push({ branch: deletion.branch, path: deletion.path });
			break;
		case "failed":
			return failOrWarn(
				maintenance.severity,
				localBranchDeletionFailurePair({
					branch,
					prNumber,
					commandDisplay: deletion.commandDisplay,
					result: deletion.result,
					isOptionalDescendant: maintenance.mode === "optional-descendants",
				}),
			);
		default:
			assertNever(deletion);
	}

	if (maintenance.branches.length === 0) return { kind: "proceed" };

	for (const maintenanceBranch of maintenance.branches) {
		setStatus(ctx, `restacking ${maintenanceBranch}...`);
		const restacked = await landContext.graphite.restackUpstack({
			repoRoot,
			branch: maintenanceBranch,
		});
		if (restacked.type === "failure") {
			return failOrWarn(maintenance.severity, {
				failure: landStackFailure(formatRestackFailureMessage(prNumber, maintenanceBranch, true), {
					commandDisplay: restacked.commandDisplay,
					result: restacked.result,
					failedBranch: maintenanceBranch,
					suggestedAction: `Resolve restack failures for ${maintenanceBranch}, run gt submit/update, then rerun /ji:flow:land if appropriate.`,
				}),
				warning: {
					message: formatRestackFailureMessage(prNumber, maintenanceBranch, false),
					commandDisplay: restacked.commandDisplay,
					result: restacked.result,
					suggestedAction: `Resolve restack failures for ${maintenanceBranch}, then update that PR manually.`,
				},
			});
		}

		const maintenanceContext: MaintenanceBranchContext = {
			landContext,
			runtime,
			repoRoot,
			plan,
			prNumber,
			maintenanceBranch,
			severity: maintenance.severity,
			state,
		};
		const submitCheck = await checkSubmitMaintenanceBranch({
			...maintenanceContext,
			landedBranch: branch,
		});
		if (submitCheck.kind === "halt" || submitCheck.kind === "skip") return submitCheck;

		const refreshExpected = await refreshExpectedShaAfterRestack(maintenanceContext);
		if (refreshExpected) return refreshExpected;

		if (submitCheck.kind === "skip-submit") {
			options.commandStream?.note(
				`Skipped gt submit for ${maintenanceBranch}; PR metadata already current.`,
			);
			continue;
		}

		setStatus(ctx, `submitting ${maintenanceBranch}...`);
		const submitted = await submitMaintenanceBranch(maintenanceContext);
		if (submitted.kind !== "proceed") return submitted;
	}

	return { kind: "proceed" };
}

function aggregateOptionalDescendantMaintenanceWarnings(options: {
	readonly warnings: readonly LandingWarning[];
	readonly landedBranch: string;
	readonly targetBranches: readonly string[];
}): LandingWarning {
	const { warnings, landedBranch, targetBranches } = options;
	if (warnings.length === 1) return warnings[0] ?? genericOptionalDescendantWarning(options);
	const isOnlyInformational = warnings.every((warning) => warning.level === "info");
	const affectedRoots = targetBranches.filter((branch) =>
		warnings.some((warning) => warning.message.includes(branch)),
	);
	const affectedText =
		affectedRoots.length > 0 ? affectedRoots.join(", ") : targetBranches.join(", ");
	return {
		...(isOnlyInformational ? { level: "info" as const } : {}),
		message: [
			`All target PRs were merged, but optional descendant maintenance did not complete for ${affectedText}; local branch ${landedBranch} cleanup and descendant restack/update were skipped.`,
			...warnings.map((warning) => `- ${warning.message}`),
		].join("\n"),
		suggestedAction: `Inspect descendant roots ${targetBranches.join(", ")}, restack/update them manually as needed, and delete local branch ${landedBranch} manually when safe. ${LAND_BACKUP_RECOVERY_HINT}`,
	};
}

function genericOptionalDescendantWarning(options: {
	readonly landedBranch: string;
	readonly targetBranches: readonly string[];
}): LandingWarning {
	return {
		message: `All target PRs were merged, but optional descendant maintenance did not complete; local branch ${options.landedBranch} cleanup and descendant restack/update were skipped.`,
		suggestedAction: `Inspect descendant roots ${options.targetBranches.join(", ")}, restack/update them manually as needed, and delete local branch ${options.landedBranch} manually when safe. ${LAND_BACKUP_RECOVERY_HINT}`,
	};
}

function optionalDescendantRefreshDeferredWarning(
	descendantBranch: string,
	landedBranch: string,
	getCommandDisplay: string,
	checkoutConflict: CheckedOutElsewhere,
): LandingWarning {
	const restackCommandDisplay = formatGraphiteOperation({
		kind: "restack-upstack",
		branch: descendantBranch,
	});
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

function formatCheckedOutElsewhere(checkoutConflict: CheckedOutElsewhere): string {
	return `${checkoutConflict.branch} is checked out at ${checkoutConflict.path}`;
}

function planGraphiteMaintenanceTargets(
	plan: FlowLandingPlan,
	index: number,
): MaintenanceTargetPlan {
	const nextLandingBranch = plan.stack.landingBranches[index + 1];
	if (nextLandingBranch !== undefined) {
		return {
			mode: "required-next-landing",
			severity: "fail",
			branches: [nextLandingBranch],
		};
	}

	if (index !== plan.stack.landingBranches.length - 1) {
		return { mode: "none", severity: "warn", branches: [] };
	}

	const nextFutureLandingBranch = plan.stack.remainingLandingBranches[0];
	if (nextFutureLandingBranch !== undefined) {
		return {
			mode: "required-next-landing",
			severity: "fail",
			branches: [nextFutureLandingBranch],
		};
	}

	if (plan.descendantMaintenance.kind === "auto") {
		return {
			mode: "optional-descendants",
			severity: "warn",
			branches: plan.descendantMaintenance.targetBranches,
		};
	}
	if (plan.descendantMaintenance.kind === "skipped") {
		return { mode: "skip-descendant", severity: "warn", branches: [] };
	}
	return { mode: "none", severity: "warn", branches: [] };
}

function refreshTargetsAfterMaintainedBranch(
	plan: FlowLandingPlan,
	maintainedBranch: string,
): readonly string[] {
	const refreshOrder = refreshTargetOrder(plan);
	const maintainedIndex = refreshOrder.indexOf(maintainedBranch);
	if (maintainedIndex < 0) return [];
	const downstreamTargets = refreshOrder.slice(maintainedIndex + 1);
	if (downstreamTargets.length === 0) return [];

	if (
		plan.descendantMaintenance.kind === "auto" &&
		plan.descendantMaintenance.targetBranches.includes(maintainedBranch)
	) {
		// Descendant roots are siblings above the landed branch. Restacking one root
		// should not rewrite another root's local SHA expectation.
		return [];
	}

	const next = downstreamTargets[0];
	if (next === undefined) return [];
	if (
		plan.descendantMaintenance.kind === "auto" &&
		plan.descendantMaintenance.targetBranches.includes(next)
	) {
		return downstreamTargets;
	}
	return [next];
}

function refreshTargetOrder(plan: FlowLandingPlan): readonly string[] {
	return [
		...plan.stack.landingBranches,
		...plan.stack.remainingLandingBranches,
		...(plan.descendantMaintenance.kind === "auto"
			? plan.descendantMaintenance.targetBranches
			: []),
	];
}

function skippedDescendantMaintenanceWarning(
	plan: FlowLandingPlan,
	branch: string,
): LandingWarning {
	const maintenance = plan.descendantMaintenance;
	if (maintenance.kind !== "skipped") {
		return {
			message: `Descendant restack/update was skipped for ${branch}.`,
			suggestedAction: "Inspect the stack and update descendant PRs manually if needed.",
		};
	}

	const conflictText = maintenance.conflicts.map(formatConflict).join("; ");
	return {
		message: `Final local Graphite cleanup for ${branch} and descendant restack/update were skipped because ${maintenance.reason}: ${conflictText}.`,
		suggestedAction: `Detach or free the descendant worktrees, then restack/update ${maintenance.branches.join(", ")} and delete local branch ${branch} manually if appropriate.`,
		notificationAction: skippedDescendantNotificationAction(maintenance),
	};
}

function skippedDescendantNotificationAction(
	maintenance: Extract<DescendantMaintenancePlan, { kind: "skipped" }>,
): string {
	const branches = maintenance.branches.join(", ");
	const conflict = maintenance.conflicts[0];
	if (conflict === undefined) {
		return `Restack/update ${branches}.`;
	}

	if (maintenance.conflicts.length > 1) {
		return `Free/detach ${maintenance.conflicts.length} descendant worktrees; then restack/update ${branches}.`;
	}

	if (conflict.kind === "managed-slot") {
		const slot = slotNameFromPath(conflict.path) ?? conflict.path;
		return `Free ${slot} for ${conflict.branch}; then restack/update ${branches}.`;
	}

	return `Detach ${conflict.path} for ${conflict.branch}; then restack/update ${branches}.`;
}

interface LocalBranchDeletionFailurePairOptions {
	branch: string;
	prNumber: number;
	commandDisplay: string;
	result: ExecResult;
	isOptionalDescendant: boolean;
}

function localBranchDeletionFailurePair(options: LocalBranchDeletionFailurePairOptions): {
	failure: LandStackFailure;
	warning: LandingWarning;
} {
	const details = localBranchDeletionFailureDetails(options);
	return {
		failure: landStackFailure(details.failureMessage, {
			commandDisplay: options.commandDisplay,
			result: options.result,
			failedBranch: options.branch,
			failedPr: options.prNumber,
			suggestedAction: details.failureSuggestedAction,
		}),
		warning: {
			message: details.warningMessage,
			commandDisplay: options.commandDisplay,
			result: options.result,
			suggestedAction: details.warningSuggestedAction,
		},
	};
}

function localBranchDeletionFailureDetails(options: LocalBranchDeletionFailurePairOptions): {
	failureMessage: string;
	failureSuggestedAction: string;
	warningMessage: string;
	warningSuggestedAction: string;
} {
	if (!isLikelyInProgressGitOperationFailure(options.result)) {
		return {
			failureMessage: `PR #${options.prNumber} merged, but deleting the local Graphite branch ${options.branch} failed.`,
			failureSuggestedAction: `Delete or repair local Graphite branch ${options.branch} manually, then inspect the stack before rerunning /ji:flow:land.`,
			warningMessage: options.isOptionalDescendant
				? `All target PRs were merged, but deleting the local Graphite branch ${options.branch} failed; descendant restack/update was skipped.`
				: `All target PRs were merged, but deleting the local Graphite branch ${options.branch} failed.`,
			warningSuggestedAction: `Delete or repair local Graphite branch ${options.branch} manually, then inspect the stack.`,
		};
	}

	const baseMessage = `Graphite cleanup for local branch ${options.branch} stopped during branch deletion with an in-progress Git operation or conflicts. The repository may now be mid-rebase; do not rerun /ji:flow:land until it is resolved or aborted.`;
	const action = `Run git status. Resolve the conflicts and continue the Git operation, or run git rebase --abort if you want to back out of the cleanup restack; then inspect the stack and delete or repair local Graphite branch ${options.branch} manually before rerunning /ji:flow:land.`;
	return {
		failureMessage: `PR #${options.prNumber} merged, but ${baseMessage}`,
		failureSuggestedAction: action,
		warningMessage: options.isOptionalDescendant
			? `All target PRs were merged, but ${baseMessage} Descendant restack/update was skipped.`
			: `All target PRs were merged, but ${baseMessage}`,
		warningSuggestedAction: action,
	};
}

function assertNever(value: never): never {
	throw new Error(`Unhandled local branch deletion result: ${JSON.stringify(value)}`);
}
