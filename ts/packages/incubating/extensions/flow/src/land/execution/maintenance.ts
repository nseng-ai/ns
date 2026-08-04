// Ordinary post-merge Graphite maintenance and workflow dispatch.

import type { ExecResult } from "@nseng-ai/foundation/command";
import { shortSha } from "../../commit-display/index.ts";
import { LAND_BACKUP_RECOVERY_HINT, parseGitCheckedOutElsewhere } from "../graphite-operations.ts";
import { isMaintenancePrCurrent } from "../preflight.ts";
import { landingExecutionFailure } from "../results.ts";
import type { LandingExecutionFailure, LandingPlan, LandingWarning } from "../types.ts";
import { landingWarning } from "../types.ts";
import type { LandExecutionContext } from "./execution-context.ts";
import { reconcileDescendantRoots } from "./descendant-reconciliation.ts";
import type { MergeLoopState } from "./merge-loop.ts";
import {
	blockedDescendantMaintenanceFailure,
	formatCheckedOutElsewhere,
	formatRestackFailureMessage,
	formatSubmitFailureMessage,
	planGraphiteMaintenanceTargets,
	type OrdinaryMaintenance,
} from "./maintenance-plan.ts";

interface GraphiteMaintenanceStep {
	readonly index: number;
	readonly branch: string;
	readonly prNumber: number;
	readonly state: MergeLoopState;
}

/** Phase a post-merge maintenance halt is attributed to in the landing report. */
export type MaintenanceHaltPhase = "descendant-maintenance" | "merge-maintenance-cleanup";

type GraphiteMaintenanceOutcome =
	| { kind: "proceed" }
	| { kind: "skip"; warning?: LandingWarning }
	| { kind: "halt"; failure: LandingExecutionFailure };

export type PerformedGraphiteMaintenance =
	| { kind: "proceed" }
	| { kind: "skip"; warning?: LandingWarning }
	| { kind: "halt"; failure: LandingExecutionFailure; phase: MaintenanceHaltPhase };

type GraphiteMaintenanceStop = Extract<GraphiteMaintenanceOutcome, { kind: "halt" | "skip" }>;

function failOrWarn(
	maintenance: OrdinaryMaintenance,
	pair: { failure: LandingExecutionFailure; warning: LandingWarning },
): GraphiteMaintenanceStop {
	if (maintenance.mode === "required-next-landing") {
		return { kind: "halt", failure: pair.failure };
	}
	return { kind: "skip", warning: pair.warning };
}

interface GraphiteRefreshFailureOptions {
	prNumber: number;
	maintenanceBranch: string;
	branchRole: string;
	getCommandDisplay: string;
	got: ExecResult;
}

function graphiteRefreshFailure(
	failureOptions: GraphiteRefreshFailureOptions,
): LandingExecutionFailure {
	const { prNumber, maintenanceBranch, branchRole, getCommandDisplay, got } = failureOptions;
	const checkoutConflict = parseGitCheckedOutElsewhere(got);
	if (checkoutConflict) {
		return landingExecutionFailure(
			`PR #${prNumber} merged, but Graphite could not refresh ${branchRole} ${maintenanceBranch}: ${formatCheckedOutElsewhere(checkoutConflict)}.`,
			{
				displayCommand: getCommandDisplay,
				execResult: got,
				failedBranch: maintenanceBranch,
				suggestedAction: `Switch/detach ${checkoutConflict.path} from ${checkoutConflict.branch}, then run ${getCommandDisplay} manually, inspect the stack, and rerun /ns:flow:land if appropriate.`,
			},
		);
	}

	return landingExecutionFailure(`PR #${prNumber} merged, but targeted Graphite refresh failed.`, {
		displayCommand: getCommandDisplay,
		execResult: got,
		failedBranch: maintenanceBranch,
		suggestedAction: `Run ${getCommandDisplay} manually, inspect the stack, and rerun /ns:flow:land if appropriate.`,
	});
}

interface PerformGraphiteMaintenanceOptions {
	readonly plan: LandingPlan;
	readonly step: GraphiteMaintenanceStep;
	readonly shouldDeferLandedBranchDeletion?: boolean;
}

