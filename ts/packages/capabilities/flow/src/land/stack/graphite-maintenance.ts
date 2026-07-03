import type { ExecResult } from "@sdl/core/command";
import { isLikelyInProgressGitOperationFailure } from "../../submit/git-operation-output.ts";
import { LAND_BACKUP_RECOVERY_HINT } from "./backup-refs.ts";
import type { LandStackCommandStream } from "./command-stream.ts";
import {
	formatGraphiteOperation,
	parseGitCheckedOutElsewhere,
	shortSha,
	type CheckedOutElsewhere,
} from "./graphite-command-channel.ts";
import { GT_MUTATION_TIMEOUT_MS } from "./constants.ts";
import { landStackFailure, type LandStackFailure } from "./errors.ts";
import { loadGraphiteTopology } from "./graphite-topology.ts";
import {
	formatRestackFailureMessage,
	formatSubmitFailureMessage,
	setStatus,
} from "./presentation.ts";
import { loadPr, validateOpenPrBasicsForLandStack } from "./pr-facts.ts";
import { loadLocalSha } from "./stack-facts.ts";
import type { LandRuntime } from "./land-runtime.ts";
import type {
	DescendantMaintenancePlan,
	LandStackCommandContext,
	LandingPlan,
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

type NextGraphiteMaintenance =
	| { kind: "required-next-landing"; branch: string }
	| { kind: "optional-descendant"; branch: string }
	| { kind: "skip-descendant" }
	| { kind: "none" };

type MaintenanceSeverity = "fail" | "warn";

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
				suggestedAction: `Switch/detach ${checkoutConflict.path} from ${checkoutConflict.branch}, then run ${getCommandDisplay} manually, inspect the stack, and rerun /sdl:flow:land if appropriate.`,
			},
		);
	}

	return landStackFailure(`PR #${prNumber} merged, but targeted Graphite refresh failed.`, {
		commandDisplay: getCommandDisplay,
		result: got,
		failedBranch: maintenanceBranch,
		suggestedAction: `Run ${getCommandDisplay} manually, inspect the stack, and rerun /sdl:flow:land if appropriate.`,
	});
}

interface PerformGraphiteMaintenanceOptions {
	runtime: LandRuntime;
	ctx: LandStackCommandContext;
	plan: LandingPlan;
	step: GraphiteMaintenanceStep;
}

interface MaintenanceBranchContext {
	runtime: LandRuntime;
	repoRoot: string;
	plan: LandingPlan;
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
					suggestedAction: `Inspect local branch ${maintenanceBranch}, run gt submit/update if appropriate, then rerun /sdl:flow:land if needed. ${LAND_BACKUP_RECOVERY_HINT}`,
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
					suggestedAction: `Inspect PR metadata for ${maintenanceBranch}, run gt submit/update if appropriate, then rerun /sdl:flow:land if needed.`,
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
	const basics = validateOpenPrBasicsForLandStack(options);
	return basics.type === "success" && options.pr.baseRefName === options.trunk;
}

async function refreshExpectedShaAfterRestack(
	options: MaintenanceBranchContext,
): Promise<GraphiteMaintenanceOutcome | undefined> {
	const { runtime, repoRoot, plan, prNumber, maintenanceBranch, state } = options;
	// gt restack --upstack legitimately rewrites upstack branches, so refresh the
	// expectation for the next iteration's forced refresh target; comparing against
	// the pre-restack SHA would false-positive on every 3+ branch stack.
	const nextGetTarget = nextForcedRefreshBranchAfterMaintaining(plan, maintenanceBranch);
	if (nextGetTarget === undefined) return undefined;

	const refreshedSha = await loadLocalSha(runtime.commands, repoRoot, nextGetTarget);
	if (refreshedSha.type === "failure") {
		return {
			kind: "halt",
			failure: landStackFailure(
				`PR #${prNumber} merged, but could not re-read local branch ${nextGetTarget} after restack.\n${refreshedSha.failure.message}`,
				{
					failedBranch: nextGetTarget,
					suggestedAction: `Inspect local branch ${nextGetTarget}, then rerun /sdl:flow:land if appropriate. ${LAND_BACKUP_RECOVERY_HINT}`,
				},
			),
		};
	}
	state.expectedShas.set(nextGetTarget, refreshedSha.value);
	return undefined;
}

