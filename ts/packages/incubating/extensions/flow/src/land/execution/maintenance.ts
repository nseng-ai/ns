// Ordinary post-merge Graphite maintenance and workflow dispatch.

import type { ExecResult } from "@nseng-ai/foundation/command";
import { LAND_BACKUP_RECOVERY_HINT, parseGitCheckedOutElsewhere } from "../graphite-operations.ts";
import { isMaintenancePrCurrent } from "../preflight.ts";
import { landingExecutionFailure } from "../results.ts";
import type { LandingExecutionFailure, LandingPlan, LandingWarning } from "../types.ts";
import type { LandExecutionContext } from "./execution-context.ts";
import type { MergeLoopState } from "./merge-loop.ts";
import {
	formatCheckedOutElsewhere,
	formatRestackFailureMessage,
	formatSubmitFailureMessage,
	type RequiredNextLandingMaintenance,
} from "./maintenance-plan.ts";
import { guardForcedRefresh, repairGraphiteBranchParent } from "./maintenance-safety.ts";

export interface PrepareNextSelectedLandingOptions {
	readonly plan: LandingPlan;
	readonly landedBranch: string;
	readonly landedPrNumber: number;
	readonly nextSelectedBranch: string;
	readonly state: MergeLoopState;
}

type GraphiteMaintenanceOutcome =
	| { kind: "proceed" }
	| { kind: "skip"; warning?: LandingWarning }
	| { kind: "halt"; failure: LandingExecutionFailure };

export type PreparedNextSelectedLanding =
	| { kind: "proceed" }
	| { kind: "skip"; warning?: LandingWarning }
	| { kind: "halt"; failure: LandingExecutionFailure; phase: "between-selected-maintenance" };

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

export async function prepareNextSelectedLanding(
	executionContext: LandExecutionContext,
	options: PrepareNextSelectedLandingOptions,
): Promise<PreparedNextSelectedLanding> {
	const outcome = await maintainNextLandingBranches(executionContext, {
		repoRoot: options.plan.repoRoot,
		plan: options.plan,
		prNumber: options.landedPrNumber,
		landedBranch: options.landedBranch,
		state: options.state,
		maintenance: { mode: "required-next-landing", branches: [options.nextSelectedBranch] },
	});
	return outcome.kind === "halt" ? { ...outcome, phase: "between-selected-maintenance" } : outcome;
}

/** Required next-landing maintenance: refresh/delete/restack/submit. */
async function maintainNextLandingBranches(
	executionContext: LandExecutionContext,
	operationInput: MaintenanceOperationInput,
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

	for (const maintenanceBranch of maintenance.branches) {
		const branchOperationContext = withMaintenanceBranch(operationInput, maintenanceBranch);
		const restacked = await restackMaintenanceBranch(executionContext, branchOperationContext);
		if (restacked.kind !== "proceed") return restacked;

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

	options.state.expectedShas.set(maintenanceBranch, localSha.value);
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
