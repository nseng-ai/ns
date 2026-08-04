// Post-merge Graphite maintenance.
//
// Two flows share the guard/refresh/delete primitives:
//
// - Next-landing maintenance keeps the remaining landing path mergeable after each merged PR.
// - Descendant reconciliation is a required completion postcondition after the final target PR
//   merges: every descendant root must be proven locally restacked onto refreshed trunk, placed
//   directly above trunk in provider topology, and current on GitHub. A zero-exit `gt restack`
//   or `gt submit` is evidence that the command ran, not proof of the postcondition.
//
// Callers receive one proceed/skip/halt outcome per landed branch; halts carry the landing phase
// they should be attributed to (`descendant-maintenance` vs `merge-maintenance-cleanup`).

import type { ExecResult } from "@nseng-ai/foundation/command";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { shortSha } from "../../commit-display/index.ts";
import { LAND_BACKUP_RECOVERY_HINT, parseGitCheckedOutElsewhere } from "../graphite-operations.ts";
import { validateOpenPrBasics } from "../preflight.ts";
import { landingExecutionFailure } from "../results.ts";
import type {
	LandContext,
	LandingExecutionFailure,
	LandingPlan,
	LandingWarning,
	PullRequestFacts,
} from "../types.ts";
import { landingWarning } from "../types.ts";
import type { LandExecutionMessageProgress } from "./host-seams.ts";
import type { MergeLoopState } from "./merge-loop.ts";
import {
	aggregateDescendantReconciliationFailure,
	blockedDescendantMaintenanceFailure,
	formatCheckedOutElsewhere,
	formatRestackFailureMessage,
	formatSubmitFailureMessage,
	planGraphiteMaintenanceTargets,
	refreshTargetsAfterMaintainedBranch,
	scopeForMaintenanceRestack,
	shouldRefreshExpectedShasAfterRestack,
	type BranchMaintenanceFailure,
	type MaintenanceSeverity,
	type MaintenanceTargetPlan,
} from "./maintenance-plan.ts";

export type GraphiteMaintenanceProgress = LandExecutionMessageProgress;

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
	severity: MaintenanceSeverity,
	pair: { failure: LandingExecutionFailure; warning: LandingWarning },
): GraphiteMaintenanceStop {
	if (severity === "fail") return { kind: "halt", failure: pair.failure };
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
	readonly landContext: LandContext;
	readonly progress: GraphiteMaintenanceProgress;
	readonly plan: LandingPlan;
	readonly step: GraphiteMaintenanceStep;
	readonly shouldDeferLandedBranchDeletion?: boolean;
}

interface MaintenanceOperationInput {
	readonly landContext: LandContext;
	readonly progress: GraphiteMaintenanceProgress;
	readonly repoRoot: string;
	readonly plan: LandingPlan;
	readonly prNumber: number;
	readonly landedBranch: string;
	readonly state: MergeLoopState;
	readonly maintenance: MaintenanceTargetPlan;
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
	maintenanceOptions: PerformGraphiteMaintenanceOptions,
): Promise<PerformedGraphiteMaintenance> {
	const { landContext, progress, plan, step } = maintenanceOptions;
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

	const operationInput: MaintenanceOperationInput = {
		landContext,
		progress,
		repoRoot,
		plan,
		prNumber,
		landedBranch: branch,
		state,
		maintenance,
	};

	if (maintenance.mode === "required-descendants") {
		return await reconcileDescendantRoots(operationInput, shouldDeferLandedBranchDeletion);
	}

	const outcome = await maintainNextLandingBranches(
		operationInput,
		shouldDeferLandedBranchDeletion,
	);
	if (outcome.kind === "halt") return { ...outcome, phase: "merge-maintenance-cleanup" };
	return outcome;
}

