import { shortSha } from "../../commit-display/index.ts";
import { LAND_BACKUP_RECOVERY_HINT } from "../graphite-operations.ts";
import { isReconciliationPrCurrent } from "../preflight.ts";
import { landingExecutionFailure } from "../results.ts";
import type { LandingExecutionFailure, LandingPlan, PullRequestFacts } from "../types.ts";
import type { LandExecutionContext } from "./execution-context.ts";
import type { MergeLoopState } from "./merge-loop.ts";
import {
	formatCheckedOutElsewhere,
	type RequiredDescendantReconciliation,
} from "./reconciliation-plan.ts";
import { guardForcedRefresh, repairGraphiteBranchParent } from "./reconciliation-safety.ts";

export type DescendantReconciliationOutcome =
	| { readonly kind: "proceed" }
	| {
			readonly kind: "halt";
			readonly phase: "post-merge-stack-reconciliation";
			readonly failure: LandingExecutionFailure;
	  };

export interface ReconcileDescendantRootsOptions {
	readonly plan: LandingPlan;
	readonly prNumber: number;
	readonly landedBranch: string;
	readonly state: MergeLoopState;
	readonly reconciliation: RequiredDescendantReconciliation;
}

interface DescendantBranchOptions extends ReconcileDescendantRootsOptions {
	readonly reconciliationBranch: string;
}

type DescendantRootPrFacts =
	| { readonly kind: "facts"; readonly pr: PullRequestFacts }
	| { readonly kind: "failure"; readonly failure: LandingExecutionFailure };

interface PreparedDescendantRoot {
	readonly branch: string;
	readonly localSha: string;
}

type DescendantRootPreparation =
	| { readonly kind: "prepared"; readonly proof: PreparedDescendantRoot }
	| { readonly kind: "failure"; readonly failure: LandingExecutionFailure };

export async function reconcileDescendantRoots(
	executionContext: LandExecutionContext,
	options: ReconcileDescendantRootsOptions,
): Promise<DescendantReconciliationOutcome> {
	const { reconciliation } = options;

	for (const reconciliationBranch of reconciliation.branches) {
		const guardFailure = await guardDescendantBranch(executionContext, {
			...options,
			reconciliationBranch,
		});
		if (guardFailure !== undefined) return reconciliationHalt(guardFailure);
	}

	for (const reconciliationBranch of reconciliation.branches) {
		const refreshFailure = await refreshDescendantBranch(executionContext, {
			...options,
			reconciliationBranch,
		});
		if (refreshFailure !== undefined) return reconciliationHalt(refreshFailure);
	}

	for (const reconciliationBranch of reconciliation.branches) {
		const reparentFailure = await repairGraphiteBranchParent(executionContext, {
			repoRoot: options.plan.repoRoot,
			prNumber: options.prNumber,
			branch: reconciliationBranch,
			parent: options.plan.stack.trunk,
			failureSubject: `descendant root ${reconciliationBranch}`,
		});
		if (reparentFailure !== undefined) return reconciliationHalt(reparentFailure);
	}

	const preparedRoots: PreparedDescendantRoot[] = [];
	for (const reconciliationBranch of reconciliation.branches) {
		const preparation = await prepareDescendantRoot(executionContext, {
			...options,
			reconciliationBranch,
		});
		if (preparation.kind === "failure") return reconciliationHalt(preparation.failure);
		preparedRoots.push(preparation.proof);
	}

	for (const proof of preparedRoots) {
		const publicationFailure = await publishPreparedDescendantRoot(
			executionContext,
			{ ...options, reconciliationBranch: proof.branch },
			proof,
		);
		if (publicationFailure !== undefined) return reconciliationHalt(publicationFailure);
	}
	return { kind: "proceed" };
}

async function guardDescendantBranch(
	executionContext: LandExecutionContext,
	options: DescendantBranchOptions,
): Promise<LandingExecutionFailure | undefined> {
	const { plan, prNumber, reconciliationBranch, state } = options;
	return guardForcedRefresh(executionContext, {
		repoRoot: plan.repoRoot,
		prNumber,
		branch: reconciliationBranch,
		expectedSha: state.expectedShas.get(reconciliationBranch),
	});
}

