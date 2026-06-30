import { type ExecResult, formatCommand } from "@sdl/exec";
import { GRAPHITE_COMMAND_NAME } from "@sdl/graphite/branch";
import { isLikelyInProgressGitOperationFailure } from "../shared/git-operation-output.ts";
import { LAND_BACKUP_RECOVERY_HINT } from "./backup-refs.ts";
import {
	execGraphite,
	execRawGraphite,
	normalizeCommandFinish,
	parseGitCheckedOutElsewhere,
	shortSha,
	type CheckedOutElsewhere,
} from "./command-exec.ts";
import type { LandStackCommandStream } from "./command-stream.ts";
import { GT_MUTATION_TIMEOUT_MS } from "./constants.ts";
import { landStackFailure, type LandStackFailure } from "./errors.ts";
import { loadGraphiteTopology } from "./graphite-topology.ts";
import {
	formatRestackFailureMessage,
	formatSubmitFailureMessage,
	setStatus,
} from "./presentation.ts";
import { loadPr, validateOpenPrBasics } from "./pr-facts.ts";
import { loadLocalSha } from "./stack-facts.ts";
import type {
	CommandStreamFinish,
	DescendantMaintenancePlan,
	LandStackCommandContext,
	LandStackExtensionAPI,
	LandingPlan,
	LandingWarning,
	PullRequestSnapshot,
} from "./types.ts";
import { formatConflict, slotNameFromPath } from "./worktrees.ts";
import type { MergeLoopState } from "./landing-operations.ts";

