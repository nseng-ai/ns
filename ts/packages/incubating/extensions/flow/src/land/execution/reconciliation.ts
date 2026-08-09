// Ordinary post-merge Graphite reconciliation and workflow dispatch.

import type { ExecResult } from "@nseng-ai/foundation/command";
import { LAND_BACKUP_RECOVERY_HINT, parseGitCheckedOutElsewhere } from "../graphite-operations.ts";
import { isReconciliationPrCurrent } from "../preflight.ts";
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
	blockedDescendantReconciliationFailure,
	formatCheckedOutElsewhere,
	formatRestackFailureMessage,
	formatSubmitFailureMessage,
	planPostMergeStackReconciliationTargets,
	planPostMergeStackReconciliation,
	type RequiredNextLandingReconciliation,
} from "./reconciliation-plan.ts";
import {
	checkBranchBeforeDelete,
	guardForcedRefresh,
	localBranchDeletionFailure,
	repairGraphiteBranchParent,
} from "./reconciliation-safety.ts";

interface StackReconciliationStep {
	readonly index: number;
	readonly branch: string;
	readonly prNumber: number;
	readonly state: MergeLoopState;
}

/** Phase a post-merge reconciliation halt is attributed to in the landing report. */
export type ReconciliationHaltPhase = "post-merge-stack-reconciliation" | "landed-branch-cleanup";

type StackReconciliationOutcome =
	| { kind: "proceed" }
	| { kind: "skip"; warning?: LandingWarning }
	| { kind: "halt"; failure: LandingExecutionFailure };

export type PerformedStackReconciliation =
	| { kind: "proceed" }
	| { kind: "skip"; warning?: LandingWarning }
	| { kind: "halt"; failure: LandingExecutionFailure; phase: ReconciliationHaltPhase };

interface GraphiteRefreshFailureOptions {
	prNumber: number;
	reconciliationBranch: string;
	getCommandDisplay: string;
	got: ExecResult;
}

function graphiteRefreshFailure(
	failureOptions: GraphiteRefreshFailureOptions,
): LandingExecutionFailure {
	const { prNumber, reconciliationBranch, getCommandDisplay, got } = failureOptions;
	const checkoutConflict = parseGitCheckedOutElsewhere(got);
	if (checkoutConflict) {
		return landingExecutionFailure(
			`PR #${prNumber} merged, but Graphite could not refresh next landing branch ${reconciliationBranch}: ${formatCheckedOutElsewhere(checkoutConflict)}.`,
			{
				displayCommand: getCommandDisplay,
				execResult: got,
				failedBranch: reconciliationBranch,
				suggestedAction: `Switch/detach ${checkoutConflict.path} from ${checkoutConflict.branch}, then run ${getCommandDisplay} manually, inspect the stack, and rerun /ns:flow:land if appropriate.`,
			},
		);
	}

	return landingExecutionFailure(`PR #${prNumber} merged, but targeted Graphite refresh failed.`, {
		displayCommand: getCommandDisplay,
		execResult: got,
		failedBranch: reconciliationBranch,
		suggestedAction: `Run ${getCommandDisplay} manually, inspect the stack, and rerun /ns:flow:land if appropriate.`,
	});
}

interface ReconciliationOperationInput {
	readonly repoRoot: string;
	readonly plan: LandingPlan;
	readonly prNumber: number;
	readonly landedBranch: string;
	readonly state: MergeLoopState;
	readonly reconciliation: RequiredNextLandingReconciliation;
}

interface ReconciliationBranchOperationInput extends ReconciliationOperationInput {
	readonly reconciliationBranch: string;
}

type SubmitReconciliationCheckOutcome =
	| { kind: "submit" }
	| { kind: "skip-submit" }
	| { kind: "halt"; failure: LandingExecutionFailure };

function withReconciliationBranch(
	operationInput: ReconciliationOperationInput,
	reconciliationBranch: string,
): ReconciliationBranchOperationInput {
	return { ...operationInput, reconciliationBranch };
}