interface MaintenanceOperationInput {
	readonly repoRoot: string;
	readonly plan: LandingPlan;
	readonly prNumber: number;
	readonly landedBranch: string;
	readonly state: MergeLoopState;
	readonly maintenance: OrdinaryMaintenance;
}

interface MaintenanceBranchOperationInput extends MaintenanceOperationInput {
	readonly maintenanceBranch: string;
}

type SubmitMaintenanceCheckOutcome =
	| { kind: "submit" }
	| { kind: "skip-submit" }
	| GraphiteMaintenanceStop;

function withMaintenanceBranch(
	operationInput: MaintenanceOperationInput,
	maintenanceBranch: string,
): MaintenanceBranchOperationInput {
	return { ...operationInput, maintenanceBranch };
}

export async function performGraphiteMaintenance(
	executionContext: LandExecutionContext,
	maintenanceOptions: PerformGraphiteMaintenanceOptions,
): Promise<PerformedGraphiteMaintenance> {
	const { plan, step } = maintenanceOptions;
	const { repoRoot } = plan;
	const { index, branch, prNumber, state } = step;
	const maintenance = planGraphiteMaintenanceTargets(plan, index);
	const shouldDeferLandedBranchDeletion =
		maintenanceOptions.shouldDeferLandedBranchDeletion ?? false;

	if (maintenance.mode === "blocked-descendants") {
		// The main confirmation (or --yes) disclosed and consented to the deferred maintenance;
		// the landing is still only partially complete, so this is a failed postcondition, not a
		// warning. Nothing checked out elsewhere is mutated and the landed local branch is kept.
		return {
			kind: "halt",
			phase: "descendant-maintenance",
			failure: blockedDescendantMaintenanceFailure(plan, branch, prNumber),
		};
	}

	if (maintenance.mode === "required-descendants") {
		return await reconcileDescendantRoots(executionContext, {
			plan,
			prNumber,
			landedBranch: branch,
			state,
			maintenance,
			shouldDeferLandedBranchDeletion,
		});
	}

	const outcome = await maintainNextLandingBranches(
		executionContext,
		{
			repoRoot,
			plan,
			prNumber,
			landedBranch: branch,
			state,
			maintenance,
		},
		shouldDeferLandedBranchDeletion,
	);
	if (outcome.kind === "halt") return { ...outcome, phase: "merge-maintenance-cleanup" };
	return outcome;
}

/** Maintenance for `required-next-landing` and `none` modes: refresh/delete/restack/submit. */
async function maintainNextLandingBranches(
	executionContext: LandExecutionContext,
	operationInput: MaintenanceOperationInput,
	shouldDeferLandedBranchDeletion: boolean,
): Promise<GraphiteMaintenanceOutcome> {
	const { progress } = executionContext;
	const { maintenance } = operationInput;
	for (const maintenanceBranch of maintenance.branches) {
		const branchOperationContext = withMaintenanceBranch(operationInput, maintenanceBranch);
		const guard = await guardMaintenanceBranch(executionContext, branchOperationContext);
		if (guard !== undefined) return guard;
		const refresh = await refreshMaintenanceBranch(executionContext, branchOperationContext);
		if (refresh !== undefined) return refresh;
	}

	if (!shouldDeferLandedBranchDeletion) {
		const deleteCheck = await checkGraphiteBranchBeforeDelete(executionContext, operationInput);
		if (deleteCheck !== undefined) return deleteCheck;

		const deletion = await deleteLocalGraphiteBranchAfterLanding(executionContext, operationInput);
		if (deletion.kind !== "proceed") return deletion;
	}

	for (const maintenanceBranch of maintenance.branches) {
		const branchOperationContext = withMaintenanceBranch(operationInput, maintenanceBranch);
		const restacked = await restackMaintenanceBranch(executionContext, branchOperationContext);
		if (restacked.kind !== "proceed") return restacked;

		const submitCheck = await checkSubmitMaintenanceBranch(
			executionContext,
			branchOperationContext,
		);
		if (submitCheck.kind === "halt" || submitCheck.kind === "skip") return submitCheck;

		if (submitCheck.kind === "skip-submit") {
			progress.note(`Skipped gt submit for ${maintenanceBranch}; PR metadata already current.`);
			continue;
		}

		progress.setStatus(`submitting ${maintenanceBranch}...`);
		const submitted = await submitMaintenanceBranch(executionContext, branchOperationContext);
		if (submitted.kind !== "proceed") return submitted;
	}

	return { kind: "proceed" };
}

