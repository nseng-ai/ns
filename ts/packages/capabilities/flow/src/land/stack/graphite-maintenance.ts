import type { ExecResult } from "@nseng-ai/foundation/command";
import { shortSha } from "../../commit-display/index.ts";
import { isLikelyInProgressGitOperationFailure } from "../../submit/git-operation-output.ts";
import { LAND_BACKUP_RECOVERY_HINT } from "./backup-refs.ts";
import {
	formatGraphiteOperation,
	parseGitCheckedOutElsewhere,
	restackOperation,
	type CheckedOutElsewhere,
} from "./graphite-command-channel.ts";
import { landStackFailure, type LandStackFailure } from "./errors.ts";
import { formatRestackFailureMessage, formatSubmitFailureMessage } from "../land-presentation.ts";
import { validateOpenPrBasics } from "../api.ts";
import type {
	DescendantMaintenancePlan,
	LandContext,
	LandingPlan,
	LandGraphiteRestackScope,
	PullRequestFacts,
} from "../api.ts";
import type { LandingWarning, MergeLoopState } from "./types.ts";
import { formatConflict, slotNameFromPath } from "./worktrees.ts";

export interface GraphiteMaintenanceProgress {
	readonly note: (message: string) => void;
	readonly setStatus: (message: string) => void;
}

interface GraphiteMaintenanceStep {
	readonly index: number;
	readonly branch: string;
	readonly prNumber: number;
	readonly state: MergeLoopState;
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
	readonly refreshCheckedOutConflictHandling: "defer" | "fail";
	readonly deleteCheckedOutConflictHandling: "retain" | "fail";
	readonly skippedScopeText: (branch: string) => string;
	readonly isOptionalDescendant: boolean;
	readonly shouldHaltOnRefreshFailure: boolean;
}

interface BranchMaintenanceWarning {
	readonly branch: string;
	readonly warning: LandingWarning;
}

type GraphiteMaintenanceOutcome =
	| { kind: "proceed" }
	| { kind: "skip"; warning?: LandingWarning }
	| { kind: "halt"; failure: LandStackFailure };

type GraphiteMaintenanceStop = Extract<GraphiteMaintenanceOutcome, { kind: "halt" | "skip" }>;
type GraphiteMaintenanceHalt = Extract<GraphiteMaintenanceOutcome, { kind: "halt" }>;
type MaintenanceStepControl = "proceed" | "continue" | GraphiteMaintenanceHalt;

interface AppliedMaintenanceStep {
	readonly warnings: readonly BranchMaintenanceWarning[];
	readonly control: MaintenanceStepControl;
}

interface MaintenanceStepRecorder {
	readonly getWarnings: () => readonly BranchMaintenanceWarning[];
	readonly apply: (outcome: RecordableMaintenanceOutcome, branch: string) => MaintenanceStepControl;
}

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
				suggestedAction: `Switch/detach ${checkoutConflict.path} from ${checkoutConflict.branch}, then run ${getCommandDisplay} manually, inspect the stack, and rerun /ns:flow:land if appropriate.`,
			},
		);
	}

	return landStackFailure(`PR #${prNumber} merged, but targeted Graphite refresh failed.`, {
		commandDisplay: getCommandDisplay,
		result: got,
		failedBranch: maintenanceBranch,
		suggestedAction: `Run ${getCommandDisplay} manually, inspect the stack, and rerun /ns:flow:land if appropriate.`,
	});
}