export async function reconcileStackAfterMerge(
	executionContext: LandExecutionContext,
	options: { readonly plan: LandingPlan; readonly step: StackReconciliationStep },
): Promise<PerformedStackReconciliation> {
	const { plan, step } = options;
	const reconciliation = planPostMergeStackReconciliationTargets(plan, step.index);
	if (reconciliation.mode !== "required-next-landing") {
		throw new Error("Post-merge stack reconciliation requires a next selected landing branch.");
	}
	const outcome = await reconcileTargetBranches(executionContext, {
		repoRoot: plan.repoRoot,
		plan,
		prNumber: step.prNumber,
		landedBranch: step.branch,
		state: step.state,
		reconciliation,
	});
	return outcome.kind === "halt"
		? { ...outcome, phase: "post-merge-stack-reconciliation" }
		: outcome;
}

export async function reconcilePostTargetSurvivors(
	executionContext: LandExecutionContext,
	plan: LandingPlan,
	landed: readonly LandedPullRequest[],
	state: MergeLoopState,
): Promise<PerformedStackReconciliation> {
	const lastLanded = landed.at(-1);
	if (lastLanded === undefined) return { kind: "proceed" };
	const reconciliation = planPostMergeStackReconciliation(plan);
	if (reconciliation.mode === "blocked-descendants") {
		return {
			kind: "halt",
			phase: "post-merge-stack-reconciliation",
			failure: blockedDescendantReconciliationFailure(plan, lastLanded.branch, lastLanded.number),
		};
	}
	if (reconciliation.mode === "required-descendants") {
		return await reconcileDescendantRoots(executionContext, {
			plan,
			prNumber: lastLanded.number,
			landedBranch: lastLanded.branch,
			state,
			reconciliation,
		});
	}
	if (reconciliation.mode === "none") return { kind: "proceed" };
	const outcome = await reconcileTargetBranches(
		executionContext,
		{
			repoRoot: plan.repoRoot,
			plan,
			prNumber: lastLanded.number,
			landedBranch: lastLanded.branch,
			state,
			reconciliation,
		},
		"surviving-stack",
	);
	return outcome.kind === "halt"
		? { ...outcome, phase: "post-merge-stack-reconciliation" }
		: outcome;
}

export async function cleanUpLandedBranches(
	executionContext: LandExecutionContext,
	plan: LandingPlan,
	landed: readonly LandedPullRequest[],
	state: MergeLoopState,
): Promise<PerformedStackReconciliation> {
	const selectedLandedBranches = new Set([
		...landed.map((landedPullRequest) => landedPullRequest.branch),
		...planPostMergeStackReconciliation(plan).branches,
	]);
	for (const landedPullRequest of landed) {
		const cleanup = await cleanUpLandedBranchBestEffort(executionContext, {
			repoRoot: plan.repoRoot,
			plan,
			prNumber: landedPullRequest.number,
			landedBranch: landedPullRequest.branch,
			state,
			allowedChildren: selectedLandedBranches,
		});
		if (cleanup.kind === "halt") return { ...cleanup, phase: "landed-branch-cleanup" };
		if (cleanup.kind === "skip" && cleanup.warning !== undefined) {
			state.warnings.push(cleanup.warning);
		}
	}
	return { kind: "proceed" };
}