async function checkSubmitMaintenanceBranch(
	executionContext: LandExecutionContext,
	options: MaintenanceBranchOperationInput,
): Promise<SubmitMaintenanceCheckOutcome> {
	const { land: landContext } = executionContext;
	const { repoRoot, plan, prNumber, landedBranch, maintenanceBranch, maintenance } = options;
	const localSha = await landContext.git.localBranchSha({ repoRoot, branch: maintenanceBranch });
	if (localSha.type === "failure") {
		return failOrWarn(maintenance, {
			failure: landingExecutionFailure(
				`PR #${prNumber} merged, but could not re-read local branch ${maintenanceBranch} after restack.\n${localSha.failure.message}`,
				{
					failedBranch: maintenanceBranch,
					suggestedAction: `Inspect local branch ${maintenanceBranch}, run gt submit/update if appropriate, then rerun /ns:flow:land if needed. ${LAND_BACKUP_RECOVERY_HINT}`,
				},
			),
			warning: landingWarning({
				message: `All target PRs were merged, but local branch ${maintenanceBranch} could not be re-read after restack; submit/update for ${maintenanceBranch} was skipped.`,
				suggestedAction: `Inspect local branch ${maintenanceBranch}, update that PR manually if needed, and delete local branch ${landedBranch} manually when safe. ${LAND_BACKUP_RECOVERY_HINT}`,
			}),
		});
	}

	const pr = await landContext.github.pullRequestFacts({
		repoRoot,
		branchOrNumber: maintenanceBranch,
	});
	if (pr.type === "failure") {
		return failOrWarn(maintenance, {
			failure: landingExecutionFailure(
				`PR #${prNumber} merged, but could not verify PR metadata for ${maintenanceBranch} after restack.\n${pr.failure.message}`,
				{
					failedBranch: maintenanceBranch,
					suggestedAction: `Inspect PR metadata for ${maintenanceBranch}, run gt submit/update if appropriate, then rerun /ns:flow:land if needed.`,
				},
			),
			warning: landingWarning({
				message: `All target PRs were merged, but PR metadata for ${maintenanceBranch} could not be verified after restack; submit/update for ${maintenanceBranch} was skipped.`,
				suggestedAction: `Inspect PR metadata for ${maintenanceBranch} and update that PR manually if needed.`,
			}),
		});
	}

	return isMaintenancePrCurrent({
		pr: pr.value,
		branch: maintenanceBranch,
		localSha: localSha.value,
		expectedBase: plan.stack.trunk,
	})
		? { kind: "skip-submit" }
		: { kind: "submit" };
}

async function submitMaintenanceBranch(
	executionContext: LandExecutionContext,
	options: MaintenanceBranchOperationInput,
): Promise<GraphiteMaintenanceOutcome> {
	const { land: landContext } = executionContext;
	const { repoRoot, plan, prNumber, maintenanceBranch, maintenance } = options;
	// Post-merge maintenance restacks after a landed PR, so the remote PR branch may
	// still be on old stack history; keep pre-merge submit/update conservative.
	const submitted = await landContext.graphite.submitUpdate({
		repoRoot,
		branch: maintenanceBranch,
		force: true,
	});
	if (submitted.type === "success") return { kind: "proceed" };

	return failOrWarn(maintenance, {
		failure: landingExecutionFailure(
			formatSubmitFailureMessage(prNumber, maintenanceBranch, true),
			{
				displayCommand: submitted.commandDisplay,
				execResult: submitted.result,
				failedBranch: maintenanceBranch,
				suggestedAction: `Update PR for ${maintenanceBranch} manually, verify it targets ${plan.stack.trunk}, then rerun /ns:flow:land if appropriate.`,
			},
		),
		warning: landingWarning({
			message: formatSubmitFailureMessage(prNumber, maintenanceBranch, false),
			commandDisplay: submitted.commandDisplay,
			result: submitted.result,
			suggestedAction: `Update PR for ${maintenanceBranch} manually and verify it targets ${plan.stack.trunk}.`,
		}),
	});
}