async function refreshDescendantBranch(
	executionContext: LandExecutionContext,
	options: DescendantBranchOptions,
): Promise<LandingExecutionFailure | undefined> {
	const { land: landContext, progress } = executionContext;
	const { plan, prNumber, reconciliationBranch, landedBranch } = options;
	progress.note(`Refreshing stack through ${reconciliationBranch}...`);
	progress.setStatus(`refreshing stack through ${reconciliationBranch}...`);
	const refresh = await landContext.graphite.refreshBranchFromRemote({
		repoRoot: plan.repoRoot,
		branch: reconciliationBranch,
		checkedOutConflictHandling: "defer",
	});
	if (refresh.type === "success") return undefined;
	if (refresh.type === "checkout-conflict") {
		return landingExecutionFailure(
			`PR #${prNumber} merged, but descendant branch ${reconciliationBranch} could not be refreshed because ${formatCheckedOutElsewhere(refresh)}; it was not mutated.`,
			{
				displayCommand: refresh.commandDisplay,
				execResult: refresh.result,
				failedBranch: reconciliationBranch,
				suggestedAction: `Switch/detach ${refresh.path} from ${refresh.branch}, then run ${refresh.commandDisplay}, restack/update ${reconciliationBranch}, and delete local branch ${landedBranch} when safe. ${LAND_BACKUP_RECOVERY_HINT}`,
			},
		);
	}
	return landingExecutionFailure(`PR #${prNumber} merged, but targeted Graphite refresh failed.`, {
		displayCommand: refresh.commandDisplay,
		execResult: refresh.result,
		failedBranch: reconciliationBranch,
		suggestedAction: `Run ${refresh.commandDisplay} manually, inspect the stack, and rerun /ns:flow:land if appropriate.`,
	});
}

async function prepareDescendantRoot(
	executionContext: LandExecutionContext,
	options: DescendantBranchOptions,
): Promise<DescendantRootPreparation> {
	const { land: landContext, progress } = executionContext;
	const { plan, prNumber, reconciliationBranch, state } = options;
	const { repoRoot } = plan;
	const trunk = plan.stack.trunk;
	progress.setStatus(`restacking ${reconciliationBranch}...`);
	const restacked = await landContext.graphite.restack({
		repoRoot,
		branch: reconciliationBranch,
		scope: "upstack",
	});
	if (restacked.type === "failure") {
		return descendantPreparationFailure(
			landingExecutionFailure(
				`PR #${prNumber} merged, but restack failed for descendant root ${reconciliationBranch}.`,
				{
					displayCommand: restacked.commandDisplay,
					execResult: restacked.result,
					failedBranch: reconciliationBranch,
					suggestedAction: `Resolve restack failures for ${reconciliationBranch}, restack it onto ${trunk}, then submit/update its PR. ${LAND_BACKUP_RECOVERY_HINT}`,
				},
			),
		);
	}
	progress.setStatus(`verifying ${reconciliationBranch}...`);
	const postRestackSha = await landContext.git.localBranchSha({
		repoRoot,
		branch: reconciliationBranch,
	});
	if (postRestackSha.type === "failure") {
		return descendantPreparationFailure(
			landingExecutionFailure(
				`PR #${prNumber} merged, but could not re-read local branch ${reconciliationBranch} after restack.\n${postRestackSha.failure.message}`,
				{
					failedBranch: reconciliationBranch,
					suggestedAction: `Inspect local branch ${reconciliationBranch}, then restack/update it manually if needed. ${LAND_BACKUP_RECOVERY_HINT}`,
				},
			),
		);
	}
	state.expectedShas.set(reconciliationBranch, postRestackSha.value);
	const containsTrunk = await landContext.git.branchContainsParent({
		repoRoot,
		branch: reconciliationBranch,
		parent: trunk,
	});
	if (containsTrunk.type === "failure") {
		return descendantPreparationFailure(
			landingExecutionFailure(
				`PR #${prNumber} merged, but could not verify that ${reconciliationBranch} contains refreshed trunk ${trunk} after restack.\n${containsTrunk.failure.message}`,
				{
					failedBranch: reconciliationBranch,
					suggestedAction: `Inspect ${reconciliationBranch}, restack it onto ${trunk} manually, then submit/update its PR. ${LAND_BACKUP_RECOVERY_HINT}`,
				},
			),
		);
	}
	if (!containsTrunk.value) {
		return descendantPreparationFailure(
			landingExecutionFailure(
				`PR #${prNumber} merged and gt restack exited 0, but descendant root ${reconciliationBranch} still does not contain refreshed trunk ${trunk}; refusing to treat the restack as complete.`,
				{
					failedBranch: reconciliationBranch,
					suggestedAction: `Restack ${reconciliationBranch} onto ${trunk} manually, verify its history, then submit/update its PR. ${LAND_BACKUP_RECOVERY_HINT}`,
				},
			),
		);
	}
	const providerParent = await landContext.graphite.branchParent({
		repoRoot,
		metadataDbPath: plan.metadataDbPath,
		branch: reconciliationBranch,
	});
	if (providerParent.type === "failure") {
		return descendantPreparationFailure(
			landingExecutionFailure(
				`PR #${prNumber} merged, but could not verify provider topology for ${reconciliationBranch} after restack.\n${providerParent.failure.message}`,
				{
					failedBranch: reconciliationBranch,
					suggestedAction: `Inspect the stack topology for ${reconciliationBranch}, reparent it onto ${trunk} if needed, then submit/update its PR. ${LAND_BACKUP_RECOVERY_HINT}`,
				},
			),
		);
	}
	if (providerParent.value !== trunk) {
		return descendantPreparationFailure(
			landingExecutionFailure(
				`PR #${prNumber} merged and gt restack exited 0, but provider topology still reports ${reconciliationBranch} parented on ${providerParent.value ?? "(untracked)"}, expected ${trunk}.`,
				{
					failedBranch: reconciliationBranch,
					suggestedAction: `Reparent ${reconciliationBranch} onto ${trunk} (for example gt move --onto ${trunk}), restack, then submit/update its PR. ${LAND_BACKUP_RECOVERY_HINT}`,
				},
			),
		);
	}
	return {
		kind: "prepared",
		proof: { branch: reconciliationBranch, localSha: postRestackSha.value },
	};
}