async function submitMaintenanceBranch(
	options: MaintenanceBranchContext,
): Promise<GraphiteMaintenanceOutcome> {
	const { repoRoot, plan, prNumber, maintenanceBranch, severity } = options;
	// Post-merge maintenance restacks after a landed PR, so the remote PR branch may
	// still be on old stack history; keep pre-merge submit/update conservative.
	const submitOperation = {
		kind: "submit-update",
		branch: maintenanceBranch,
		force: true,
	} as const;
	const submitted = await options.runtime.graphite.run({
		operation: submitOperation,
		cwd: repoRoot,
		timeoutMs: GT_MUTATION_TIMEOUT_MS,
	});
	if (submitted.code === 0) return { kind: "proceed" };

	return failOrWarn(severity, {
		failure: landStackFailure(formatSubmitFailureMessage(prNumber, maintenanceBranch, true), {
			commandDisplay: formatGraphiteOperation(submitOperation),
			result: submitted,
			failedBranch: maintenanceBranch,
			suggestedAction: `Update PR for ${maintenanceBranch} manually, verify it targets ${plan.stack.trunk}, then rerun /sdl:flow:land if appropriate.`,
		}),
		warning: {
			message: formatSubmitFailureMessage(prNumber, maintenanceBranch, false),
			commandDisplay: formatGraphiteOperation(submitOperation),
			result: submitted,
			suggestedAction: `Update PR for ${maintenanceBranch} manually and verify it targets ${plan.stack.trunk}.`,
		},
	});
}