/** Maintenance for `required-next-landing` and `none` modes: refresh/delete/restack/submit. */
async function maintainNextLandingBranches(
	operationInput: MaintenanceOperationInput,
	shouldDeferLandedBranchDeletion: boolean,
): Promise<GraphiteMaintenanceOutcome> {
	const { maintenance, progress } = operationInput;
	for (const maintenanceBranch of maintenance.branches) {
		const branchOperationContext = withMaintenanceBranch(operationInput, maintenanceBranch);
		const guard = await guardMaintenanceBranch(branchOperationContext);
		if (guard !== undefined) return guard;
		const refresh = await refreshMaintenanceBranch(branchOperationContext);
		if (refresh !== undefined) return refresh;
	}

	if (!shouldDeferLandedBranchDeletion) {
		const deleteCheck = await checkGraphiteBranchBeforeDelete(operationInput);
		if (deleteCheck !== undefined) return deleteCheck;

		const deletion = await deleteLocalGraphiteBranchAfterLanding(operationInput);
		if (deletion.kind !== "proceed") return deletion;
	}

	for (const maintenanceBranch of maintenance.branches) {
		const branchOperationContext = withMaintenanceBranch(operationInput, maintenanceBranch);
		const restacked = await restackMaintenanceBranch(branchOperationContext);
		if (restacked.kind !== "proceed") return restacked;

		const submitCheck = await checkSubmitMaintenanceBranch(branchOperationContext);
		if (submitCheck.kind === "halt" || submitCheck.kind === "skip") return submitCheck;

		const refreshExpected = await refreshExpectedShaAfterRestack(branchOperationContext);
		if (refreshExpected) return refreshExpected;

		if (submitCheck.kind === "skip-submit") {
			progress.note(`Skipped gt submit for ${maintenanceBranch}; PR metadata already current.`);
			continue;
		}

		progress.setStatus(`submitting ${maintenanceBranch}...`);
		const submitted = await submitMaintenanceBranch(branchOperationContext);
		if (submitted.kind !== "proceed") return submitted;
	}

	return { kind: "proceed" };
}

/**
 * Required descendant reconciliation with verified postconditions.
 *
 * Order per landed branch: guard + refresh every root first; delete the landed local branch only
 * when every root proved refreshable and the pre-delete child re-check passed; then per root:
 * restack, prove local trunk ancestry and provider topology, publish when remote facts are not
 * already proven current, and re-verify GitHub facts after submit. Root failures are collected
 * and aggregated so one root's failure never hides another's, and are returned as a halt so the
 * landing finishes as a failed partial completion rather than a warning-grade success.
 */
async function reconcileDescendantRoots(
	operationInput: MaintenanceOperationInput,
	shouldDeferLandedBranchDeletion: boolean,
): Promise<PerformedGraphiteMaintenance> {
	const { maintenance, state, landedBranch } = operationInput;
	const refreshFailures: BranchMaintenanceFailure[] = [];
	for (const maintenanceBranch of maintenance.branches) {
		const branchOperationContext = withMaintenanceBranch(operationInput, maintenanceBranch);
		const guard = await guardMaintenanceBranch(branchOperationContext);
		if (guard !== undefined) {
			refreshFailures.push({ branch: maintenanceBranch, failure: stopFailure(guard) });
			continue;
		}
		const refresh = await refreshMaintenanceBranch(branchOperationContext);
		if (refresh !== undefined) {
			refreshFailures.push({ branch: maintenanceBranch, failure: stopFailure(refresh) });
		}
	}
	if (refreshFailures.length > 0) {
		return descendantReconciliationHalt(operationInput, refreshFailures, "retained");
	}

	if (!shouldDeferLandedBranchDeletion) {
		const deleteCheck = await checkGraphiteBranchBeforeDelete(operationInput);
		if (deleteCheck !== undefined) {
			return descendantReconciliationHalt(
				operationInput,
				[{ branch: landedBranch, failure: stopFailure(deleteCheck) }],
				"retained",
			);
		}
		const deletion = await deleteLocalGraphiteBranchAfterLanding(operationInput);
		if (deletion.kind !== "proceed") {
			return descendantReconciliationHalt(
				operationInput,
				[{ branch: landedBranch, failure: stopFailure(deletion) }],
				"retained",
			);
		}
	}
	const landedBranchCleanupState = state.deletedBranches.has(landedBranch) ? "deleted" : "retained";

	const reconcileFailures: BranchMaintenanceFailure[] = [];
	for (const maintenanceBranch of maintenance.branches) {
		const branchOperationContext = withMaintenanceBranch(operationInput, maintenanceBranch);
		const failure = await reconcileDescendantRoot(branchOperationContext);
		if (failure !== undefined) reconcileFailures.push({ branch: maintenanceBranch, failure });
	}
	if (reconcileFailures.length > 0) {
		return descendantReconciliationHalt(
			operationInput,
			reconcileFailures,
			landedBranchCleanupState,
		);
	}
	return { kind: "proceed" };
}