async function guardMaintenanceBranch(
	executionContext: LandExecutionContext,
	options: MaintenanceBranchOperationInput,
): Promise<GraphiteMaintenanceStop | undefined> {
	const { land: landContext } = executionContext;
	const { repoRoot, prNumber, maintenanceBranch, maintenance, state, landedBranch } = options;
	// Guard every forced refresh: gt get --force resets the local branch to remote
	// state, so refuse if the branch moved since this run snapshotted it.
	const guardSha = await landContext.git.localBranchSha({ repoRoot, branch: maintenanceBranch });
	if (guardSha.type === "failure") {
		return failOrWarn(maintenance, {
			failure: landingExecutionFailure(
				`PR #${prNumber} merged, but could not verify local branch ${maintenanceBranch} before refreshing it.\n${guardSha.failure.message}`,
				{
					failedBranch: maintenanceBranch,
					suggestedAction: `Inspect local branch ${maintenanceBranch}, then rerun /ns:flow:land if appropriate. ${LAND_BACKUP_RECOVERY_HINT}`,
				},
			),
			warning: landingWarning({
				message: `All target PRs were merged, but local branch ${maintenanceBranch} could not be verified before descendant maintenance; local branch ${landedBranch} cleanup and descendant restack/update were skipped.`,
				suggestedAction: `Inspect local branch ${maintenanceBranch}, then restack/update it and delete local branch ${landedBranch} manually when safe. ${LAND_BACKUP_RECOVERY_HINT}`,
			}),
		});
	}
	const expectedSha = state.expectedShas.get(maintenanceBranch);
	if (expectedSha === guardSha.value) return undefined;

	const expectedDisplay = expectedSha === undefined ? "(unrecorded)" : shortSha(expectedSha);
	const movedMessage = `local branch ${maintenanceBranch} moved from ${expectedDisplay} to ${shortSha(guardSha.value)} since landing started; refusing gt get --force to avoid clobbering local commits`;
	return failOrWarn(maintenance, {
		failure: landingExecutionFailure(`PR #${prNumber} merged, but ${movedMessage}.`, {
			failedBranch: maintenanceBranch,
			suggestedAction: `Inspect local branch ${maintenanceBranch}, reconcile it with the remote, then rerun /ns:flow:land if appropriate. ${LAND_BACKUP_RECOVERY_HINT}`,
		}),
		warning: landingWarning({
			message: `All target PRs were merged, but ${movedMessage}; local branch ${landedBranch} cleanup and descendant restack/update were skipped.`,
			suggestedAction: `Inspect local branch ${maintenanceBranch}, then restack/update it and delete local branch ${landedBranch} manually when safe. ${LAND_BACKUP_RECOVERY_HINT}`,
		}),
	});
}

async function refreshMaintenanceBranch(
	executionContext: LandExecutionContext,
	options: MaintenanceBranchOperationInput,
): Promise<GraphiteMaintenanceStop | undefined> {
	const { land: landContext, progress } = executionContext;
	const { repoRoot, prNumber, maintenanceBranch } = options;
	progress.note(`Refreshing stack through ${maintenanceBranch}...`);
	progress.setStatus(`refreshing stack through ${maintenanceBranch}...`);
	const refresh = await landContext.graphite.refreshBranchFromRemote({
		repoRoot,
		branch: maintenanceBranch,
		checkedOutConflictHandling: "fail",
	});
	if (refresh.type === "success") return undefined;

	return {
		kind: "halt",
		failure: graphiteRefreshFailure({
			prNumber,
			maintenanceBranch,
			branchRole: "next landing branch",
			getCommandDisplay: refresh.commandDisplay,
			got: refresh.result,
		}),
	};
}