export async function performGraphiteMaintenance(
	maintenanceOptions: PerformGraphiteMaintenanceOptions,
): Promise<GraphiteMaintenanceOutcome> {
	const { runtime, ctx, plan, step } = maintenanceOptions;
	const pi = runtime.commands;
	const { repoRoot } = plan;
	const { index, branch, prNumber, state, options } = step;
	const maintenance = nextGraphiteMaintenance(plan, index);
	const severity: MaintenanceSeverity =
		maintenance.kind === "required-next-landing" ? "fail" : "warn";

	if (maintenance.kind === "required-next-landing" || maintenance.kind === "optional-descendant") {
		// Guard every forced refresh: gt get --force resets the local branch to remote
		// state, so refuse if the branch moved since this run snapshotted it.
		const guardSha = await loadLocalSha(pi, repoRoot, maintenance.branch);
		if (guardSha.type === "failure") {
			return failOrWarn(severity, {
				failure: landStackFailure(
					`PR #${prNumber} merged, but could not verify local branch ${maintenance.branch} before refreshing it.\n${guardSha.failure.message}`,
					{
						failedBranch: maintenance.branch,
						suggestedAction: `Inspect local branch ${maintenance.branch}, then rerun /sdl:flow:land if appropriate. ${LAND_BACKUP_RECOVERY_HINT}`,
					},
				),
				warning: {
					message: `All target PRs were merged, but local branch ${maintenance.branch} could not be verified before optional descendant maintenance; local branch ${branch} cleanup and descendant restack/update were skipped.`,
					suggestedAction: `Inspect local branch ${maintenance.branch}, then restack/update it and delete local branch ${branch} manually when safe. ${LAND_BACKUP_RECOVERY_HINT}`,
				},
			});
		}
		const expectedSha = state.expectedShas.get(maintenance.branch);
		if (expectedSha !== guardSha.value) {
			const expectedDisplay = expectedSha === undefined ? "(unrecorded)" : shortSha(expectedSha);
			const movedMessage = `local branch ${maintenance.branch} moved from ${expectedDisplay} to ${shortSha(guardSha.value)} since landing started; refusing gt get --force to avoid clobbering local commits`;
			return failOrWarn(severity, {
				failure: landStackFailure(`PR #${prNumber} merged, but ${movedMessage}.`, {
					failedBranch: maintenance.branch,
					suggestedAction: `Inspect local branch ${maintenance.branch}, reconcile it with the remote, then rerun /sdl:flow:land if appropriate. ${LAND_BACKUP_RECOVERY_HINT}`,
				}),
				warning: {
					message: `All target PRs were merged, but ${movedMessage}; local branch ${branch} cleanup and descendant restack/update were skipped.`,
					suggestedAction: `Inspect local branch ${maintenance.branch}, then restack/update it and delete local branch ${branch} manually when safe. ${LAND_BACKUP_RECOVERY_HINT}`,
				},
			});
		}

		options.commandStream?.note(`Refreshing stack through ${maintenance.branch}...`);
		setStatus(ctx, `refreshing stack through ${maintenance.branch}...`);
		const getOperation = {
			kind: "get-downstack-no-checkout",
			branch: maintenance.branch,
			checkoutConflict: maintenance.kind === "optional-descendant" ? "defer" : "fail",
		} as const;
		const getCommandDisplay = formatGraphiteOperation(getOperation);
		const getResult = await runtime.graphite.run({
			operation: getOperation,
			cwd: repoRoot,
			timeoutMs: GT_MUTATION_TIMEOUT_MS,
		});
		const got = getResult.result;
		if (got.code !== 0) {
			if (maintenance.kind === "required-next-landing") {
				return {
					kind: "halt",
					failure: graphiteRefreshFailure({
						prNumber,
						maintenanceBranch: maintenance.branch,
						getCommandDisplay,
						got,
					}),
				};
			}

			if (getResult.checkoutConflict) {
				options.commandStream?.note(
					`Deferred optional descendant maintenance for ${maintenance.branch} because ${formatCheckedOutElsewhere(getResult.checkoutConflict)}.\nRun ${getCommandDisplay} manually when that worktree is free.`,
				);
				return {
					kind: "skip",
					warning: optionalDescendantRefreshDeferredWarning(
						maintenance.branch,
						branch,
						getCommandDisplay,
						getResult.checkoutConflict,
					),
				};
			}

			return {
				kind: "skip",
				warning: {
					message: `All target PRs were merged, but Graphite refresh for descendant branch ${maintenance.branch} failed; local branch ${branch} cleanup and descendant restack/update were skipped.`,
					commandDisplay: getCommandDisplay,
					result: got,
					suggestedAction: `Run ${getCommandDisplay} manually, restack/update ${maintenance.branch}, and delete local branch ${branch} when safe.`,
				},
			};
		}
	}

	if (maintenance.kind === "skip-descendant") {
		return { kind: "skip", warning: skippedDescendantMaintenanceWarning(plan, branch) };
	}

	// Re-check the branch's Graphite children right before the forced delete: a
	// child that appeared since planning means another stack now depends on it.
	const skippedScope =
		maintenance.kind === "optional-descendant"
			? `local branch ${branch} cleanup and descendant restack/update were`
			: `local branch ${branch} cleanup was`;
	const topology = await loadGraphiteTopology(pi, repoRoot, plan.metadataDbPath);
	if (topology.type === "failure") {
		return {
			kind: "skip",
			warning: {
				message: `All target PRs were merged, but the pre-delete Graphite children re-check for ${branch} failed; ${skippedScope} skipped.\n${topology.failure.message}`,
				suggestedAction: `Inspect the stack, then delete local branch ${branch} manually when safe. ${LAND_BACKUP_RECOVERY_HINT}`,
			},
		};
	}
	const childrenNow = topology.value.get(branch)?.children ?? [];
	const allowedChildren = new Set(state.deletedBranches);
	if (maintenance.kind === "required-next-landing" || maintenance.kind === "optional-descendant") {
		allowedChildren.add(maintenance.branch);
	}
	const unexpectedChildren = childrenNow.filter((child) => !allowedChildren.has(child));
	if (unexpectedChildren.length > 0) {
		return failOrWarn(severity, {
			failure: landStackFailure(
				`PR #${prNumber} merged, but ${branch} now has unexpected Graphite children (${unexpectedChildren.join(", ")}); refusing gt delete to avoid destroying another stack.`,
				{
					failedBranch: branch,
					failedPr: prNumber,
					suggestedAction: `Inspect the unexpected children, land or move them, then clean up local branch ${branch} manually before rerunning /sdl:flow:land. ${LAND_BACKUP_RECOVERY_HINT}`,
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
	const deleteOperation = {
		kind: "delete-local-branch",
		branch,
		checkedOutConflict: maintenance.kind === "none" ? "retain" : "fail",
	} as const;
	const deletion = await runtime.graphite.run({
		operation: deleteOperation,
		cwd: repoRoot,
		timeoutMs: GT_MUTATION_TIMEOUT_MS,
	});
	switch (deletion.kind) {
		case "deleted":
			state.deletedBranches.add(branch);
			break;
		case "retained":
			state.cleanup.retainedLocalBranches.push({ branch: deletion.branch, path: deletion.path });
			break;
		case "failed":
			return failOrWarn(
				severity,
				localBranchDeletionFailurePair({
					branch,
					prNumber,
					commandDisplay: formatGraphiteOperation(deleteOperation),
					result: deletion.result,
					isOptionalDescendant: maintenance.kind === "optional-descendant",
				}),
			);
		default:
			assertNever(deletion);
	}

	if (maintenance.kind !== "required-next-landing" && maintenance.kind !== "optional-descendant") {
		return { kind: "proceed" };
	}

	setStatus(ctx, `restacking ${maintenance.branch}...`);
	const restackOperation = { kind: "restack-upstack", branch: maintenance.branch } as const;
	const restacked = await runtime.graphite.run({
		operation: restackOperation,
		cwd: repoRoot,
		timeoutMs: GT_MUTATION_TIMEOUT_MS,
	});
	if (restacked.code !== 0) {
		return failOrWarn(severity, {
			failure: landStackFailure(formatRestackFailureMessage(prNumber, maintenance.branch, true), {
				commandDisplay: formatGraphiteOperation(restackOperation),
				result: restacked,
				failedBranch: maintenance.branch,
				suggestedAction: `Resolve restack failures for ${maintenance.branch}, run gt submit/update, then rerun /sdl:flow:land if appropriate.`,
			}),
			warning: {
				message: formatRestackFailureMessage(prNumber, maintenance.branch, false),
				commandDisplay: formatGraphiteOperation(restackOperation),
				result: restacked,
				suggestedAction: `Resolve restack failures for ${maintenance.branch}, then update that PR manually.`,
			},
		});
	}

	const maintenanceContext: MaintenanceBranchContext = {
		runtime,
		repoRoot,
		plan,
		prNumber,
		maintenanceBranch: maintenance.branch,
		severity,
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
			`Skipped gt submit for ${maintenance.branch}; PR metadata already current.`,
		);
		return { kind: "proceed" };
	}

	setStatus(ctx, `submitting ${maintenance.branch}...`);
	return await submitMaintenanceBranch(maintenanceContext);
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

function nextGraphiteMaintenance(plan: LandingPlan, index: number): NextGraphiteMaintenance {
	const nextLandingBranch = plan.stack.landingBranches[index + 1];
	if (nextLandingBranch) {
		return { kind: "required-next-landing", branch: nextLandingBranch };
	}

	if (index !== plan.stack.landingBranches.length - 1) {
		return { kind: "none" };
	}

	const nextFutureLandingBranch = plan.stack.remainingLandingBranches[0];
	if (nextFutureLandingBranch) {
		return { kind: "required-next-landing", branch: nextFutureLandingBranch };
	}

	if (plan.descendantMaintenance.kind === "auto") {
		return { kind: "optional-descendant", branch: plan.descendantMaintenance.targetBranch };
	}
	if (plan.descendantMaintenance.kind === "skipped") {
		return { kind: "skip-descendant" };
	}
	return { kind: "none" };
}

function nextForcedRefreshBranchAfterMaintaining(
	plan: LandingPlan,
	maintainedBranch: string,
): string | undefined {
	const futureRefreshOrder = [
		...plan.stack.landingBranches,
		...plan.stack.remainingLandingBranches,
		...(plan.descendantMaintenance.kind === "auto"
			? [plan.descendantMaintenance.targetBranch]
			: []),
	];
	const maintainedIndex = futureRefreshOrder.indexOf(maintainedBranch);
	if (maintainedIndex < 0) return undefined;
	return futureRefreshOrder[maintainedIndex + 1];
}

function skippedDescendantMaintenanceWarning(plan: LandingPlan, branch: string): LandingWarning {
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
			failureSuggestedAction: `Delete or repair local Graphite branch ${options.branch} manually, then inspect the stack before rerunning /sdl:flow:land.`,
			warningMessage: options.isOptionalDescendant
				? `All target PRs were merged, but deleting the local Graphite branch ${options.branch} failed; descendant restack/update was skipped.`
				: `All target PRs were merged, but deleting the local Graphite branch ${options.branch} failed.`,
			warningSuggestedAction: `Delete or repair local Graphite branch ${options.branch} manually, then inspect the stack.`,
		};
	}

	const baseMessage = `Graphite cleanup for local branch ${options.branch} stopped during branch deletion with an in-progress Git operation or conflicts. The repository may now be mid-rebase; do not rerun /sdl:flow:land until it is resolved or aborted.`;
	const action = `Run git status. Resolve the conflicts and continue the Git operation, or run git rebase --abort if you want to back out of the cleanup restack; then inspect the stack and delete or repair local Graphite branch ${options.branch} manually before rerunning /sdl:flow:land.`;
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
