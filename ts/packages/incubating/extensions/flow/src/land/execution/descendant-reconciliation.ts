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
import { guardForcedRefresh, repairGraphiteBranchParent } from "./maintenance-safety.ts";

export type DescendantReconciliationOutcome =
	| { readonly kind: "proceed"; readonly reconciledBranches: readonly string[] }
	| {
			readonly kind: "halt";
			readonly phase: "post-target-reconciliation";
			readonly reconciledBranches: readonly string[];
			readonly failure: LandingExecutionFailure;
	  };

export interface ReconcileDescendantRootsOptions {
	readonly plan: LandingPlan;
	readonly prNumber: number;
	readonly landedBranch: string;
	readonly state: MergeLoopState;
	readonly maintenance: RequiredDescendantMaintenance;
	readonly affectedBranches?: readonly string[];
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
	| { readonly kind: "failure"; readonly failure: LandingExecutionFailure };

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

	for (const maintenanceBranch of maintenance.branches) {
		const reparentFailure = await repairGraphiteBranchParent(executionContext, {
			repoRoot: options.plan.repoRoot,
			prNumber: options.prNumber,
			branch: maintenanceBranch,
			parent: options.plan.stack.trunk,
			failureSubject: `survivor root ${maintenanceBranch}`,
		});
		if (reparentFailure !== undefined) return reconciliationHalt(reparentFailure);
	}

	const preparedRoots: PreparedDescendantRoot[] = [];
	for (const maintenanceBranch of maintenance.branches) {
		const preparation = await prepareDescendantRoot(executionContext, {
			...options,
			maintenanceBranch,
		});
		if (preparation.kind === "failure") return reconciliationHalt(preparation.failure);
		preparedRoots.push(preparation.proof);
	}

	const affectedBranches = options.affectedBranches ?? preparedRoots.map((proof) => proof.branch);
	const reconciledBranches: string[] = [];
	for (const branch of affectedBranches) {
		const sha = options.state.expectedShas.get(branch);
		if (sha === undefined) {
			return reconciliationHalt(
				landingExecutionFailure(
					`PR #${options.prNumber} merged, but no expected local SHA was recorded for survivor ${branch}.`,
					{
						failedBranch: branch,
						suggestedAction: `Inspect and update surviving branch ${branch} manually. ${LAND_BACKUP_RECOVERY_HINT}`,
					},
				),
			);
		}
		const publicationFailure = await publishPreparedDescendantRoot(
			executionContext,
			{ ...options, maintenanceBranch: branch },
			{ branch, localSha: sha },
		);
		if (publicationFailure !== undefined) {
			return reconciliationHalt(publicationFailure, reconciledBranches);
		}
		reconciledBranches.push(branch);
	}
	return { kind: "proceed", reconciledBranches };
}

async function guardDescendantBranch(
	executionContext: LandExecutionContext,
	options: DescendantBranchOptions,
): Promise<LandingExecutionFailure | undefined> {
	const { plan, prNumber, maintenanceBranch, state } = options;
	return guardForcedRefresh(executionContext, {
		repoRoot: plan.repoRoot,
		prNumber,
		branch: maintenanceBranch,
		expectedSha: state.expectedShas.get(maintenanceBranch),
	});
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
		return descendantPreparationFailure(
			landingExecutionFailure(
				`PR #${prNumber} merged, but restack failed for descendant root ${maintenanceBranch}.`,
				{
					displayCommand: restacked.commandDisplay,
					execResult: restacked.result,
					failedBranch: maintenanceBranch,
					suggestedAction: `Resolve restack failures for ${maintenanceBranch}, restack it onto ${trunk}, then submit/update its PR. ${LAND_BACKUP_RECOVERY_HINT}`,
				},
			),
		);
	}
	progress.setStatus(`verifying ${maintenanceBranch}...`);
	const postRestackSha = await landContext.git.localBranchSha({
		repoRoot,
		branch: maintenanceBranch,
	});
	if (postRestackSha.type === "failure") {
		return descendantPreparationFailure(
			landingExecutionFailure(
				`PR #${prNumber} merged, but could not re-read local branch ${maintenanceBranch} after restack.\n${postRestackSha.failure.message}`,
				{
					failedBranch: maintenanceBranch,
					suggestedAction: `Inspect local branch ${maintenanceBranch}, then restack/update it manually if needed. ${LAND_BACKUP_RECOVERY_HINT}`,
				},
			),
		);
	}
	state.expectedShas.set(maintenanceBranch, postRestackSha.value);
	const containsTrunk = await landContext.git.branchContainsParent({
		repoRoot,
		branch: maintenanceBranch,
		parent: trunk,
	});
	if (containsTrunk.type === "failure") {
		return descendantPreparationFailure(
			landingExecutionFailure(
				`PR #${prNumber} merged, but could not verify that ${maintenanceBranch} contains refreshed trunk ${trunk} after restack.\n${containsTrunk.failure.message}`,
				{
					failedBranch: maintenanceBranch,
					suggestedAction: `Inspect ${maintenanceBranch}, restack it onto ${trunk} manually, then submit/update its PR. ${LAND_BACKUP_RECOVERY_HINT}`,
				},
			),
		);
	}
	if (!containsTrunk.value) {
		return descendantPreparationFailure(
			landingExecutionFailure(
				`PR #${prNumber} merged and gt restack exited 0, but descendant root ${maintenanceBranch} still does not contain refreshed trunk ${trunk}; refusing to treat the restack as complete.`,
				{
					failedBranch: maintenanceBranch,
					suggestedAction: `Restack ${maintenanceBranch} onto ${trunk} manually, verify its history, then submit/update its PR. ${LAND_BACKUP_RECOVERY_HINT}`,
				},
			),
		);
	}
	const providerParent = await landContext.graphite.branchParent({
		repoRoot,
		metadataDbPath: plan.metadataDbPath,
		branch: maintenanceBranch,
	});
	if (providerParent.type === "failure") {
		return descendantPreparationFailure(
			landingExecutionFailure(
				`PR #${prNumber} merged, but could not verify provider topology for ${maintenanceBranch} after restack.\n${providerParent.failure.message}`,
				{
					failedBranch: maintenanceBranch,
					suggestedAction: `Inspect the stack topology for ${maintenanceBranch}, reparent it onto ${trunk} if needed, then submit/update its PR. ${LAND_BACKUP_RECOVERY_HINT}`,
				},
			),
		);
	}
	if (providerParent.value !== trunk) {
		return descendantPreparationFailure(
			landingExecutionFailure(
				`PR #${prNumber} merged and gt restack exited 0, but provider topology still reports ${maintenanceBranch} parented on ${providerParent.value ?? "(untracked)"}, expected ${trunk}.`,
				{
					failedBranch: maintenanceBranch,
					suggestedAction: `Reparent ${maintenanceBranch} onto ${trunk} (for example gt move --onto ${trunk}), restack, then submit/update its PR. ${LAND_BACKUP_RECOVERY_HINT}`,
				},
			),
		);
	}
	return {
		kind: "prepared",
		proof: { branch: maintenanceBranch, localSha: postRestackSha.value },
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

function reconciliationHalt(
	failure: LandingExecutionFailure,
	reconciledBranches: readonly string[] = [],
): DescendantReconciliationOutcome {
	return {
		kind: "halt",
		phase: "post-target-reconciliation",
		reconciledBranches: [...reconciledBranches],
		failure,
	};
}