async function checkGraphiteBranchBeforeDelete(
	executionContext: LandExecutionContext,
	options: MaintenanceOperationInput,
): Promise<GraphiteMaintenanceStop | undefined> {
	const { land: landContext } = executionContext;
	const { repoRoot, plan, prNumber, landedBranch: branch, state, maintenance } = options;
	// Re-check the branch's Graphite children right before the forced delete: a
	// child that appeared since planning means another stack now depends on it.
	const skippedScope = `local branch ${branch} cleanup was`;
	const children = await landContext.graphite.branchChildren({
		repoRoot,
		metadataDbPath: plan.metadataDbPath,
		branch,
	});
	if (children.type === "failure") {
		return failOrWarn(maintenance, {
			failure: landingExecutionFailure(
				`PR #${prNumber} merged, but the pre-delete Graphite children re-check for ${branch} failed; refusing gt delete without an authoritative child list.\n${children.failure.message}`,
				{
					failedBranch: branch,
					failedPrNumber: prNumber,
					suggestedAction: `Inspect the stack, then delete local branch ${branch} manually when safe. ${LAND_BACKUP_RECOVERY_HINT}`,
				},
			),
			warning: landingWarning({
				message: `All target PRs were merged, but the pre-delete Graphite children re-check for ${branch} failed; ${skippedScope} skipped.\n${children.failure.message}`,
				suggestedAction: `Inspect the stack, then delete local branch ${branch} manually when safe. ${LAND_BACKUP_RECOVERY_HINT}`,
			}),
		});
	}
	const childrenNow = children.value;
	const allowedChildren = new Set(state.deletedBranches);
	for (const maintenanceBranch of maintenance.branches) allowedChildren.add(maintenanceBranch);
	const unexpectedChildren = childrenNow.filter((child) => !allowedChildren.has(child));
	if (unexpectedChildren.length === 0) return undefined;

	return failOrWarn(maintenance, {
		failure: landingExecutionFailure(
			`PR #${prNumber} merged, but ${branch} now has unexpected Graphite children (${unexpectedChildren.join(", ")}); refusing gt delete to avoid destroying another stack.`,
			{
				failedBranch: branch,
				failedPrNumber: prNumber,
				suggestedAction: `Inspect the unexpected children, land or move them, then clean up local branch ${branch} manually before rerunning /ns:flow:land. ${LAND_BACKUP_RECOVERY_HINT}`,
			},
		),
		warning: landingWarning({
			message: `All target PRs were merged, but ${branch} now has unexpected Graphite children (${unexpectedChildren.join(", ")}); ${skippedScope} skipped.`,
			suggestedAction: `Inspect the unexpected children, then delete local branch ${branch} and restack descendants manually when safe. ${LAND_BACKUP_RECOVERY_HINT}`,
		}),
	});
}

async function deleteLocalGraphiteBranchAfterLanding(
	executionContext: LandExecutionContext,
	options: MaintenanceOperationInput,
): Promise<GraphiteMaintenanceOutcome> {
	const { land: landContext, progress } = executionContext;
	const { repoRoot, landedBranch: branch, prNumber, state, maintenance } = options;
	progress.note(`Cleaning up local branch ${branch}...`);
	progress.setStatus(`deleting local Graphite branch ${branch}...`);
	const deletion = await landContext.graphite.deleteLocalBranch({
		repoRoot,
		branch,
		checkedOutConflictHandling: maintenance.mode === "none" ? "retain" : "fail",
	});
	switch (deletion.type) {
		case "deleted":
			state.deletedBranches.add(branch);
			return { kind: "proceed" };
		case "retained":
			state.cleanup.retainedLocalBranches.push({ branch: deletion.branch, path: deletion.path });
			return { kind: "proceed" };
		case "failed":
			return failOrWarn(
				maintenance,
				localBranchDeletionFailurePair({
					branch,
					prNumber,
					commandDisplay: deletion.commandDisplay,
					result: deletion.result,
					isLikelyInProgressGitOperation: deletion.isLikelyInProgressGitOperation,
				}),
			);
		default:
			assertNever(deletion);
	}
}