function descendantPreparationFailure(failure: LandingExecutionFailure): DescendantRootPreparation {
	return { kind: "failure", failure };
}

async function publishPreparedDescendantRoot(
	executionContext: LandExecutionContext,
	options: DescendantBranchOptions,
	proof: PreparedDescendantRoot,
): Promise<LandingExecutionFailure | undefined> {
	const { land: landContext, progress } = executionContext;
	const { plan, prNumber, reconciliationBranch } = options;
	const { repoRoot } = plan;
	const trunk = plan.stack.trunk;
	const preSubmitFacts = await loadDescendantRootPrFacts(
		executionContext,
		options,
		"before submit",
	);
	if (preSubmitFacts.kind === "failure") return preSubmitFacts.failure;
	if (
		isReconciliationPrCurrent({
			pr: preSubmitFacts.pr,
			branch: reconciliationBranch,
			localSha: proof.localSha,
			expectedBase: trunk,
		})
	) {
		progress.note(
			`Skipped gt submit for ${reconciliationBranch}; remote PR facts already match the reconciled state.`,
		);
		return undefined;
	}
	progress.setStatus(`submitting ${reconciliationBranch}...`);
	const submitted = await landContext.graphite.submitUpdate({
		repoRoot,
		branch: reconciliationBranch,
		force: true,
	});
	if (submitted.type === "failure") {
		return landingExecutionFailure(
			`PR #${prNumber} merged, but submit/update failed for descendant root ${reconciliationBranch}.`,
			{
				displayCommand: submitted.commandDisplay,
				execResult: submitted.result,
				failedBranch: reconciliationBranch,
				suggestedAction: `Update PR for ${reconciliationBranch} manually, verify it targets ${trunk}, and verify its head on GitHub. ${LAND_BACKUP_RECOVERY_HINT}`,
			},
		);
	}
	const postSubmitFacts = await loadDescendantRootPrFacts(
		executionContext,
		options,
		"after submit",
	);
	if (postSubmitFacts.kind === "failure") return postSubmitFacts.failure;
	if (
		!isReconciliationPrCurrent({
			pr: postSubmitFacts.pr,
			branch: reconciliationBranch,
			localSha: proof.localSha,
			expectedBase: trunk,
		})
	) {
		return landingExecutionFailure(
			`PR #${prNumber} merged and gt submit exited 0, but GitHub facts for ${reconciliationBranch} remain stale: state ${postSubmitFacts.pr.state}, head ${postSubmitFacts.pr.headRefName} at ${shortSha(postSubmitFacts.pr.headRefOid)} (expected ${shortSha(proof.localSha)}), base ${postSubmitFacts.pr.baseRefName} (expected ${trunk}).`,
			{
				failedBranch: reconciliationBranch,
				failedPrNumber: postSubmitFacts.pr.number,
				suggestedAction: `Update the PR for ${reconciliationBranch} manually and verify its head and base on GitHub. ${LAND_BACKUP_RECOVERY_HINT}`,
			},
		);
	}
	return undefined;
}

async function loadDescendantRootPrFacts(
	executionContext: LandExecutionContext,
	options: DescendantBranchOptions,
	moment: "before submit" | "after submit",
): Promise<DescendantRootPrFacts> {
	const { land: landContext } = executionContext;
	const { plan, prNumber, reconciliationBranch } = options;
	const pr = await landContext.github.pullRequestFacts({
		repoRoot: plan.repoRoot,
		branchOrNumber: reconciliationBranch,
	});
	if (pr.type === "failure") {
		return {
			kind: "failure",
			failure: landingExecutionFailure(
				`PR #${prNumber} merged, but could not verify PR metadata for ${reconciliationBranch} ${moment}.\n${pr.failure.message}`,
				{
					failedBranch: reconciliationBranch,
					suggestedAction: `Inspect PR metadata for ${reconciliationBranch}, run gt submit/update if appropriate, then verify the PR on GitHub. ${LAND_BACKUP_RECOVERY_HINT}`,
				},
			),
		};
	}
	return { kind: "facts", pr: pr.value };
}

function reconciliationHalt(failure: LandingExecutionFailure): DescendantReconciliationOutcome {
	return { kind: "halt", phase: "post-merge-stack-reconciliation", failure };
}
