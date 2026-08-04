import { shortSha } from "../../commit-display/index.ts";
import { LAND_BACKUP_RECOVERY_HINT } from "../graphite-operations.ts";
import { isMaintenancePrCurrent } from "../preflight.ts";
import { landingExecutionFailure } from "../results.ts";
import type { LandingExecutionFailure, LandingPlan, PullRequestFacts } from "../types.ts";
import type { LandExecutionContext } from "./execution-context.ts";
import type { MergeLoopState } from "./merge-loop.ts";
import {
	formatCheckedOutElsewhere,
	type RequiredDescendantMaintenance,
} from "./maintenance-plan.ts";

export type DescendantReconciliationOutcome =
	| { readonly kind: "proceed" }
	| {
			readonly kind: "halt";
			readonly phase: "descendant-maintenance";
			readonly failure: LandingExecutionFailure;
	  };

export interface ReconcileDescendantRootsOptions {
	readonly plan: LandingPlan;
	readonly prNumber: number;
	readonly landedBranch: string;
	readonly state: MergeLoopState;
	readonly maintenance: RequiredDescendantMaintenance;
	readonly shouldDeferLandedBranchDeletion: boolean;
}

interface DescendantBranchOptions extends ReconcileDescendantRootsOptions {
	readonly maintenanceBranch: string;
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
	| LandingExecutionFailure;

export async function reconcileDescendantRoots(
	executionContext: LandExecutionContext,
	options: ReconcileDescendantRootsOptions,
): Promise<DescendantReconciliationOutcome> {
	const { maintenance } = options;

	for (const maintenanceBranch of maintenance.branches) {
		const guardFailure = await guardDescendantBranch(executionContext, {
			...options,
			maintenanceBranch,
		});
		if (guardFailure !== undefined) return reconciliationHalt(guardFailure);
	}

	for (const maintenanceBranch of maintenance.branches) {
		const refreshFailure = await refreshDescendantBranch(executionContext, {
			...options,
			maintenanceBranch,
		});
		if (refreshFailure !== undefined) return reconciliationHalt(refreshFailure);
	}

	if (!options.shouldDeferLandedBranchDeletion) {
		const deleteCheckFailure = await checkLandedBranchBeforeDelete(executionContext, options);
		if (deleteCheckFailure !== undefined) return reconciliationHalt(deleteCheckFailure);
		const deletionFailure = await deleteLandedBranch(executionContext, options);
		if (deletionFailure !== undefined) return reconciliationHalt(deletionFailure);
	}

	const preparedRoots: PreparedDescendantRoot[] = [];
	for (const maintenanceBranch of maintenance.branches) {
		const preparation = await prepareDescendantRoot(executionContext, {
			...options,
			maintenanceBranch,
		});
		if ("type" in preparation) return reconciliationHalt(preparation);
		preparedRoots.push(preparation.proof);
	}

	for (const proof of preparedRoots) {
		const publicationFailure = await publishPreparedDescendantRoot(
			executionContext,
			{ ...options, maintenanceBranch: proof.branch },
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
	const { land: landContext } = executionContext;
	const { plan, prNumber, maintenanceBranch, state } = options;
	const guardSha = await landContext.git.localBranchSha({
		repoRoot: plan.repoRoot,
		branch: maintenanceBranch,
	});
	if (guardSha.type === "failure") {
		return landingExecutionFailure(
			`PR #${prNumber} merged, but could not verify local branch ${maintenanceBranch} before refreshing it.\n${guardSha.failure.message}`,
			{
				failedBranch: maintenanceBranch,
				suggestedAction: `Inspect local branch ${maintenanceBranch}, then rerun /ns:flow:land if appropriate. ${LAND_BACKUP_RECOVERY_HINT}`,
			},
		);
	}
	const expectedSha = state.expectedShas.get(maintenanceBranch);
	if (expectedSha === guardSha.value) return undefined;
	const expectedDisplay = expectedSha === undefined ? "(unrecorded)" : shortSha(expectedSha);
	return landingExecutionFailure(
		`PR #${prNumber} merged, but local branch ${maintenanceBranch} moved from ${expectedDisplay} to ${shortSha(guardSha.value)} since landing started; refusing gt get --force to avoid clobbering local commits.`,
		{
			failedBranch: maintenanceBranch,
			suggestedAction: `Inspect local branch ${maintenanceBranch}, reconcile it with the remote, then rerun /ns:flow:land if appropriate. ${LAND_BACKUP_RECOVERY_HINT}`,
		},
	);
}

async function refreshDescendantBranch(
	executionContext: LandExecutionContext,
	options: DescendantBranchOptions,
): Promise<LandingExecutionFailure | undefined> {
	const { land: landContext, progress } = executionContext;
	const { plan, prNumber, maintenanceBranch, landedBranch } = options;
	progress.note(`Refreshing stack through ${maintenanceBranch}...`);
	progress.setStatus(`refreshing stack through ${maintenanceBranch}...`);
	const refresh = await landContext.graphite.refreshBranchFromRemote({
		repoRoot: plan.repoRoot,
		branch: maintenanceBranch,
		checkedOutConflictHandling: "defer",
	});
	if (refresh.type === "success") return undefined;
	if (refresh.type === "checkout-conflict") {
		return landingExecutionFailure(
			`PR #${prNumber} merged, but descendant branch ${maintenanceBranch} could not be refreshed because ${formatCheckedOutElsewhere(refresh)}; it was not mutated.`,
			{
				displayCommand: refresh.commandDisplay,
				execResult: refresh.result,
				failedBranch: maintenanceBranch,
				suggestedAction: `Switch/detach ${refresh.path} from ${refresh.branch}, then run ${refresh.commandDisplay}, restack/update ${maintenanceBranch}, and delete local branch ${landedBranch} when safe. ${LAND_BACKUP_RECOVERY_HINT}`,
			},
		);
	}
	return landingExecutionFailure(`PR #${prNumber} merged, but targeted Graphite refresh failed.`, {
		displayCommand: refresh.commandDisplay,
		execResult: refresh.result,
		failedBranch: maintenanceBranch,
		suggestedAction: `Run ${refresh.commandDisplay} manually, inspect the stack, and rerun /ns:flow:land if appropriate.`,
	});
}

async function checkLandedBranchBeforeDelete(
	executionContext: LandExecutionContext,
	options: ReconcileDescendantRootsOptions,
): Promise<LandingExecutionFailure | undefined> {
	const { land: landContext } = executionContext;
	const { plan, prNumber, landedBranch, state, maintenance } = options;
	const children = await landContext.graphite.branchChildren({
		repoRoot: plan.repoRoot,
		metadataDbPath: plan.metadataDbPath,
		branch: landedBranch,
	});
	if (children.type === "failure") {
		return landingExecutionFailure(
			`PR #${prNumber} merged, but the pre-delete Graphite children re-check for ${landedBranch} failed; refusing gt delete without an authoritative child list.\n${children.failure.message}`,
			{
				failedBranch: landedBranch,
				failedPrNumber: prNumber,
				suggestedAction: `Inspect the stack, then delete local branch ${landedBranch} manually when safe. ${LAND_BACKUP_RECOVERY_HINT}`,
			},
		);
	}
	const allowedChildren = new Set(state.deletedBranches);
	for (const branch of maintenance.branches) allowedChildren.add(branch);
	const unexpectedChildren = children.value.filter((child) => !allowedChildren.has(child));
	if (unexpectedChildren.length === 0) return undefined;
	return landingExecutionFailure(
		`PR #${prNumber} merged, but ${landedBranch} now has unexpected Graphite children (${unexpectedChildren.join(", ")}); refusing gt delete to avoid destroying another stack.`,
		{
			failedBranch: landedBranch,
			failedPrNumber: prNumber,
			suggestedAction: `Inspect the unexpected children, land or move them, then clean up local branch ${landedBranch} manually before rerunning /ns:flow:land. ${LAND_BACKUP_RECOVERY_HINT}`,
		},
	);
}

async function deleteLandedBranch(
	executionContext: LandExecutionContext,
	options: ReconcileDescendantRootsOptions,
): Promise<LandingExecutionFailure | undefined> {
	const { land: landContext, progress } = executionContext;
	const { plan, landedBranch, prNumber, state } = options;
	progress.note(`Cleaning up local branch ${landedBranch}...`);
	progress.setStatus(`deleting local Graphite branch ${landedBranch}...`);
	const deletion = await landContext.graphite.deleteLocalBranch({
		repoRoot: plan.repoRoot,
		branch: landedBranch,
		checkedOutConflictHandling: "fail",
	});
	if (deletion.type === "deleted") {
		state.deletedBranches.add(landedBranch);
		return undefined;
	}
	if (deletion.type === "retained") {
		state.cleanup.retainedLocalBranches.push({ branch: deletion.branch, path: deletion.path });
		return undefined;
	}
	if (!deletion.isLikelyInProgressGitOperation) {
		return landingExecutionFailure(
			`PR #${prNumber} merged, but deleting the local Graphite branch ${landedBranch} failed.`,
			{
				displayCommand: deletion.commandDisplay,
				execResult: deletion.result,
				failedBranch: landedBranch,
				failedPrNumber: prNumber,
				suggestedAction: `Delete or repair local Graphite branch ${landedBranch} manually, then inspect the stack before rerunning /ns:flow:land.`,
			},
		);
	}
	const message = `Graphite cleanup for local branch ${landedBranch} stopped during branch deletion with an in-progress Git operation or conflicts. The repository may now be mid-rebase; do not rerun /ns:flow:land until it is resolved or aborted.`;
	const action = `Run git status. Resolve the conflicts and continue the Git operation, or run git rebase --abort if you want to back out of the cleanup restack; then inspect the stack and delete or repair local Graphite branch ${landedBranch} manually before rerunning /ns:flow:land.`;
	return landingExecutionFailure(`PR #${prNumber} merged, but ${message}`, {
		displayCommand: deletion.commandDisplay,
		execResult: deletion.result,
		failedBranch: landedBranch,
		failedPrNumber: prNumber,
		suggestedAction: action,
	});
}

async function prepareDescendantRoot(
	executionContext: LandExecutionContext,
	options: DescendantBranchOptions,
): Promise<DescendantRootPreparation> {
	const { land: landContext, progress } = executionContext;
	const { plan, prNumber, maintenanceBranch, state } = options;
	const { repoRoot } = plan;
	const trunk = plan.stack.trunk;
	progress.setStatus(`restacking ${maintenanceBranch}...`);
	const restacked = await landContext.graphite.restack({
		repoRoot,
		branch: maintenanceBranch,
		scope: "upstack",
	});
	if (restacked.type === "failure") {
		return landingExecutionFailure(
			`PR #${prNumber} merged, but restack failed for descendant root ${maintenanceBranch}.`,
			{
				displayCommand: restacked.commandDisplay,
				execResult: restacked.result,
				failedBranch: maintenanceBranch,
				suggestedAction: `Resolve restack failures for ${maintenanceBranch}, restack it onto ${trunk}, then submit/update its PR. ${LAND_BACKUP_RECOVERY_HINT}`,
			},
		);
	}
	progress.setStatus(`verifying ${maintenanceBranch}...`);
	const postRestackSha = await landContext.git.localBranchSha({
		repoRoot,
		branch: maintenanceBranch,
	});
	if (postRestackSha.type === "failure") {
		return landingExecutionFailure(
			`PR #${prNumber} merged, but could not re-read local branch ${maintenanceBranch} after restack.\n${postRestackSha.failure.message}`,
			{
				failedBranch: maintenanceBranch,
				suggestedAction: `Inspect local branch ${maintenanceBranch}, then restack/update it manually if needed. ${LAND_BACKUP_RECOVERY_HINT}`,
			},
		);
	}
	state.expectedShas.set(maintenanceBranch, postRestackSha.value);
	const containsTrunk = await landContext.git.branchContainsParent({
		repoRoot,
		branch: maintenanceBranch,
		parent: trunk,
	});
	if (containsTrunk.type === "failure") {
		return landingExecutionFailure(
			`PR #${prNumber} merged, but could not verify that ${maintenanceBranch} contains refreshed trunk ${trunk} after restack.\n${containsTrunk.failure.message}`,
			{
				failedBranch: maintenanceBranch,
				suggestedAction: `Inspect ${maintenanceBranch}, restack it onto ${trunk} manually, then submit/update its PR. ${LAND_BACKUP_RECOVERY_HINT}`,
			},
		);
	}
	if (!containsTrunk.value) {
		return landingExecutionFailure(
			`PR #${prNumber} merged and gt restack exited 0, but descendant root ${maintenanceBranch} still does not contain refreshed trunk ${trunk}; refusing to treat the restack as complete.`,
			{
				failedBranch: maintenanceBranch,
				suggestedAction: `Restack ${maintenanceBranch} onto ${trunk} manually, verify its history, then submit/update its PR. ${LAND_BACKUP_RECOVERY_HINT}`,
			},
		);
	}
	const providerParent = await landContext.graphite.branchParent({
		repoRoot,
		metadataDbPath: plan.metadataDbPath,
		branch: maintenanceBranch,
	});
	if (providerParent.type === "failure") {
		return landingExecutionFailure(
			`PR #${prNumber} merged, but could not verify provider topology for ${maintenanceBranch} after restack.\n${providerParent.failure.message}`,
			{
				failedBranch: maintenanceBranch,
				suggestedAction: `Inspect the stack topology for ${maintenanceBranch}, reparent it onto ${trunk} if needed, then submit/update its PR. ${LAND_BACKUP_RECOVERY_HINT}`,
			},
		);
	}
	if (providerParent.value !== trunk) {
		return landingExecutionFailure(
			`PR #${prNumber} merged and gt restack exited 0, but provider topology still reports ${maintenanceBranch} parented on ${providerParent.value ?? "(untracked)"}, expected ${trunk}.`,
			{
				failedBranch: maintenanceBranch,
				suggestedAction: `Reparent ${maintenanceBranch} onto ${trunk} (for example gt move --onto ${trunk}), restack, then submit/update its PR. ${LAND_BACKUP_RECOVERY_HINT}`,
			},
		);
	}
	return {
		kind: "prepared",
		proof: { branch: maintenanceBranch, localSha: postRestackSha.value },
	};
}

async function publishPreparedDescendantRoot(
	executionContext: LandExecutionContext,
	options: DescendantBranchOptions,
	proof: PreparedDescendantRoot,
): Promise<LandingExecutionFailure | undefined> {
	const { land: landContext, progress } = executionContext;
	const { plan, prNumber, maintenanceBranch } = options;
	const { repoRoot } = plan;
	const trunk = plan.stack.trunk;
	const preSubmitFacts = await loadDescendantRootPrFacts(
		executionContext,
		options,
		"before submit",
	);
	if (preSubmitFacts.kind === "failure") return preSubmitFacts.failure;
	if (
		isMaintenancePrCurrent({
			pr: preSubmitFacts.pr,
			branch: maintenanceBranch,
			localSha: proof.localSha,
			expectedBase: trunk,
		})
	) {
		progress.note(
			`Skipped gt submit for ${maintenanceBranch}; remote PR facts already match the reconciled state.`,
		);
		return undefined;
	}
	progress.setStatus(`submitting ${maintenanceBranch}...`);
	const submitted = await landContext.graphite.submitUpdate({
		repoRoot,
		branch: maintenanceBranch,
		force: true,
	});
	if (submitted.type === "failure") {
		return landingExecutionFailure(
			`PR #${prNumber} merged, but submit/update failed for descendant root ${maintenanceBranch}.`,
			{
				displayCommand: submitted.commandDisplay,
				execResult: submitted.result,
				failedBranch: maintenanceBranch,
				suggestedAction: `Update PR for ${maintenanceBranch} manually, verify it targets ${trunk}, and verify its head on GitHub. ${LAND_BACKUP_RECOVERY_HINT}`,
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
		!isMaintenancePrCurrent({
			pr: postSubmitFacts.pr,
			branch: maintenanceBranch,
			localSha: proof.localSha,
			expectedBase: trunk,
		})
	) {
		return landingExecutionFailure(
			`PR #${prNumber} merged and gt submit exited 0, but GitHub facts for ${maintenanceBranch} remain stale: state ${postSubmitFacts.pr.state}, head ${postSubmitFacts.pr.headRefName} at ${shortSha(postSubmitFacts.pr.headRefOid)} (expected ${shortSha(proof.localSha)}), base ${postSubmitFacts.pr.baseRefName} (expected ${trunk}).`,
			{
				failedBranch: maintenanceBranch,
				failedPrNumber: postSubmitFacts.pr.number,
				suggestedAction: `Update the PR for ${maintenanceBranch} manually and verify its head and base on GitHub. ${LAND_BACKUP_RECOVERY_HINT}`,
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
	const { plan, prNumber, maintenanceBranch } = options;
	const pr = await landContext.github.pullRequestFacts({
		repoRoot: plan.repoRoot,
		branchOrNumber: maintenanceBranch,
	});
	if (pr.type === "failure") {
		return {
			kind: "failure",
			failure: landingExecutionFailure(
				`PR #${prNumber} merged, but could not verify PR metadata for ${maintenanceBranch} ${moment}.\n${pr.failure.message}`,
				{
					failedBranch: maintenanceBranch,
					suggestedAction: `Inspect PR metadata for ${maintenanceBranch}, run gt submit/update if appropriate, then verify the PR on GitHub. ${LAND_BACKUP_RECOVERY_HINT}`,
				},
			),
		};
	}
	return { kind: "facts", pr: pr.value };
}

function reconciliationHalt(failure: LandingExecutionFailure): DescendantReconciliationOutcome {
	return { kind: "halt", phase: "descendant-maintenance", failure };
}
