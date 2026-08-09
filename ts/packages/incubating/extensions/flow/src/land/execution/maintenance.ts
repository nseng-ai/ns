// Ordinary post-merge Graphite maintenance and workflow dispatch.

import type { ExecResult } from "@nseng-ai/foundation/command";
import { LAND_BACKUP_RECOVERY_HINT, parseGitCheckedOutElsewhere } from "../graphite-operations.ts";
import { isMaintenancePrCurrent } from "../preflight.ts";
import { landingExecutionFailure } from "../results.ts";
import type {
	LandedPullRequest,
	LandingExecutionFailure,
	LandingPlan,
	LandingWarning,
} from "../types.ts";
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
	planPostTargetMaintenance,
	type RequiredNextLandingMaintenance,
} from "./maintenance-plan.ts";
import {
	checkBranchBeforeDelete,
	guardForcedRefresh,
	localBranchDeletionFailure,
	repairGraphiteBranchParent,
} from "./maintenance-safety.ts";

interface GraphiteMaintenanceStep {
	readonly index: number;
	readonly branch: string;
	readonly prNumber: number;
	readonly state: MergeLoopState;
}

/** Phase a post-merge maintenance halt is attributed to in the landing report. */
export type MaintenanceHaltPhase =
	| "post-target-maintenance"
	| "descendant-maintenance"
	| "merge-maintenance-cleanup";

type GraphiteMaintenanceOutcome =
	| { kind: "proceed" }
	| { kind: "skip"; warning?: LandingWarning }
	| { kind: "halt"; failure: LandingExecutionFailure };

export type PerformedGraphiteMaintenance =
	| { kind: "proceed" }
	| { kind: "skip"; warning?: LandingWarning }
	| { kind: "halt"; failure: LandingExecutionFailure; phase: MaintenanceHaltPhase };

interface GraphiteRefreshFailureOptions {
	prNumber: number;
	maintenanceBranch: string;
	getCommandDisplay: string;
	got: ExecResult;
}