/** Required target reconciliation: refresh/restack/submit. */
async function reconcileTargetBranches(
	executionContext: LandExecutionContext,
	operationInput: ReconciliationOperationInput,
	operation: "next-selected-branch" | "surviving-stack" = "next-selected-branch",
): Promise<StackReconciliationOutcome> {
	const { progress } = executionContext;
	const { reconciliation } = operationInput;
	for (const reconciliationBranch of reconciliation.branches) {
		const branchOperationContext = withReconciliationBranch(operationInput, reconciliationBranch);
		const guard = await guardReconciliationBranch(executionContext, branchOperationContext);
		if (guard !== undefined) return guard;
		const refresh = await refreshReconciliationBranch(executionContext, branchOperationContext);
		if (refresh !== undefined) return refresh;
	}

	if (operation === "surviving-stack") {
		for (const reconciliationBranch of reconciliation.branches) {
			const repairFailure = await repairGraphiteBranchParent(executionContext, {
				repoRoot: operationInput.repoRoot,
				prNumber: operationInput.prNumber,
				branch: reconciliationBranch,
				parent: operationInput.plan.stack.trunk,
				failureSubject: reconciliationBranch,
			});
			if (repairFailure !== undefined) return { kind: "halt", failure: repairFailure };
		}
	}

	for (const reconciliationBranch of reconciliation.branches) {
		const branchOperationContext = withReconciliationBranch(operationInput, reconciliationBranch);
		const restacked = await restackReconciliationBranch(executionContext, branchOperationContext);
		if (restacked.kind !== "proceed") return restacked;
		if (operation === "surviving-stack") {
			const topologyProof = await verifyReconciliationBranchParent(
				executionContext,
				branchOperationContext,
			);
			if (topologyProof !== undefined) return topologyProof;
		}

		const submitCheck = await checkSubmitReconciliationBranch(
			executionContext,
			branchOperationContext,
		);
		if (submitCheck.kind === "halt") return submitCheck;

		if (submitCheck.kind === "skip-submit") {
			progress.note(`Skipped gt submit for ${reconciliationBranch}; PR metadata already current.`);
			continue;
		}

		progress.setStatus(`submitting ${reconciliationBranch}...`);
		const submitted = await submitReconciliationBranch(executionContext, branchOperationContext);
		if (submitted.kind !== "proceed") return submitted;
	}

	return { kind: "proceed" };
}

async function verifyReconciliationBranchParent(
	executionContext: LandExecutionContext,
	options: ReconciliationBranchOperationInput,
): Promise<{ kind: "halt"; failure: LandingExecutionFailure } | undefined> {
	const { repoRoot, plan, prNumber, reconciliationBranch } = options;
	const expectedParent = plan.stack.trunk;
	const providerParent = await executionContext.land.graphite.branchParent({
		repoRoot,
		metadataDbPath: plan.metadataDbPath,
		branch: reconciliationBranch,
	});
	if (providerParent.type === "success" && providerParent.value === expectedParent)
		return undefined;

	const message =
		providerParent.type === "failure"
			? `PR #${prNumber} merged, but could not verify provider topology for ${reconciliationBranch} after reconciliation.\n${providerParent.failure.message}`
			: `PR #${prNumber} merged, but provider topology still reports ${reconciliationBranch} parented on ${providerParent.value ?? "(untracked)"}, expected ${expectedParent}.`;
	return {
		kind: "halt",
		failure: landingExecutionFailure(message, {
			failedBranch: reconciliationBranch,
			suggestedAction: `Inspect the stack topology for ${reconciliationBranch}, reparent it onto ${expectedParent}, restack/update it, then rerun /ns:flow:land if appropriate. ${LAND_BACKUP_RECOVERY_HINT}`,
		}),
	};
}

async function checkSubmitReconciliationBranch(
	executionContext: LandExecutionContext,
	options: ReconciliationBranchOperationInput,
): Promise<SubmitReconciliationCheckOutcome> {
	const { land: landContext } = executionContext;
	const { repoRoot, plan, prNumber, reconciliationBranch } = options;
	const localSha = await landContext.git.localBranchSha({ repoRoot, branch: reconciliationBranch });
	if (localSha.type === "failure") {
		return {
			kind: "halt",
			failure: landingExecutionFailure(
				`PR #${prNumber} merged, but could not re-read local branch ${reconciliationBranch} after restack.\n${localSha.failure.message}`,
				{
					failedBranch: reconciliationBranch,
					suggestedAction: `Inspect local branch ${reconciliationBranch}, run gt submit/update if appropriate, then rerun /ns:flow:land if needed. ${LAND_BACKUP_RECOVERY_HINT}`,
				},
			),
		};
	}

	const pr = await landContext.github.pullRequestFacts({
		repoRoot,
		branchOrNumber: reconciliationBranch,
	});
	if (pr.type === "failure") {
		return {
			kind: "halt",
			failure: landingExecutionFailure(
				`PR #${prNumber} merged, but could not verify PR metadata for ${reconciliationBranch} after restack.\n${pr.failure.message}`,
				{
					failedBranch: reconciliationBranch,
					suggestedAction: `Inspect PR metadata for ${reconciliationBranch}, run gt submit/update if appropriate, then rerun /ns:flow:land if needed.`,
				},
			),
		};
	}

	return isReconciliationPrCurrent({
		pr: pr.value,
		branch: reconciliationBranch,
		localSha: localSha.value,
		expectedBase: plan.stack.trunk,
	})
		? { kind: "skip-submit" }
		: { kind: "submit" };
}