async function restackMaintenanceBranch(
	executionContext: LandExecutionContext,
	options: MaintenanceBranchOperationInput,
): Promise<GraphiteMaintenanceOutcome> {
	const { land: landContext, progress } = executionContext;
	const { repoRoot, prNumber, maintenanceBranch, maintenance } = options;
	progress.setStatus(`restacking ${maintenanceBranch}...`);
	const restacked = await landContext.graphite.restack({
		repoRoot,
		branch: maintenanceBranch,
		scope: "branch-only",
	});
	if (restacked.type !== "failure") return { kind: "proceed" };

	return failOrWarn(maintenance, {
		failure: landingExecutionFailure(
			formatRestackFailureMessage(prNumber, maintenanceBranch, true),
			{
				displayCommand: restacked.commandDisplay,
				execResult: restacked.result,
				failedBranch: maintenanceBranch,
				suggestedAction: `Resolve restack failures for ${maintenanceBranch}, run gt submit/update, then rerun /ns:flow:land if appropriate.`,
			},
		),
		warning: landingWarning({
			message: formatRestackFailureMessage(prNumber, maintenanceBranch, false),
			commandDisplay: restacked.commandDisplay,
			result: restacked.result,
			suggestedAction: `Resolve restack failures for ${maintenanceBranch}, then update that PR manually.`,
		}),
	});
}

interface LocalBranchDeletionFailurePairOptions {
	branch: string;
	prNumber: number;
	commandDisplay: string;
	result: ExecResult;
	isLikelyInProgressGitOperation: boolean;
}

function localBranchDeletionFailurePair(options: LocalBranchDeletionFailurePairOptions): {
	failure: LandingExecutionFailure;
	warning: LandingWarning;
} {
	const details = localBranchDeletionFailureDetails(options);
	return {
		failure: landingExecutionFailure(details.failureMessage, {
			displayCommand: options.commandDisplay,
			execResult: options.result,
			failedBranch: options.branch,
			failedPrNumber: options.prNumber,
			suggestedAction: details.failureSuggestedAction,
		}),
		warning: landingWarning({
			message: details.warningMessage,
			commandDisplay: options.commandDisplay,
			result: options.result,
			suggestedAction: details.warningSuggestedAction,
		}),
	};
}

function localBranchDeletionFailureDetails(options: LocalBranchDeletionFailurePairOptions): {
	failureMessage: string;
	failureSuggestedAction: string;
	warningMessage: string;
	warningSuggestedAction: string;
} {
	if (!options.isLikelyInProgressGitOperation) {
		return {
			failureMessage: `PR #${options.prNumber} merged, but deleting the local Graphite branch ${options.branch} failed.`,
			failureSuggestedAction: `Delete or repair local Graphite branch ${options.branch} manually, then inspect the stack before rerunning /ns:flow:land.`,
			warningMessage: `All target PRs were merged, but deleting the local Graphite branch ${options.branch} failed.`,
			warningSuggestedAction: `Delete or repair local Graphite branch ${options.branch} manually, then inspect the stack.`,
		};
	}

	const baseMessage = `Graphite cleanup for local branch ${options.branch} stopped during branch deletion with an in-progress Git operation or conflicts. The repository may now be mid-rebase; do not rerun /ns:flow:land until it is resolved or aborted.`;
	const action = `Run git status. Resolve the conflicts and continue the Git operation, or run git rebase --abort if you want to back out of the cleanup restack; then inspect the stack and delete or repair local Graphite branch ${options.branch} manually before rerunning /ns:flow:land.`;
	return {
		failureMessage: `PR #${options.prNumber} merged, but ${baseMessage}`,
		failureSuggestedAction: action,
		warningMessage: `All target PRs were merged, but ${baseMessage}`,
		warningSuggestedAction: action,
	};
}

function assertNever(value: never): never {
	throw new Error(`Unhandled local branch deletion result: ${JSON.stringify(value)}`);
}