function graphiteRefreshFailure(
	failureOptions: GraphiteRefreshFailureOptions,
): LandingExecutionFailure {
	const { prNumber, maintenanceBranch, getCommandDisplay, got } = failureOptions;
	const checkoutConflict = parseGitCheckedOutElsewhere(got);
	if (checkoutConflict) {
		return landingExecutionFailure(
			`PR #${prNumber} merged, but Graphite could not refresh next landing branch ${maintenanceBranch}: ${formatCheckedOutElsewhere(checkoutConflict)}.`,
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

interface MaintenanceOperationInput {
	readonly repoRoot: string;
	readonly plan: LandingPlan;
	readonly prNumber: number;
	readonly landedBranch: string;
	readonly state: MergeLoopState;
	readonly maintenance: RequiredNextLandingMaintenance;
}

interface MaintenanceBranchOperationInput extends MaintenanceOperationInput {
	readonly maintenanceBranch: string;
}

type SubmitMaintenanceCheckOutcome =
	| { kind: "submit" }
	| { kind: "skip-submit" }
	| { kind: "halt"; failure: LandingExecutionFailure };

function withMaintenanceBranch(
	operationInput: MaintenanceOperationInput,
	maintenanceBranch: string,
): MaintenanceBranchOperationInput {
	return { ...operationInput, maintenanceBranch };
}

export async function maintainBetweenLandingTargets(
	executionContext: LandExecutionContext,
	options: { readonly plan: LandingPlan; readonly step: GraphiteMaintenanceStep },
): Promise<PerformedGraphiteMaintenance> {
	const { plan, step } = options;
	const maintenance = planGraphiteMaintenanceTargets(plan, step.index);
	if (maintenance.mode !== "required-next-landing") {
		throw new Error("Between-target maintenance requires a next selected landing branch.");
	}
	const outcome = await maintainNextLandingBranches(executionContext, {
		repoRoot: plan.repoRoot,
		plan,
		prNumber: step.prNumber,
		landedBranch: step.branch,
		state: step.state,
		maintenance,
	});
	return outcome.kind === "halt" ? { ...outcome, phase: "merge-maintenance-cleanup" } : outcome;
}

export async function reconcilePostTargetSurvivors(
	executionContext: LandExecutionContext,
	options: {
		readonly plan: LandingPlan;
		readonly landed: readonly LandedPullRequest[];
		readonly state: MergeLoopState;
	},
): Promise<PerformedGraphiteMaintenance> {
	const lastLanded = options.landed.at(-1);
	if (lastLanded === undefined) return { kind: "proceed" };
	const maintenance = planPostTargetMaintenance(options.plan);
	if (maintenance.mode === "blocked-descendants") {
		return {
			kind: "halt",
			phase: "descendant-maintenance",
			failure: blockedDescendantMaintenanceFailure(
				options.plan,
				lastLanded.branch,
				lastLanded.number,
			),
		};
	}
	if (maintenance.mode === "required-descendants") {
		return await reconcileDescendantRoots(executionContext, {
			plan: options.plan,
			prNumber: lastLanded.number,
			landedBranch: lastLanded.branch,
			state: options.state,
			maintenance,
		});
	}
	if (maintenance.mode === "none") return { kind: "proceed" };
	const outcome = await maintainNextLandingBranches(
		executionContext,
		{
			repoRoot: options.plan.repoRoot,
			plan: options.plan,
			prNumber: lastLanded.number,
			landedBranch: lastLanded.branch,
			state: options.state,
			maintenance,
		},
		"survivor-reconciliation",
	);
	return outcome.kind === "halt" ? { ...outcome, phase: "post-target-maintenance" } : outcome;
}

export async function cleanUpLandedBranches(
	executionContext: LandExecutionContext,
	options: {
		readonly plan: LandingPlan;
		readonly landed: readonly LandedPullRequest[];
		readonly state: MergeLoopState;
	},
): Promise<PerformedGraphiteMaintenance> {
	const selectedLandedBranches = new Set([
		...options.landed.map((landed) => landed.branch),
		...planPostTargetMaintenance(options.plan).branches,
	]);
	for (const landed of options.landed) {
		const cleanup = await cleanUpLandedBranchBestEffort(executionContext, {
			repoRoot: options.plan.repoRoot,
			plan: options.plan,
			prNumber: landed.number,
			landedBranch: landed.branch,
			state: options.state,
			allowedChildren: selectedLandedBranches,
		});
		if (cleanup.kind === "halt") return { ...cleanup, phase: "merge-maintenance-cleanup" };
		if (cleanup.kind === "skip" && cleanup.warning !== undefined) {
			options.state.warnings.push(cleanup.warning);
		}
	}
	return { kind: "proceed" };
}

/** Required next-landing maintenance: refresh/restack/submit. */
async function maintainNextLandingBranches(
	executionContext: LandExecutionContext,
	operationInput: MaintenanceOperationInput,
	operation: "between-target" | "survivor-reconciliation" = "between-target",
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

	if (operation === "survivor-reconciliation") {
		for (const maintenanceBranch of maintenance.branches) {
			const repairFailure = await repairGraphiteBranchParent(executionContext, {
				repoRoot: operationInput.repoRoot,
				prNumber: operationInput.prNumber,
				branch: maintenanceBranch,
				parent: operationInput.plan.stack.trunk,
				failureSubject: maintenanceBranch,
			});
			if (repairFailure !== undefined) return { kind: "halt", failure: repairFailure };
		}
	}

	for (const maintenanceBranch of maintenance.branches) {
		const branchOperationContext = withMaintenanceBranch(operationInput, maintenanceBranch);
		const restacked = await restackMaintenanceBranch(executionContext, branchOperationContext);
		if (restacked.kind !== "proceed") return restacked;
		if (operation === "survivor-reconciliation") {
			const topologyProof = await verifyMaintenanceBranchParent(
				executionContext,
				branchOperationContext,
			);
			if (topologyProof !== undefined) return topologyProof;
		}

		const submitCheck = await checkSubmitMaintenanceBranch(
			executionContext,
			branchOperationContext,
		);
		if (submitCheck.kind === "halt") return submitCheck;

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

async function verifyMaintenanceBranchParent(
	executionContext: LandExecutionContext,
	options: MaintenanceBranchOperationInput,
): Promise<{ kind: "halt"; failure: LandingExecutionFailure } | undefined> {
	const { repoRoot, plan, prNumber, maintenanceBranch } = options;
	const expectedParent = plan.stack.trunk;
	const providerParent = await executionContext.land.graphite.branchParent({
		repoRoot,
		metadataDbPath: plan.metadataDbPath,
		branch: maintenanceBranch,
	});
	if (providerParent.type === "success" && providerParent.value === expectedParent)
		return undefined;

	const message =
		providerParent.type === "failure"
			? `PR #${prNumber} merged, but could not verify provider topology for ${maintenanceBranch} after reconciliation.\n${providerParent.failure.message}`
			: `PR #${prNumber} merged, but provider topology still reports ${maintenanceBranch} parented on ${providerParent.value ?? "(untracked)"}, expected ${expectedParent}.`;
	return {
		kind: "halt",
		failure: landingExecutionFailure(message, {
			failedBranch: maintenanceBranch,
			suggestedAction: `Inspect the stack topology for ${maintenanceBranch}, reparent it onto ${expectedParent}, restack/update it, then rerun /ns:flow:land if appropriate. ${LAND_BACKUP_RECOVERY_HINT}`,
		}),
	};
}

async function checkSubmitMaintenanceBranch(
	executionContext: LandExecutionContext,
	options: MaintenanceBranchOperationInput,
): Promise<SubmitMaintenanceCheckOutcome> {
	const { land: landContext } = executionContext;
	const { repoRoot, plan, prNumber, maintenanceBranch } = options;
	const localSha = await landContext.git.localBranchSha({ repoRoot, branch: maintenanceBranch });
	if (localSha.type === "failure") {
		return {
			kind: "halt",
			failure: landingExecutionFailure(
				`PR #${prNumber} merged, but could not re-read local branch ${maintenanceBranch} after restack.\n${localSha.failure.message}`,
				{
					failedBranch: maintenanceBranch,
					suggestedAction: `Inspect local branch ${maintenanceBranch}, run gt submit/update if appropriate, then rerun /ns:flow:land if needed. ${LAND_BACKUP_RECOVERY_HINT}`,
				},
			),
		};
	}

	const pr = await landContext.github.pullRequestFacts({
		repoRoot,
		branchOrNumber: maintenanceBranch,
	});
	if (pr.type === "failure") {
		return {
			kind: "halt",
			failure: landingExecutionFailure(
				`PR #${prNumber} merged, but could not verify PR metadata for ${maintenanceBranch} after restack.\n${pr.failure.message}`,
				{
					failedBranch: maintenanceBranch,
					suggestedAction: `Inspect PR metadata for ${maintenanceBranch}, run gt submit/update if appropriate, then rerun /ns:flow:land if needed.`,
				},
			),
		};
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
	const { repoRoot, plan, prNumber, maintenanceBranch } = options;
	// Post-merge maintenance restacks after a landed PR, so the remote PR branch may
	// still be on old stack history; keep pre-merge submit/update conservative.
	const submitted = await landContext.graphite.submitUpdate({
		repoRoot,
		branch: maintenanceBranch,
		force: true,
	});
	if (submitted.type === "success") return { kind: "proceed" };

	return {
		kind: "halt",
		failure: landingExecutionFailure(
			formatSubmitFailureMessage(prNumber, maintenanceBranch, true),
			{
				displayCommand: submitted.commandDisplay,
				execResult: submitted.result,
				failedBranch: maintenanceBranch,
				suggestedAction: `Update PR for ${maintenanceBranch} manually, verify it targets ${plan.stack.trunk}, then rerun /ns:flow:land if appropriate.`,
			},
		),
	};
}

async function guardMaintenanceBranch(
	executionContext: LandExecutionContext,
	options: MaintenanceBranchOperationInput,
): Promise<{ kind: "halt"; failure: LandingExecutionFailure } | undefined> {
	const { repoRoot, prNumber, maintenanceBranch, state } = options;
	const failure = await guardForcedRefresh(executionContext, {
		repoRoot,
		prNumber,
		branch: maintenanceBranch,
		expectedSha: state.expectedShas.get(maintenanceBranch),
	});
	return failure === undefined ? undefined : { kind: "halt", failure };
}

async function refreshMaintenanceBranch(
	executionContext: LandExecutionContext,
	options: MaintenanceBranchOperationInput,
): Promise<{ kind: "halt"; failure: LandingExecutionFailure } | undefined> {
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
			getCommandDisplay: refresh.commandDisplay,
			got: refresh.result,
		}),
	};
}

async function restackMaintenanceBranch(
	executionContext: LandExecutionContext,
	options: MaintenanceBranchOperationInput,
): Promise<GraphiteMaintenanceOutcome> {
	const { land: landContext, progress } = executionContext;
	const { repoRoot, prNumber, maintenanceBranch } = options;
	progress.setStatus(`restacking ${maintenanceBranch}...`);
	const restacked = await landContext.graphite.restack({
		repoRoot,
		branch: maintenanceBranch,
		scope: "branch-only",
	});
	if (restacked.type !== "failure") return { kind: "proceed" };

	return {
		kind: "halt",
		failure: landingExecutionFailure(
			formatRestackFailureMessage(prNumber, maintenanceBranch, true),
			{
				displayCommand: restacked.commandDisplay,
				execResult: restacked.result,
				failedBranch: maintenanceBranch,
				suggestedAction: `Resolve restack failures for ${maintenanceBranch}, run gt submit/update, then rerun /ns:flow:land if appropriate.`,
			},
		),
	};
}

async function cleanUpLandedBranchBestEffort(
	executionContext: LandExecutionContext,
	options: {
		readonly repoRoot: string;
		readonly plan: LandingPlan;
		readonly prNumber: number;
		readonly landedBranch: string;
		readonly state: MergeLoopState;
		readonly allowedChildren?: ReadonlySet<string>;
	},
): Promise<GraphiteMaintenanceOutcome> {
	const allowedChildren = new Set([
		...options.state.deletedBranches,
		...(options.allowedChildren ?? []),
	]);
	const checkFailure = await checkBranchBeforeDelete(executionContext, {
		repoRoot: options.repoRoot,
		metadataDbPath: options.plan.metadataDbPath,
		prNumber: options.prNumber,
		branch: options.landedBranch,
		allowedChildren,
	});
	if (checkFailure !== undefined) {
		return {
			kind: "skip",
			warning: landingWarning({
				message: checkFailure.warningMessage,
				suggestedAction: checkFailure.suggestedAction,
			}),
		};
	}

	const { progress } = executionContext;
	progress.note(`Cleaning up local branch ${options.landedBranch}...`);
	progress.setStatus(`deleting local Graphite branch ${options.landedBranch}...`);
	const deletion = await executionContext.land.graphite.deleteLocalBranchRetaining({
		repoRoot: options.repoRoot,
		branch: options.landedBranch,
	});
	if (deletion.type === "deleted") {
		options.state.deletedBranches.add(options.landedBranch);
		return { kind: "proceed" };
	}
	if (deletion.type === "retained") {
		options.state.cleanup.retainedLocalBranches.push({
			branch: deletion.branch,
			path: deletion.path,
		});
		return { kind: "proceed" };
	}

	return {
		kind: "halt",
		failure: localBranchDeletionFailure({
			branch: options.landedBranch,
			prNumber: options.prNumber,
			commandDisplay: deletion.commandDisplay,
			result: deletion.result,
			isLikelyInProgressGitOperation: deletion.isLikelyInProgressGitOperation,
		}),
	};
}