async function submitReconciliationBranch(
	executionContext: LandExecutionContext,
	options: ReconciliationBranchOperationInput,
): Promise<StackReconciliationOutcome> {
	const { land: landContext } = executionContext;
	const { repoRoot, plan, prNumber, reconciliationBranch } = options;
	// Post-merge reconciliation restacks after a landed PR, so the remote PR branch may
	// still be on old stack history; keep pre-merge submit/update conservative.
	const submitted = await landContext.graphite.submitUpdate({
		repoRoot,
		branch: reconciliationBranch,
		force: true,
	});
	if (submitted.type === "success") return { kind: "proceed" };

	return {
		kind: "halt",
		failure: landingExecutionFailure(
			formatSubmitFailureMessage(prNumber, reconciliationBranch, true),
			{
				displayCommand: submitted.commandDisplay,
				execResult: submitted.result,
				failedBranch: reconciliationBranch,
				suggestedAction: `Update PR for ${reconciliationBranch} manually, verify it targets ${plan.stack.trunk}, then rerun /ns:flow:land if appropriate.`,
			},
		),
	};
}

async function guardReconciliationBranch(
	executionContext: LandExecutionContext,
	options: ReconciliationBranchOperationInput,
): Promise<{ kind: "halt"; failure: LandingExecutionFailure } | undefined> {
	const { repoRoot, prNumber, reconciliationBranch, state } = options;
	const failure = await guardForcedRefresh(executionContext, {
		repoRoot,
		prNumber,
		branch: reconciliationBranch,
		expectedSha: state.expectedShas.get(reconciliationBranch),
	});
	return failure === undefined ? undefined : { kind: "halt", failure };
}

async function refreshReconciliationBranch(
	executionContext: LandExecutionContext,
	options: ReconciliationBranchOperationInput,
): Promise<{ kind: "halt"; failure: LandingExecutionFailure } | undefined> {
	const { land: landContext, progress } = executionContext;
	const { repoRoot, prNumber, reconciliationBranch } = options;
	progress.note(`Refreshing stack through ${reconciliationBranch}...`);
	progress.setStatus(`refreshing stack through ${reconciliationBranch}...`);
	const refresh = await landContext.graphite.refreshBranchFromRemote({
		repoRoot,
		branch: reconciliationBranch,
		checkedOutConflictHandling: "fail",
	});
	if (refresh.type === "success") return undefined;

	return {
		kind: "halt",
		failure: graphiteRefreshFailure({
			prNumber,
			reconciliationBranch,
			getCommandDisplay: refresh.commandDisplay,
			got: refresh.result,
		}),
	};
}

async function restackReconciliationBranch(
	executionContext: LandExecutionContext,
	options: ReconciliationBranchOperationInput,
): Promise<StackReconciliationOutcome> {
	const { land: landContext, progress } = executionContext;
	const { repoRoot, prNumber, reconciliationBranch } = options;
	progress.setStatus(`restacking ${reconciliationBranch}...`);
	const restacked = await landContext.graphite.restack({
		repoRoot,
		branch: reconciliationBranch,
		scope: "branch-only",
	});
	if (restacked.type !== "failure") return { kind: "proceed" };

	return {
		kind: "halt",
		failure: landingExecutionFailure(
			formatRestackFailureMessage(prNumber, reconciliationBranch, true),
			{
				displayCommand: restacked.commandDisplay,
				execResult: restacked.result,
				failedBranch: reconciliationBranch,
				suggestedAction: `Resolve restack failures for ${reconciliationBranch}, run gt submit/update, then rerun /ns:flow:land if appropriate.`,
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
): Promise<StackReconciliationOutcome> {
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