export interface GraphiteMaintenanceOptions {
	commandStream?: LandStackCommandStream;
	unstreamedPi?: LandStackExtensionAPI;
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

interface OptionalDescendantGraphiteCommandResult {
	result: ExecResult;
	checkoutConflict?: CheckedOutElsewhere;
}

type MaintenanceSeverity = "fail" | "warn";

type GraphiteMaintenanceOutcome =
	| { kind: "proceed" }
	| { kind: "skip" }
	| { kind: "halt"; failure: LandStackFailure };

type GraphiteMaintenanceStop = Extract<GraphiteMaintenanceOutcome, { kind: "halt" | "skip" }>;

function failOrWarn(
	severity: MaintenanceSeverity,
	warnings: LandingWarning[],
	pair: { failure: LandStackFailure; warning: LandingWarning },
): GraphiteMaintenanceStop {
	if (severity === "fail") return { kind: "halt", failure: pair.failure };
	warnings.push(pair.warning);
	return { kind: "skip" };
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
	pi: LandStackExtensionAPI;
	ctx: LandStackCommandContext;
	plan: LandingPlan;
	step: GraphiteMaintenanceStep;
}

interface SubmitMaintenanceCheckOptions {
	pi: LandStackExtensionAPI;
	repoRoot: string;
	trunk: string;
	prNumber: number;
	landedBranch: string;
	maintenanceBranch: string;
	severity: MaintenanceSeverity;
	state: MergeLoopState;
}

type SubmitMaintenanceCheckOutcome =
	| { kind: "submit" }
	| { kind: "skip-submit" }
	| GraphiteMaintenanceStop;

async function checkSubmitMaintenanceBranch(
	options: SubmitMaintenanceCheckOptions,
): Promise<SubmitMaintenanceCheckOutcome> {
	const { pi, repoRoot, trunk, prNumber, landedBranch, maintenanceBranch, severity, state } =
		options;
	const localSha = await loadLocalSha(pi, repoRoot, maintenanceBranch);
	if (localSha.type === "failure") {
		return failOrWarn(severity, state.warnings, {
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

	const pr = await loadPr(pi, repoRoot, maintenanceBranch);
	if (pr.type === "failure") {
		return failOrWarn(severity, state.warnings, {
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
		trunk,
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
	const basics = validateOpenPrBasics(options);
	return basics.type === "success" && options.pr.baseRefName === options.trunk;
}

async function refreshExpectedShaAfterRestack(options: {
	pi: LandStackExtensionAPI;
	repoRoot: string;
	plan: LandingPlan;
	prNumber: number;
	maintenanceBranch: string;
	state: MergeLoopState;
}): Promise<GraphiteMaintenanceOutcome | undefined> {
	const { pi, repoRoot, plan, prNumber, maintenanceBranch, state } = options;
	// gt restack --upstack legitimately rewrites upstack branches, so refresh the
	// expectation for the next iteration's forced refresh target; comparing against
	// the pre-restack SHA would false-positive on every 3+ branch stack.
	const nextGetTarget = nextForcedRefreshBranchAfterMaintaining(plan, maintenanceBranch);
	if (nextGetTarget === undefined) return undefined;

	const refreshedSha = await loadLocalSha(pi, repoRoot, nextGetTarget);
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

async function submitMaintenanceBranch(options: {
	pi: LandStackExtensionAPI;
	repoRoot: string;
	trunk: string;
	prNumber: number;
	maintenanceBranch: string;
	severity: MaintenanceSeverity;
	state: MergeLoopState;
}): Promise<GraphiteMaintenanceOutcome> {
	const { pi, repoRoot, trunk, prNumber, maintenanceBranch, severity, state } = options;
	const submitArgs = [
		"submit",
		"--branch",
		maintenanceBranch,
		"--no-stack",
		"--update-only",
		"--no-edit",
		"--no-ai",
		"--no-interactive",
		// Post-merge maintenance restacks after a landed PR, so the remote PR branch may
		// still be on old stack history; keep pre-merge submit/update conservative.
		"--force",
	];
	const submitted = await execGraphite(pi, {
		args: submitArgs,
		cwd: repoRoot,
		timeoutMs: GT_MUTATION_TIMEOUT_MS,
	});
	if (submitted.code === 0) return { kind: "proceed" };

	return failOrWarn(severity, state.warnings, {
		failure: landStackFailure(formatSubmitFailureMessage(prNumber, maintenanceBranch, true), {
			commandDisplay: formatCommand("gt", submitArgs),
			result: submitted,
			failedBranch: maintenanceBranch,
			suggestedAction: `Update PR for ${maintenanceBranch} manually, verify it targets ${trunk}, then rerun /sdl:flow:land if appropriate.`,
		}),
		warning: {
			message: formatSubmitFailureMessage(prNumber, maintenanceBranch, false),
			commandDisplay: formatCommand("gt", submitArgs),
			result: submitted,
			suggestedAction: `Update PR for ${maintenanceBranch} manually and verify it targets ${trunk}.`,
		},
	});
}

export async function performGraphiteMaintenance(
	maintenanceOptions: PerformGraphiteMaintenanceOptions,
): Promise<GraphiteMaintenanceOutcome> {
	const { pi, ctx, plan, step } = maintenanceOptions;
	const { repoRoot, stack } = plan;
	const { index, branch, prNumber, state, options } = step;
	const maintenance = nextGraphiteMaintenance(plan, index);
	const severity: MaintenanceSeverity =
		maintenance.kind === "required-next-landing" ? "fail" : "warn";

	if (maintenance.kind === "required-next-landing" || maintenance.kind === "optional-descendant") {
		// Guard every forced refresh: gt get --force resets the local branch to remote
		// state, so refuse if the branch moved since this run snapshotted it.
		const guardSha = await loadLocalSha(pi, repoRoot, maintenance.branch);
		if (guardSha.type === "failure") {
			return failOrWarn(severity, state.warnings, {
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
			return failOrWarn(severity, state.warnings, {
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
		const getArgs = [
			"get",
			maintenance.branch,
			"--downstack",
			"--no-restack",
			"--no-checkout",
			"--force",
			"--no-interactive",
		];
		const getCommandDisplay = formatCommand("gt", getArgs);
		const getResult: OptionalDescendantGraphiteCommandResult =
			maintenance.kind === "optional-descendant"
				? await runOptionalDescendantGraphiteCommand(
						pi,
						options,
						repoRoot,
						getCommandDisplay,
						getArgs,
					)
				: {
						result: await execGraphite(pi, {
							args: getArgs,
							cwd: repoRoot,
							timeoutMs: GT_MUTATION_TIMEOUT_MS,
						}),
					};
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
				state.warnings.push(
					optionalDescendantRefreshDeferredWarning(
						maintenance.branch,
						branch,
						getCommandDisplay,
						getResult.checkoutConflict,
					),
				);
				options.commandStream?.note(
					`Deferred optional descendant maintenance for ${maintenance.branch} because ${formatCheckedOutElsewhere(getResult.checkoutConflict)}.\nRun ${getCommandDisplay} manually when that worktree is free.`,
				);
				return { kind: "skip" };
			}

			state.warnings.push({
				message: `All target PRs were merged, but Graphite refresh for descendant branch ${maintenance.branch} failed; local branch ${branch} cleanup and descendant restack/update were skipped.`,
				commandDisplay: getCommandDisplay,
				result: got,
				suggestedAction: `Run ${getCommandDisplay} manually, restack/update ${maintenance.branch}, and delete local branch ${branch} when safe.`,
			});
			return { kind: "skip" };
		}
	}

	if (maintenance.kind === "skip-descendant") {
		state.warnings.push(skippedDescendantMaintenanceWarning(plan, branch));
		return { kind: "skip" };
	}

	// Re-check the branch's Graphite children right before the forced delete: a
	// child that appeared since planning means another stack now depends on it.
	const skippedScope =
		maintenance.kind === "optional-descendant"
			? `local branch ${branch} cleanup and descendant restack/update were`
			: `local branch ${branch} cleanup was`;
	const topology = await loadGraphiteTopology(pi, repoRoot, plan.metadataDbPath);
	if (topology.type === "failure") {
		state.warnings.push({
			message: `All target PRs were merged, but the pre-delete Graphite children re-check for ${branch} failed; ${skippedScope} skipped.\n${topology.failure.message}`,
			suggestedAction: `Inspect the stack, then delete local branch ${branch} manually when safe. ${LAND_BACKUP_RECOVERY_HINT}`,
		});
		return { kind: "skip" };
	}
	const childrenNow = topology.value.get(branch)?.children ?? [];
	const allowedChildren = new Set(state.deletedBranches);
	if (maintenance.kind === "required-next-landing" || maintenance.kind === "optional-descendant") {
		allowedChildren.add(maintenance.branch);
	}
	const unexpectedChildren = childrenNow.filter((child) => !allowedChildren.has(child));
	if (unexpectedChildren.length > 0) {
		return failOrWarn(severity, state.warnings, {
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
	const deleteArgs = ["delete", branch, "-f", "-q"];
	const deletion =
		maintenance.kind === "none" && options.commandStream && options.unstreamedPi
			? await deleteFinalLocalGraphiteBranch({
					pi: options.unstreamedPi,
					commandStream: options.commandStream,
					repoRoot,
					branch,
				})
			: localBranchDeletionFromResult(
					await execGraphite(pi, {
						args: deleteArgs,
						cwd: repoRoot,
						timeoutMs: GT_MUTATION_TIMEOUT_MS,
					}),
				);
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
				state.warnings,
				localBranchDeletionFailurePair({
					branch,
					prNumber,
					commandDisplay: formatCommand("gt", deleteArgs),
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
	const restackArgs = ["restack", "--branch", maintenance.branch, "--upstack", "--no-interactive"];
	const restacked = await execGraphite(pi, {
		args: restackArgs,
		cwd: repoRoot,
		timeoutMs: GT_MUTATION_TIMEOUT_MS,
	});
	if (restacked.code !== 0) {
		return failOrWarn(severity, state.warnings, {
			failure: landStackFailure(formatRestackFailureMessage(prNumber, maintenance.branch, true), {
				commandDisplay: formatCommand("gt", restackArgs),
				result: restacked,
				failedBranch: maintenance.branch,
				suggestedAction: `Resolve restack failures for ${maintenance.branch}, run gt submit/update, then rerun /sdl:flow:land if appropriate.`,
			}),
			warning: {
				message: formatRestackFailureMessage(prNumber, maintenance.branch, false),
				commandDisplay: formatCommand("gt", restackArgs),
				result: restacked,
				suggestedAction: `Resolve restack failures for ${maintenance.branch}, then update that PR manually.`,
			},
		});
	}

	const submitCheck = await checkSubmitMaintenanceBranch({
		pi,
		repoRoot,
		trunk: stack.trunk,
		prNumber,
		landedBranch: branch,
		maintenanceBranch: maintenance.branch,
		severity,
		state,
	});
	if (submitCheck.kind === "halt" || submitCheck.kind === "skip") return submitCheck;

	const refreshExpected = await refreshExpectedShaAfterRestack({
		pi,
		repoRoot,
		plan,
		prNumber,
		maintenanceBranch: maintenance.branch,
		state,
	});
	if (refreshExpected) return refreshExpected;

	if (submitCheck.kind === "skip-submit") {
		options.commandStream?.note(
			`Skipped gt submit for ${maintenance.branch}; PR metadata already current.`,
		);
		return { kind: "proceed" };
	}

	setStatus(ctx, `submitting ${maintenance.branch}...`);
	return await submitMaintenanceBranch({
		pi,
		repoRoot,
		trunk: stack.trunk,
		prNumber,
		maintenanceBranch: maintenance.branch,
		severity,
		state,
	});
}

async function runOptionalDescendantGraphiteCommand(
	pi: LandStackExtensionAPI,
	options: { commandStream?: LandStackCommandStream; unstreamedPi?: LandStackExtensionAPI },
	repoRoot: string,
	commandDisplay: string,
	args: string[],
): Promise<OptionalDescendantGraphiteCommandResult> {
	if (!options.commandStream || !options.unstreamedPi) {
		const result = await execGraphite(pi, {
			args,
			cwd: repoRoot,
			timeoutMs: GT_MUTATION_TIMEOUT_MS,
		});
		return optionalGraphiteCommandResult(result, parseOptionalCheckoutConflict(result));
	}

	options.commandStream.start(commandDisplay);
	const raw = await execRawGraphite(options.unstreamedPi, {
		args,
		cwd: repoRoot,
		timeoutMs: GT_MUTATION_TIMEOUT_MS,
	});
	const rawCheckoutConflict = parseOptionalCheckoutConflict(raw);
	if (rawCheckoutConflict) {
		return optionalGraphiteCommandResult(raw, rawCheckoutConflict);
	}

	const finish = normalizeCommandFinish(GRAPHITE_COMMAND_NAME, args, raw);
	options.commandStream.finish(commandDisplay, finish);
	return optionalGraphiteCommandResult(finish.result, parseOptionalCheckoutConflict(finish.result));
}

function parseOptionalCheckoutConflict(result: ExecResult): CheckedOutElsewhere | undefined {
	return result.code !== 0 && !result.killed ? parseGitCheckedOutElsewhere(result) : undefined;
}

function optionalGraphiteCommandResult(
	result: ExecResult,
	checkoutConflict: CheckedOutElsewhere | undefined,
): OptionalDescendantGraphiteCommandResult {
	return checkoutConflict ? { result, checkoutConflict } : { result };
}

function optionalDescendantRefreshDeferredWarning(
	descendantBranch: string,
	landedBranch: string,
	getCommandDisplay: string,
	checkoutConflict: CheckedOutElsewhere,
): LandingWarning {
	const restackCommandDisplay = formatCommand("gt", [
		"restack",
		"--branch",
		descendantBranch,
		"--upstack",
		"--no-interactive",
	]);
	const submitCommandDisplay = formatCommand("gt", [
		"submit",
		"--branch",
		descendantBranch,
		"--no-stack",
		"--update-only",
		"--no-edit",
		"--no-ai",
		"--no-interactive",
	]);
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

interface DeleteFinalLocalGraphiteBranchOptions {
	pi: LandStackExtensionAPI;
	commandStream: LandStackCommandStream;
	repoRoot: string;
	branch: string;
}

type LocalBranchDeletion =
	| { kind: "deleted" }
	| { kind: "retained"; branch: string; path: string }
	| { kind: "failed"; result: ExecResult };

function localBranchDeletionFromResult(result: ExecResult): LocalBranchDeletion {
	if (result.code === 0) return { kind: "deleted" };
	return { kind: "failed", result };
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

async function deleteFinalLocalGraphiteBranch(
	options: DeleteFinalLocalGraphiteBranchOptions,
): Promise<LocalBranchDeletion> {
	const { pi, commandStream, repoRoot, branch } = options;
	const deleteArgs = ["delete", branch, "-f", "-q"];
	const commandDisplay = formatCommand("gt", deleteArgs);
	commandStream.start(commandDisplay);
	const result = await execRawGraphite(pi, {
		args: deleteArgs,
		cwd: repoRoot,
		timeoutMs: GT_MUTATION_TIMEOUT_MS,
	});
	const finish = normalizeCommandFinish(GRAPHITE_COMMAND_NAME, deleteArgs, result);
	if (finish.result.code === 0) {
		commandStream.finish(commandDisplay, finish);
		return { kind: "deleted" };
	}

	const checkout = !result.killed ? parseGitCheckedOutElsewhere(result) : undefined;
	if (!checkout) {
		commandStream.finish(commandDisplay, finish);
		return { kind: "failed", result: finish.result };
	}

	const checkedOutFinish = finalDeleteSkippedFinish(result, branch);
	commandStream.finish(commandDisplay, checkedOutFinish);
	return { kind: "retained", branch, path: checkout.path };
}

function finalDeleteSkippedFinish(result: ExecResult, branch: string): CommandStreamFinish {
	return {
		result: { ...result, code: 0 },
		note: `branch ${branch} still checked out; clean up manually with gt sync or direct branch deletion`,
	};
}