/** Reconcile one descendant root; returns the branch-specific failure when any step or proof fails. */
async function reconcileDescendantRoot(
	options: MaintenanceBranchOperationInput,
): Promise<LandingExecutionFailure | undefined> {
	const { landContext, progress, repoRoot, plan, prNumber, maintenanceBranch, state } = options;
	const trunk = plan.stack.trunk;

	progress.setStatus(`restacking ${maintenanceBranch}...`);
	const restacked = await landContext.graphite.restack({
		repoRoot,
		branch: maintenanceBranch,
		scope: scopeForMaintenanceRestack(options.maintenance),
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

	const preSubmitFacts = await loadDescendantRootPrFacts(options, "before submit");
	if (preSubmitFacts.kind === "failure") return preSubmitFacts.failure;
	if (isRemotePrProvenCurrent(preSubmitFacts.pr, maintenanceBranch, postRestackSha.value, trunk)) {
		progress.note(
			`Skipped gt submit for ${maintenanceBranch}; remote PR facts already match the reconciled state.`,
		);
		return undefined;
	}

	progress.setStatus(`submitting ${maintenanceBranch}...`);
	// Post-merge reconciliation restacks after a landed PR, so the remote PR branch may still be
	// on old stack history; the forced submit intentionally overwrites the stale remote head.
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

	const postSubmitFacts = await loadDescendantRootPrFacts(options, "after submit");
	if (postSubmitFacts.kind === "failure") return postSubmitFacts.failure;
	if (
		!isRemotePrProvenCurrent(postSubmitFacts.pr, maintenanceBranch, postRestackSha.value, trunk)
	) {
		return landingExecutionFailure(
			`PR #${prNumber} merged and gt submit exited 0, but GitHub facts for ${maintenanceBranch} remain stale: state ${postSubmitFacts.pr.state}, head ${postSubmitFacts.pr.headRefName} at ${shortSha(postSubmitFacts.pr.headRefOid)} (expected ${shortSha(postRestackSha.value)}), base ${postSubmitFacts.pr.baseRefName} (expected ${trunk}).`,
			{
				failedBranch: maintenanceBranch,
				failedPrNumber: postSubmitFacts.pr.number,
				suggestedAction: `Update the PR for ${maintenanceBranch} manually and verify its head and base on GitHub. ${LAND_BACKUP_RECOVERY_HINT}`,
			},
		);
	}
	return undefined;
}

type DescendantRootPrFacts =
	| { readonly kind: "facts"; readonly pr: PullRequestFacts }
	| { readonly kind: "failure"; readonly failure: LandingExecutionFailure };

async function loadDescendantRootPrFacts(
	options: MaintenanceBranchOperationInput,
	moment: "before submit" | "after submit",
): Promise<DescendantRootPrFacts> {
	const { landContext, repoRoot, prNumber, maintenanceBranch } = options;
	const pr = await landContext.github.pullRequestFacts({
		repoRoot,
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

/**
 * Remote facts are proven current only when the PR is open on the expected head branch, its head
 * OID equals the verified post-restack local SHA, and its base ref is trunk. Local ancestry and
 * provider topology are verified separately before this predicate is consulted.
 */
function isRemotePrProvenCurrent(
	pr: PullRequestFacts,
	branch: string,
	postRestackSha: string,
	trunk: string,
): boolean {
	const basics = validateOpenPrBasics({ branch, localSha: postRestackSha, pr });
	return basics.type === "completed" && pr.baseRefName === trunk;
}

function stopFailure(stop: GraphiteMaintenanceStop): LandingExecutionFailure {
	if (stop.kind === "halt") return stop.failure;
	const warning = stop.warning;
	if (warning === undefined) {
		return landingExecutionFailure("Descendant reconciliation step did not complete.");
	}
	return landingExecutionFailure(warning.message, {
		...optionalEntry("displayCommand", warning.commandDisplay),
		...optionalEntry("execResult", warning.result),
		...optionalEntry("suggestedAction", warning.suggestedAction),
	});
}

function descendantReconciliationHalt(
	operationInput: MaintenanceOperationInput,
	failures: readonly BranchMaintenanceFailure[],
	landedBranchCleanupState: "retained" | "deleted",
): PerformedGraphiteMaintenance {
	return {
		kind: "halt",
		phase: "descendant-maintenance",
		failure: aggregateDescendantReconciliationFailure({
			failures,
			landedBranch: operationInput.landedBranch,
			landedPrNumber: operationInput.prNumber,
			targetBranches: operationInput.maintenance.branches,
			landedBranchCleanupState,
		}),
	};
}

async function checkSubmitMaintenanceBranch(
	options: MaintenanceBranchOperationInput,
): Promise<SubmitMaintenanceCheckOutcome> {
	const { landContext, repoRoot, plan, prNumber, landedBranch, maintenanceBranch, maintenance } =
		options;
	const localSha = await landContext.git.localBranchSha({ repoRoot, branch: maintenanceBranch });
	if (localSha.type === "failure") {
		return failOrWarn(maintenance.severity, {
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
		return failOrWarn(maintenance.severity, {
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
	pr: PullRequestFacts;
	branch: string;
	localSha: string;
	trunk: string;
}): boolean {
	const basics = validateOpenPrBasics(options);
	return basics.type === "completed" && options.pr.baseRefName === options.trunk;
}

async function refreshExpectedShaAfterRestack(
	options: MaintenanceBranchOperationInput,
): Promise<GraphiteMaintenanceOutcome | undefined> {
	const { landContext, repoRoot, plan, prNumber, maintenanceBranch, state, maintenance } = options;
	if (!shouldRefreshExpectedShasAfterRestack(maintenance)) return undefined;
	// gt restack --upstack legitimately rewrites upstack branches, so refresh the
	// expectation for later forced refresh targets; comparing against pre-restack
	// SHAs would false-positive on every 3+ branch stack and on forked descendants.
	for (const refreshTarget of refreshTargetsAfterMaintainedBranch(plan, maintenanceBranch)) {
		const refreshedSha = await landContext.git.localBranchSha({
			repoRoot,
			branch: refreshTarget,
		});
		if (refreshedSha.type === "failure") {
			return {
				kind: "halt",
				failure: landingExecutionFailure(
					`PR #${prNumber} merged, but could not re-read local branch ${refreshTarget} after restack.\n${refreshedSha.failure.message}`,
					{
						failedBranch: refreshTarget,
						suggestedAction: `Inspect local branch ${refreshTarget}, then rerun /ns:flow:land if appropriate. ${LAND_BACKUP_RECOVERY_HINT}`,
					},
				),
			};
		}
		state.expectedShas.set(refreshTarget, refreshedSha.value);
	}
	return undefined;
}

async function submitMaintenanceBranch(
	options: MaintenanceBranchOperationInput,
): Promise<GraphiteMaintenanceOutcome> {
	const { landContext, repoRoot, plan, prNumber, maintenanceBranch, maintenance } = options;
	// Post-merge maintenance restacks after a landed PR, so the remote PR branch may
	// still be on old stack history; keep pre-merge submit/update conservative.
	const submitted = await landContext.graphite.submitUpdate({
		repoRoot,
		branch: maintenanceBranch,
		force: true,
	});
	if (submitted.type === "success") return { kind: "proceed" };

	return failOrWarn(maintenance.severity, {
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
	options: MaintenanceBranchOperationInput,
): Promise<GraphiteMaintenanceStop | undefined> {
	const { landContext, repoRoot, prNumber, maintenanceBranch, maintenance, state, landedBranch } =
		options;
	// Guard every forced refresh: gt get --force resets the local branch to remote
	// state, so refuse if the branch moved since this run snapshotted it.
	const guardSha = await landContext.git.localBranchSha({ repoRoot, branch: maintenanceBranch });
	if (guardSha.type === "failure") {
		return failOrWarn(maintenance.severity, {
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
	return failOrWarn(maintenance.severity, {
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
	options: MaintenanceBranchOperationInput,
): Promise<GraphiteMaintenanceStop | undefined> {
	const {
		landContext,
		progress,
		repoRoot,
		prNumber,
		maintenanceBranch,
		landedBranch,
		maintenance,
	} = options;
	progress.note(`Refreshing stack through ${maintenanceBranch}...`);
	progress.setStatus(`refreshing stack through ${maintenanceBranch}...`);
	const refresh = await landContext.graphite.refreshBranchFromRemote({
		repoRoot,
		branch: maintenanceBranch,
		checkedOutConflictHandling: maintenance.refreshCheckedOutConflictHandling,
	});
	if (refresh.type === "success") return undefined;

	const branchRole = maintenance.isDescendantRoot ? "descendant branch" : "next landing branch";
	if (refresh.type === "checkout-conflict" && maintenance.shouldHaltOnRefreshFailure) {
		// A conflict that appears only now was never disclosed at the main confirmation, so it
		// cannot ride on that consent; record it as failed/deferred maintenance.
		return {
			kind: "halt",
			failure: landingExecutionFailure(
				`PR #${prNumber} merged, but ${branchRole} ${maintenanceBranch} could not be refreshed because ${formatCheckedOutElsewhere(refresh)}; it was not mutated.`,
				{
					displayCommand: refresh.commandDisplay,
					execResult: refresh.result,
					failedBranch: maintenanceBranch,
					suggestedAction: `Switch/detach ${refresh.path} from ${refresh.branch}, then run ${refresh.commandDisplay}, restack/update ${maintenanceBranch}, and delete local branch ${landedBranch} when safe. ${LAND_BACKUP_RECOVERY_HINT}`,
				},
			),
		};
	}

	if (maintenance.shouldHaltOnRefreshFailure) {
		return {
			kind: "halt",
			failure: graphiteRefreshFailure({
				prNumber,
				maintenanceBranch,
				branchRole,
				getCommandDisplay: refresh.commandDisplay,
				got: refresh.result,
			}),
		};
	}

	return {
		kind: "skip",
		warning: landingWarning({
			message: `All target PRs were merged, but Graphite refresh for ${branchRole} ${maintenanceBranch} failed; local branch ${landedBranch} cleanup and descendant restack/update were skipped.`,
			commandDisplay: refresh.commandDisplay,
			result: refresh.result,
			suggestedAction: `Run ${refresh.commandDisplay} manually, restack/update ${maintenanceBranch}, and delete local branch ${landedBranch} when safe.`,
		}),
	};
}

async function checkGraphiteBranchBeforeDelete(
	options: MaintenanceOperationInput,
): Promise<GraphiteMaintenanceStop | undefined> {
	const {
		landContext,
		repoRoot,
		plan,
		prNumber,
		landedBranch: branch,
		state,
		maintenance,
	} = options;
	// Re-check the branch's Graphite children right before the forced delete: a
	// child that appeared since planning means another stack now depends on it.
	const skippedScope = maintenance.skippedScopeText(branch);
	const children = await landContext.graphite.branchChildren({
		repoRoot,
		metadataDbPath: plan.metadataDbPath,
		branch,
	});
	if (children.type === "failure") {
		return failOrWarn(maintenance.severity, {
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

	return failOrWarn(maintenance.severity, {
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
	options: MaintenanceOperationInput,
): Promise<GraphiteMaintenanceOutcome> {
	const {
		landContext,
		repoRoot,
		landedBranch: branch,
		prNumber,
		state,
		progress,
		maintenance,
	} = options;
	progress.note(`Cleaning up local branch ${branch}...`);
	progress.setStatus(`deleting local Graphite branch ${branch}...`);
	const deletion = await landContext.graphite.deleteLocalBranch({
		repoRoot,
		branch,
		checkedOutConflictHandling: maintenance.deleteCheckedOutConflictHandling,
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
				maintenance.severity,
				localBranchDeletionFailurePair({
					branch,
					prNumber,
					commandDisplay: deletion.commandDisplay,
					result: deletion.result,
					isLikelyInProgressGitOperation: deletion.isLikelyInProgressGitOperation,
					isDescendantRoot: maintenance.isDescendantRoot,
				}),
			);
		default:
			assertNever(deletion);
	}
}

async function restackMaintenanceBranch(
	options: MaintenanceBranchOperationInput,
): Promise<GraphiteMaintenanceOutcome> {
	const { landContext, progress, repoRoot, prNumber, maintenanceBranch, maintenance } = options;
	progress.setStatus(`restacking ${maintenanceBranch}...`);
	const restacked = await landContext.graphite.restack({
		repoRoot,
		branch: maintenanceBranch,
		scope: scopeForMaintenanceRestack(maintenance),
	});
	if (restacked.type !== "failure") return { kind: "proceed" };

	return failOrWarn(maintenance.severity, {
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
	isDescendantRoot: boolean;
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
			warningMessage: options.isDescendantRoot
				? `All target PRs were merged, but deleting the local Graphite branch ${options.branch} failed; descendant restack/update was skipped.`
				: `All target PRs were merged, but deleting the local Graphite branch ${options.branch} failed.`,
			warningSuggestedAction: `Delete or repair local Graphite branch ${options.branch} manually, then inspect the stack.`,
		};
	}

	const baseMessage = `Graphite cleanup for local branch ${options.branch} stopped during branch deletion with an in-progress Git operation or conflicts. The repository may now be mid-rebase; do not rerun /ns:flow:land until it is resolved or aborted.`;
	const action = `Run git status. Resolve the conflicts and continue the Git operation, or run git rebase --abort if you want to back out of the cleanup restack; then inspect the stack and delete or repair local Graphite branch ${options.branch} manually before rerunning /ns:flow:land.`;
	return {
		failureMessage: `PR #${options.prNumber} merged, but ${baseMessage}`,
		failureSuggestedAction: action,
		warningMessage: options.isDescendantRoot
			? `All target PRs were merged, but ${baseMessage} Descendant restack/update was skipped.`
			: `All target PRs were merged, but ${baseMessage}`,
		warningSuggestedAction: action,
	};
}

function assertNever(value: never): never {
	throw new Error(`Unhandled local branch deletion result: ${JSON.stringify(value)}`);
}