interface PerformGraphiteMaintenanceOptions {
	readonly landContext: LandContext;
	readonly progress: GraphiteMaintenanceProgress;
	readonly plan: LandingPlan;
	readonly step: GraphiteMaintenanceStep;
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

type RecordableMaintenanceOutcome =
	| GraphiteMaintenanceOutcome
	| SubmitMaintenanceCheckOutcome
	| undefined;

function applyMaintenanceStep(options: {
	readonly outcome: RecordableMaintenanceOutcome;
	readonly branch: string;
	readonly warnings: readonly BranchMaintenanceWarning[];
}): AppliedMaintenanceStep {
	const { outcome, branch, warnings } = options;
	if (outcome === undefined) return { warnings, control: "proceed" };
	switch (outcome.kind) {
		case "proceed":
		case "submit":
		case "skip-submit":
			return { warnings, control: "proceed" };
		case "halt":
			return { warnings, control: outcome };
		case "skip":
			return {
				warnings:
					outcome.warning === undefined
						? warnings
						: [...warnings, { branch, warning: outcome.warning }],
				control: "continue",
			};
		default:
			assertNever(outcome);
	}
}

function createMaintenanceStepRecorder(): MaintenanceStepRecorder {
	let warnings: readonly BranchMaintenanceWarning[] = [];
	return {
		getWarnings() {
			return warnings;
		},
		apply(outcome, branch) {
			const step = applyMaintenanceStep({ outcome, branch, warnings });
			warnings = step.warnings;
			return step.control;
		},
	};
}

function withMaintenanceBranch(
	operationInput: MaintenanceOperationInput,
	maintenanceBranch: string,
): MaintenanceBranchOperationInput {
	return { ...operationInput, maintenanceBranch };
}

async function checkSubmitMaintenanceBranch(
	options: MaintenanceBranchOperationInput,
): Promise<SubmitMaintenanceCheckOutcome> {
	const { landContext, repoRoot, plan, prNumber, landedBranch, maintenanceBranch, maintenance } =
		options;
	const localSha = await landContext.git.localBranchSha({ repoRoot, branch: maintenanceBranch });
	if (localSha.type === "failure") {
		return failOrWarn(maintenance.severity, {
			failure: landStackFailure(
				`PR #${prNumber} merged, but could not re-read local branch ${maintenanceBranch} after restack.\n${localSha.failure.message}`,
				{
					failedBranch: maintenanceBranch,
					suggestedAction: `Inspect local branch ${maintenanceBranch}, run gt submit/update if appropriate, then rerun /ns:flow:land if needed. ${LAND_BACKUP_RECOVERY_HINT}`,
				},
			),
			warning: {
				level: "warning",
				message: `All target PRs were merged, but local branch ${maintenanceBranch} could not be re-read after optional descendant restack; submit/update for ${maintenanceBranch} was skipped.`,
				suggestedAction: `Inspect local branch ${maintenanceBranch}, update that PR manually if needed, and delete local branch ${landedBranch} manually when safe. ${LAND_BACKUP_RECOVERY_HINT}`,
			},
		});
	}

	const pr = await landContext.github.pullRequestFacts({
		repoRoot,
		branchOrNumber: maintenanceBranch,
	});
	if (pr.type === "failure") {
		return failOrWarn(maintenance.severity, {
			failure: landStackFailure(
				`PR #${prNumber} merged, but could not verify PR metadata for ${maintenanceBranch} after restack.\n${pr.failure.message}`,
				{
					failedBranch: maintenanceBranch,
					suggestedAction: `Inspect PR metadata for ${maintenanceBranch}, run gt submit/update if appropriate, then rerun /ns:flow:land if needed.`,
				},
			),
			warning: {
				level: "warning",
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
				failure: landStackFailure(
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
		failure: landStackFailure(formatSubmitFailureMessage(prNumber, maintenanceBranch, true), {
			commandDisplay: submitted.commandDisplay,
			result: submitted.result,
			failedBranch: maintenanceBranch,
			suggestedAction: `Update PR for ${maintenanceBranch} manually, verify it targets ${plan.stack.trunk}, then rerun /ns:flow:land if appropriate.`,
		}),
		warning: {
			level: "warning",
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
	const { landContext, progress, plan, step } = maintenanceOptions;
	const { repoRoot } = plan;
	const { index, branch, prNumber, state } = step;
	const maintenance = planGraphiteMaintenanceTargets(plan, index);

	if (maintenance.mode === "skip-descendant") {
		return { kind: "skip", warning: skippedDescendantMaintenanceWarning(plan, branch) };
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
	const refreshFailureRecorder = createMaintenanceStepRecorder();
	for (const maintenanceBranch of maintenance.branches) {
		const branchOperationContext = withMaintenanceBranch(operationInput, maintenanceBranch);
		const guardControl = refreshFailureRecorder.apply(
			await guardMaintenanceBranch(branchOperationContext),
			maintenanceBranch,
		);
		if (guardControl === "continue") continue;
		if (guardControl !== "proceed") return guardControl;

		const refreshControl = refreshFailureRecorder.apply(
			await refreshMaintenanceBranch(branchOperationContext),
			maintenanceBranch,
		);
		if (refreshControl === "continue") continue;
		if (refreshControl !== "proceed") return refreshControl;
	}

	const refreshFailureWarnings = refreshFailureRecorder.getWarnings();
	if (refreshFailureWarnings.length > 0) {
		return {
			kind: "skip",
			warning: aggregateOptionalDescendantMaintenanceWarnings({
				warnings: refreshFailureWarnings,
				landedBranch: branch,
				targetBranches: maintenance.branches,
				cleanupState: "skipped",
			}),
		};
	}

	const deleteCheck = await checkGraphiteBranchBeforeDelete(operationInput);
	if (deleteCheck !== undefined) return deleteCheck;

	const deletion = await deleteLocalGraphiteBranchAfterLanding(operationInput);
	if (deletion.kind !== "proceed") return deletion;

	const postDeleteRecorder = createMaintenanceStepRecorder();
	for (const maintenanceBranch of maintenance.branches) {
		const branchOperationContext = withMaintenanceBranch(operationInput, maintenanceBranch);
		const restackControl = postDeleteRecorder.apply(
			await restackMaintenanceBranch(branchOperationContext),
			maintenanceBranch,
		);
		if (restackControl === "continue") continue;
		if (restackControl !== "proceed") return restackControl;

		const submitCheck = await checkSubmitMaintenanceBranch(branchOperationContext);
		const submitCheckControl = postDeleteRecorder.apply(submitCheck, maintenanceBranch);
		if (submitCheckControl === "continue") continue;
		if (submitCheckControl !== "proceed") return submitCheckControl;

		const refreshExpected = await refreshExpectedShaAfterRestack(branchOperationContext);
		if (refreshExpected) return refreshExpected;

		if (submitCheck.kind === "skip-submit") {
			progress.note(`Skipped gt submit for ${maintenanceBranch}; PR metadata already current.`);
			continue;
		}

		progress.setStatus(`submitting ${maintenanceBranch}...`);
		const submittedControl = postDeleteRecorder.apply(
			await submitMaintenanceBranch(branchOperationContext),
			maintenanceBranch,
		);
		if (submittedControl === "continue") continue;
		if (submittedControl !== "proceed") return submittedControl;
	}

	const postDeleteWarnings = postDeleteRecorder.getWarnings();
	if (postDeleteWarnings.length > 0) {
		return {
			kind: "skip",
			warning: aggregateOptionalDescendantMaintenanceWarnings({
				warnings: postDeleteWarnings,
				landedBranch: branch,
				targetBranches: maintenance.branches,
				cleanupState: "completed",
			}),
		};
	}

	return { kind: "proceed" };
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
			failure: landStackFailure(
				`PR #${prNumber} merged, but could not verify local branch ${maintenanceBranch} before refreshing it.\n${guardSha.failure.message}`,
				{
					failedBranch: maintenanceBranch,
					suggestedAction: `Inspect local branch ${maintenanceBranch}, then rerun /ns:flow:land if appropriate. ${LAND_BACKUP_RECOVERY_HINT}`,
				},
			),
			warning: {
				level: "warning",
				message: `All target PRs were merged, but local branch ${maintenanceBranch} could not be verified before optional descendant maintenance; local branch ${landedBranch} cleanup and descendant restack/update were skipped.`,
				suggestedAction: `Inspect local branch ${maintenanceBranch}, then restack/update it and delete local branch ${landedBranch} manually when safe. ${LAND_BACKUP_RECOVERY_HINT}`,
			},
		});
	}
	const expectedSha = state.expectedShas.get(maintenanceBranch);
	if (expectedSha === guardSha.value) return undefined;

	const expectedDisplay = expectedSha === undefined ? "(unrecorded)" : shortSha(expectedSha);
	const movedMessage = `local branch ${maintenanceBranch} moved from ${expectedDisplay} to ${shortSha(guardSha.value)} since landing started; refusing gt get --force to avoid clobbering local commits`;
	return failOrWarn(maintenance.severity, {
		failure: landStackFailure(`PR #${prNumber} merged, but ${movedMessage}.`, {
			failedBranch: maintenanceBranch,
			suggestedAction: `Inspect local branch ${maintenanceBranch}, reconcile it with the remote, then rerun /ns:flow:land if appropriate. ${LAND_BACKUP_RECOVERY_HINT}`,
		}),
		warning: {
			level: "warning",
			message: `All target PRs were merged, but ${movedMessage}; local branch ${landedBranch} cleanup and descendant restack/update were skipped.`,
			suggestedAction: `Inspect local branch ${maintenanceBranch}, then restack/update it and delete local branch ${landedBranch} manually when safe. ${LAND_BACKUP_RECOVERY_HINT}`,
		},
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

	if (maintenance.shouldHaltOnRefreshFailure) {
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
		progress.note(
			`Deferred optional descendant maintenance for ${maintenanceBranch} because ${formatCheckedOutElsewhere(refresh)}.\nRun ${refresh.commandDisplay} manually when that worktree is free.`,
		);
		return {
			kind: "skip",
			warning: optionalDescendantRefreshDeferredWarning(
				maintenanceBranch,
				landedBranch,
				refresh.commandDisplay,
				refresh,
			),
		};
	}

	return {
		kind: "skip",
		warning: {
			level: "warning",
			message: `All target PRs were merged, but Graphite refresh for descendant branch ${maintenanceBranch} failed; local branch ${landedBranch} cleanup and descendant restack/update were skipped.`,
			commandDisplay: refresh.commandDisplay,
			result: refresh.result,
			suggestedAction: `Run ${refresh.commandDisplay} manually, restack/update ${maintenanceBranch}, and delete local branch ${landedBranch} when safe.`,
		},
	};
}

function aggregateOptionalDescendantMaintenanceWarnings(options: {
	readonly warnings: readonly BranchMaintenanceWarning[];
	readonly landedBranch: string;
	readonly targetBranches: readonly string[];
	readonly cleanupState: "skipped" | "completed";
}): LandingWarning {
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
		return {
			kind: "skip",
			warning: {
				level: "warning",
				message: `All target PRs were merged, but the pre-delete Graphite children re-check for ${branch} failed; ${skippedScope} skipped.\n${children.failure.message}`,
				suggestedAction: `Inspect the stack, then delete local branch ${branch} manually when safe. ${LAND_BACKUP_RECOVERY_HINT}`,
			},
		};
	}
	const childrenNow = children.value;
	const allowedChildren = new Set(state.deletedBranches);
	for (const maintenanceBranch of maintenance.branches) allowedChildren.add(maintenanceBranch);
	const unexpectedChildren = childrenNow.filter((child) => !allowedChildren.has(child));
	if (unexpectedChildren.length === 0) return undefined;

	return failOrWarn(maintenance.severity, {
		failure: landStackFailure(
			`PR #${prNumber} merged, but ${branch} now has unexpected Graphite children (${unexpectedChildren.join(", ")}); refusing gt delete to avoid destroying another stack.`,
			{
				failedBranch: branch,
				failedPr: prNumber,
				suggestedAction: `Inspect the unexpected children, land or move them, then clean up local branch ${branch} manually before rerunning /ns:flow:land. ${LAND_BACKUP_RECOVERY_HINT}`,
			},
		),
		warning: {
			level: "warning",
			message: `All target PRs were merged, but ${branch} now has unexpected Graphite children (${unexpectedChildren.join(", ")}); ${skippedScope} skipped.`,
			suggestedAction: `Inspect the unexpected children, then delete local branch ${branch} and restack descendants manually when safe. ${LAND_BACKUP_RECOVERY_HINT}`,
		},
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
					isOptionalDescendant: maintenance.isOptionalDescendant,
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
		failure: landStackFailure(formatRestackFailureMessage(prNumber, maintenanceBranch, true), {
			commandDisplay: restacked.commandDisplay,
			result: restacked.result,
			failedBranch: maintenanceBranch,
			suggestedAction: `Resolve restack failures for ${maintenanceBranch}, run gt submit/update, then rerun /ns:flow:land if appropriate.`,
		}),
		warning: {
			level: "warning",
			message: formatRestackFailureMessage(prNumber, maintenanceBranch, false),
			commandDisplay: restacked.commandDisplay,
			result: restacked.result,
			suggestedAction: `Resolve restack failures for ${maintenanceBranch}, then update that PR manually.`,
		},
	});
}

function optionalDescendantRefreshDeferredWarning(
	descendantBranch: string,
	landedBranch: string,
	getCommandDisplay: string,
	checkoutConflict: CheckedOutElsewhere,
): LandingWarning {
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

function formatCheckedOutElsewhere(checkoutConflict: CheckedOutElsewhere): string {
	return `${checkoutConflict.branch} is checked out at ${checkoutConflict.path}`;
}

function planGraphiteMaintenanceTargets(plan: LandingPlan, index: number): MaintenanceTargetPlan {
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

function localCleanupOnlyScopeText(branch: string): string {
	return `local branch ${branch} cleanup was`;
}

function localCleanupAndDescendantScopeText(branch: string): string {
	return `local branch ${branch} cleanup and descendant restack/update were`;
}

function scopeForMaintenanceRestack(maintenance: MaintenanceTargetPlan): LandGraphiteRestackScope {
	return maintenance.isOptionalDescendant ? "upstack" : "branch-only";
}

function shouldRefreshExpectedShasAfterRestack(maintenance: MaintenanceTargetPlan): boolean {
	return scopeForMaintenanceRestack(maintenance) === "upstack";
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

function refreshTargetsAfterMaintainedBranch(
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

function skippedDescendantMaintenanceWarning(plan: LandingPlan, branch: string): LandingWarning {
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
			level: "warning",
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
			failureSuggestedAction: `Delete or repair local Graphite branch ${options.branch} manually, then inspect the stack before rerunning /ns:flow:land.`,
			warningMessage: options.isOptionalDescendant
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
		warningMessage: options.isOptionalDescendant
			? `All target PRs were merged, but ${baseMessage} Descendant restack/update was skipped.`
			: `All target PRs were merged, but ${baseMessage}`,
		warningSuggestedAction: action,
	};
}

function assertNever(value: never): never {
	throw new Error(`Unhandled local branch deletion result: ${JSON.stringify(value)}`);
}
