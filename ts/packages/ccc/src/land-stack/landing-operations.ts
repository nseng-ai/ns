import { formatCommand, type ExecResult } from "@asdl/core/exec";
import {
	exec,
	execRaw,
	normalizeCommandFinish,
	parseGitCheckedOutElsewhere,
	shortSha,
	type CheckedOutElsewhere,
} from "./command-exec.ts";
import { GH_MERGE_TIMEOUT_MS, GT_MUTATION_TIMEOUT_MS, SLOT_TIMEOUT_MS } from "./constants.ts";
import { LAND_BACKUP_RECOVERY_HINT, writeLandBackupRefs } from "./backup-refs.ts";
import { completed, failure, landStackFailure, success, type LandStackFailure, type LandStackOutcome, type LandStackResult } from "./errors.ts";
import { loadGraphiteTopology } from "./graphite-topology.ts";
import { collectSubmitRestackRequirements, restackForSubmitArgs, restackTargetForSubmit, submitUpdateArgs } from "./landing-plan.ts";
import { formatPrSubmitRequirement, loadPr, validateStrictMergeGate } from "./pr-facts.ts";
import { assertCleanRepo, loadLocalSha } from "./stack-facts.ts";
import type {
	CommandStreamFinish,
	DescendantMaintenancePlan,
	LandStackExtensionAPI,
	LandStackCommandContext,
	LandedPr,
	LandingPlan,
	LandingWarning,
	PullRequestSnapshot,
	PrSubmitRequirement,
	RemainingCleanup,
	RestackRequirement,
	WorktreeConflict,
} from "./types.ts";
import { detectWorktreeConflicts, formatConflict, formatSlotConflict, normalizeExistingPath, slotNameFromPath } from "./worktrees.ts";
import { formatCommandForDisplay, type LandStackCommandStream } from "./command-stream.ts";
import { formatRestackFailureMessage, formatSubmitFailureMessage, setStatus } from "./presentation.ts";

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

interface MergeLoopState {
	expectedShas: Map<string, string>;
	deletedBranches: Set<string>;
	warnings: LandingWarning[];
	cleanup: RemainingCleanup;
}

interface GraphiteMaintenanceOptions {
	commandStream?: LandStackCommandStream;
	unstreamedPi?: LandStackExtensionAPI;
}

interface GraphiteMaintenanceStep {
	index: number;
	branch: string;
	prNumber: number;
	state: MergeLoopState;
	options: GraphiteMaintenanceOptions;
}

export async function confirmAndSubmitRequiredPrUpdates(
	pi: LandStackExtensionAPI,
	ctx: LandStackCommandContext,
	plan: LandingPlan,
): Promise<LandStackOutcome> {
	const submitArgs = submitUpdateArgs(plan.stack.current);
	const restackTarget = restackTargetForSubmit(plan);
	const details = formatSubmitUpdateDetails(plan);
	const commandLines = restackTarget
		? [formatCommand("gt", restackForSubmitArgs(restackTarget)), formatCommand("gt", submitArgs)]
		: [formatCommand("gt", submitArgs)];
	const manualCommandText = commandLines.map((commandLine) => `\`${commandLine}\``).join(" then ");
	const actionName = restackTarget ? "restack + submit/update" : "submit/update";

	if (!ctx.hasUI) {
		return failure(
			landStackFailure(
				[
					`GitHub PR metadata is behind local Graphite refs, but this context cannot ask for the required ${actionName} confirmation.`,
					details,
					`No PRs were landed. Run ${manualCommandText} manually, then rerun /code:land --yes.`,
				].join("\n"),
				{ suggestedAction: `Run ${manualCommandText} manually, then rerun /code:land --yes.` },
			),
		);
	}

	const confirmed = await ctx.ui.confirm(restackTarget ? "Run gt restack + submit/update?" : "Run gt submit/update?", details);
	if (!confirmed) {
		return failure(landStackFailure("Cancelled before merge; no PRs were landed.", { level: "info" }));
	}

	if (restackTarget) {
		const restackArgs = restackForSubmitArgs(restackTarget);
		setStatus(ctx, `restacking ${restackTarget}...`);
		const restacked = await exec(pi, "gt", restackArgs, plan.repoRoot, GT_MUTATION_TIMEOUT_MS);
		if (restacked.code !== 0) {
			return failure(
				landStackFailure("gt restack failed before any PRs were landed.", {
					commandDisplay: formatCommand("gt", restackArgs),
					result: restacked,
					suggestedAction: `Resolve the restack failure, run ${formatCommand("gt", restackArgs)} and ${formatCommand("gt", submitArgs)} manually if appropriate, then rerun /code:land.`,
				}),
			);
		}

		setStatus(ctx, "verifying restack...");
		const remainingRestack = await collectSubmitRestackRequirements(pi, plan.repoRoot, plan.stack);
		if (remainingRestack.type === "failure") return remainingRestack;
		if (remainingRestack.value.length > 0) {
			return failure(
				landStackFailure(formatRemainingSubmitRestackRequirements(remainingRestack.value), {
					suggestedAction: "Free or detach the holding worktrees, restack the stack, then rerun /code:land.",
				}),
			);
		}
	}

	setStatus(ctx, `submitting ${plan.stack.current}...`);
	const result = await exec(pi, "gt", submitArgs, plan.repoRoot, GT_MUTATION_TIMEOUT_MS);
	if (result.code !== 0) {
		return failure(
			landStackFailure("gt submit/update failed before any PRs were landed.", {
				commandDisplay: formatCommand("gt", submitArgs),
				result,
				suggestedAction: `Resolve the submit failure, run ${formatCommand("gt", submitArgs)} manually if appropriate, then rerun /code:land.`,
			}),
		);
	}
	return completed();
}

export function formatSubmitUpdateDetails(plan: LandingPlan): string {
	const submitArgs = submitUpdateArgs(plan.stack.current);
	const restackTarget = restackTargetForSubmit(plan);
	const commands = restackTarget
		? [formatCommand("gt", restackForSubmitArgs(restackTarget)), formatCommand("gt", submitArgs)]
		: [formatCommand("gt", submitArgs)];
	const lines = [
		restackTarget
			? "Local branch reachability shows this stack needs restack before submit/update, and GitHub PR metadata is behind local refs. Run restack then submit/update before merging?"
			: "GitHub PR metadata is behind local Graphite refs. Run Graphite submit/update before merging?",
		"",
	];

	if (restackTarget) {
		lines.push(
			"Landing branches needing restack:",
			...plan.submitRestackRequirements.map((requirement) => `- ${requirement.branch} on ${requirement.parent}`),
			"",
		);
	}

	lines.push(
		"PR metadata to update:",
		...plan.prSubmitRequirements.map(formatPrSubmitRequirement),
		"",
		"Commands:",
		...commands.map((command) => `$ ${command}`),
	);
	return lines.join("\n");
}

function formatRemainingSubmitRequirements(requirements: PrSubmitRequirement[]): string {
	return [
		"gt submit/update completed, but GitHub PR metadata still differs from local Graphite refs.",
		"No PRs were landed.",
		"",
		...requirements.map(formatPrSubmitRequirement),
	].join("\n");
}

function formatRemainingSubmitRestackRequirements(requirements: RestackRequirement[]): string {
	return [
		"gt restack completed, but these branches are still not restacked onto their parents:",
		...requirements.map((requirement) => `- ${requirement.branch} on ${requirement.parent}`),
		"",
		"gt restack exits 0 while skipping branches checked out in other worktrees.",
		"No PRs were landed; gt submit was not run.",
	].join("\n");
}

function formatRemainingManagedSlotConflicts(conflicts: WorktreeConflict[]): string {
	return [
		"Landing branches are checked out in managed slots after submit/update.",
		"No PRs were landed.",
		"",
		...conflicts.map((conflict) => `- ${formatSlotConflict(conflict)}`),
	].join("\n");
}

export function residualPreMergeFailure(plan: LandingPlan): LandStackFailure | undefined {
	if (plan.managedSlotConflicts.length > 0) {
		return landStackFailure(formatRemainingManagedSlotConflicts(plan.managedSlotConflicts), {
			suggestedAction: `Run ${formatCommand("slot", slotFreeArgs(plan.managedSlotConflicts))} manually, inspect worktrees, and rerun /code:land.`,
		});
	}
	if (plan.prSubmitRequirements.length > 0) {
		return landStackFailure(formatRemainingSubmitRequirements(plan.prSubmitRequirements), {
			suggestedAction: `Run ${formatCommand("gt", submitUpdateArgs(plan.stack.current))} manually, inspect PR heads, and rerun /code:land.`,
		});
	}
	return undefined;
}

export async function confirmAndFreeManagedSlots(
	pi: LandStackExtensionAPI,
	ctx: LandStackCommandContext,
	plan: LandingPlan,
): Promise<LandStackOutcome> {
	const freeArgs = slotFreeArgs(plan.managedSlotConflicts);
	const commandDisplay = formatCommand("slot", freeArgs);
	const details = [
		"Run targeted slot cleanup? This detaches/frees managed slots for landing branches only.",
		"",
		...plan.managedSlotConflicts.map((conflict) => `- ${formatSlotConflict(conflict)}`),
		"",
		`Command: ${commandDisplay}`,
	].join("\n");

	if (!ctx.hasUI) {
		return failure(
			landStackFailure(
				[
					"Managed slot worktrees for landing branches block stack restack/ref updates, but this context cannot ask for the required slot cleanup confirmation.",
					details,
					`No PRs were landed. Run \`${commandDisplay}\` manually if appropriate, then rerun /code:land --yes.`,
				].join("\n"),
			),
		);
	}

	const confirmed = await ctx.ui.confirm("Free landing slots?", details);
	if (!confirmed) {
		return failure(landStackFailure("Cancelled before merge; no PRs were landed.", { level: "info" }));
	}

	setStatus(ctx, "freeing landing slots...");
	const result = await exec(pi, "slot", freeArgs, plan.repoRoot, SLOT_TIMEOUT_MS);
	if (result.code !== 0) {
		return failure(
			landStackFailure("Targeted slot cleanup failed before any PRs were landed.", {
				commandDisplay,
				result,
				suggestedAction: "Inspect the slot state, free or detach blocking landing-branch worktrees manually, then rerun /code:land.",
			}),
		);
	}

	setStatus(ctx, "rechecking landing worktrees...");
	const cleanRepo = await assertCleanRepo(pi, plan.repoRoot);
	if (cleanRepo.type === "failure") return cleanRepo;
	const conflicts = await detectWorktreeConflicts(pi, plan.repoRoot, plan.stack.current, plan.stack.landingBranches);
	if (conflicts.type === "failure") return conflicts;
	const remaining = conflicts.value.filter((conflict) => conflict.kind !== "current");
	if (remaining.length > 0) {
		return failure(
			landStackFailure(
				[
					"slot free completed, but landing branches are still checked out in other worktrees.",
					...remaining.map((conflict) => `- ${formatConflict(conflict)}`),
					"No PRs were landed.",
				].join("\n"),
				{ suggestedAction: "Resolve the remaining landing-branch worktree checkouts manually, then rerun /code:land." },
			),
		);
	}
	return completed();
}

function slotFreeArgs(conflicts: WorktreeConflict[]): string[] {
	const args = ["free"];
	const seenSlots = new Set<string>();
	const seenBranches = new Set<string>();

	for (const conflict of conflicts) {
		const slotName = slotNameFromPath(conflict.path);
		if (slotName) {
			if (!seenSlots.has(slotName)) {
				seenSlots.add(slotName);
				args.push("--wt", slotName);
			}
			continue;
		}

		if (!seenBranches.has(conflict.branch)) {
			seenBranches.add(conflict.branch);
			args.push("--branch", conflict.branch);
		}
	}

	return args;
}

function squashMergeArgs(pr: PullRequestSnapshot): string[] {
	return [
		"pr",
		"merge",
		String(pr.number),
		"--squash",
		"--match-head-commit",
		pr.headRefOid,
		"--subject",
		pr.title,
		"--body",
		pr.body ?? "",
	];
}

export async function runMergeLoop(
	pi: LandStackExtensionAPI,
	ctx: LandStackCommandContext,
	plan: LandingPlan,
	landed: LandedPr[],
	warnings: LandingWarning[],
	options: GraphiteMaintenanceOptions = {},
): Promise<LandStackResult<RemainingCleanup>> {
	const { repoRoot, stack } = plan;
	const backupRefs = await writeLandBackupRefs(pi, repoRoot, [...stack.landingBranches, ...stack.descendantBranches]);
	if (backupRefs.type === "failure") return backupRefs;
	const state: MergeLoopState = {
		expectedShas: new Map(backupRefs.value),
		deletedBranches: new Set(),
		warnings,
		cleanup: { retainedLocalBranches: [], detachedWorktreeTrunk: undefined },
	};

	for (let index = 0; index < stack.landingBranches.length; index += 1) {
		const branch = stack.landingBranches[index] ?? "";
		const localSha = await loadLocalSha(pi, repoRoot, branch);
		if (localSha.type === "failure") return localSha;
		const pr = await loadPr(pi, repoRoot, branch);
		if (pr.type === "failure") return pr;
		const currentPr = pr.value;
		const mergeGate = validateStrictMergeGate({ branch, localSha: localSha.value, pr: currentPr, trunk: stack.trunk });
		if (mergeGate.type === "failure") return mergeGate;
		setStatus(ctx, `merging #${currentPr.number} ${branch} with PR title/body...`);
		const mergeArgs = squashMergeArgs(currentPr);
		const merge = await exec(pi, "gh", mergeArgs, repoRoot, GH_MERGE_TIMEOUT_MS);
		if (merge.code !== 0) {
			return failure(
				landStackFailure("Merge rejected; stopping stack landing immediately.", {
					commandDisplay: formatCommandForDisplay("gh", mergeArgs),
					result: merge,
					failedBranch: branch,
					failedPr: currentPr.number,
					suggestedAction: `Inspect PR #${currentPr.number}, resolve the merge rejection, then rerun /code:land from the desired branch.`,
				}),
			);
		}
		setStatus(ctx, `verifying #${currentPr.number}...`);
		const verified = await loadPr(pi, repoRoot, String(currentPr.number));
		if (verified.type === "failure") {
			return failure(
				landStackFailure(
					`gh pr merge exited 0, but verification could not load PR #${currentPr.number}; local Graphite cleanup skipped.\n${verified.failure.message}`,
					{
						failedBranch: branch,
						failedPr: currentPr.number,
						suggestedAction: `Inspect PR #${currentPr.number} on GitHub before deleting or restacking local Graphite branches.`,
					},
				),
			);
		}
		if (
			verified.value.state !== "MERGED" ||
			!verified.value.mergedAt ||
			verified.value.baseRefName !== stack.trunk ||
			verified.value.headRefName !== branch
		) {
			return failure(
				landStackFailure("gh pr merge exited 0 but PR did not verify as MERGED; local Graphite cleanup skipped.", {
					failedBranch: branch,
					failedPr: currentPr.number,
					suggestedAction: `Inspect PR #${currentPr.number} on GitHub before deleting or restacking local Graphite branches.`,
				}),
			);
		}
		const prUrl = verified.value.url ?? currentPr.url;
		landed.push({ branch, number: currentPr.number, title: currentPr.title, ...(prUrl ? { url: prUrl } : {}) });

		const maintenance = await performGraphiteMaintenance({
			pi,
			ctx,
			plan,
			step: { index, branch, prNumber: currentPr.number, state, options },
		});
		if (maintenance.kind === "halt") return failure(maintenance.failure);
	}
	return success(state.cleanup);
}

function failOrWarn(
	severity: MaintenanceSeverity,
	warnings: LandingWarning[],
	pair: { failure: LandStackFailure; warning: LandingWarning },
): GraphiteMaintenanceOutcome {
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
				suggestedAction: `Switch/detach ${checkoutConflict.path} from ${checkoutConflict.branch}, then run ${getCommandDisplay} manually, inspect the stack, and rerun /code:land if appropriate.`,
			},
		);
	}

	return landStackFailure(`PR #${prNumber} merged, but targeted Graphite refresh failed.`, {
		commandDisplay: getCommandDisplay,
		result: got,
		failedBranch: maintenanceBranch,
		suggestedAction: `Run ${getCommandDisplay} manually, inspect the stack, and rerun /code:land if appropriate.`,
	});
}

interface PerformGraphiteMaintenanceOptions {
	pi: LandStackExtensionAPI;
	ctx: LandStackCommandContext;
	plan: LandingPlan;
	step: GraphiteMaintenanceStep;
}

async function performGraphiteMaintenance(maintenanceOptions: PerformGraphiteMaintenanceOptions): Promise<GraphiteMaintenanceOutcome> {
	const { pi, ctx, plan, step } = maintenanceOptions;
	const { repoRoot, stack } = plan;
	const { index, branch, prNumber, state, options } = step;
	const maintenance = nextGraphiteMaintenance(plan, index);
	const severity: MaintenanceSeverity = maintenance.kind === "required-next-landing" ? "fail" : "warn";

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
						suggestedAction: `Inspect local branch ${maintenance.branch}, then rerun /code:land if appropriate. ${LAND_BACKUP_RECOVERY_HINT}`,
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
					suggestedAction: `Inspect local branch ${maintenance.branch}, reconcile it with the remote, then rerun /code:land if appropriate. ${LAND_BACKUP_RECOVERY_HINT}`,
				}),
				warning: {
					message: `All target PRs were merged, but ${movedMessage}; local branch ${branch} cleanup and descendant restack/update were skipped.`,
					suggestedAction: `Inspect local branch ${maintenance.branch}, then restack/update it and delete local branch ${branch} manually when safe. ${LAND_BACKUP_RECOVERY_HINT}`,
				},
			});
		}

		setStatus(ctx, `refreshing stack through ${maintenance.branch}...`);
		const getArgs = ["get", maintenance.branch, "--downstack", "--no-restack", "--no-checkout", "--force", "--no-interactive"];
		const getCommandDisplay = formatCommand("gt", getArgs);
		const getResult: OptionalDescendantGraphiteCommandResult =
			maintenance.kind === "optional-descendant"
				? await runOptionalDescendantGraphiteCommand(pi, options, repoRoot, getCommandDisplay, "gt", getArgs)
				: { result: await exec(pi, "gt", getArgs, repoRoot, GT_MUTATION_TIMEOUT_MS) };
		const got = getResult.result;
		if (got.code !== 0) {
			if (maintenance.kind === "required-next-landing") {
				return { kind: "halt", failure: graphiteRefreshFailure({ prNumber, maintenanceBranch: maintenance.branch, getCommandDisplay, got }) };
			}

			if (getResult.checkoutConflict) {
				state.warnings.push(optionalDescendantRefreshDeferredWarning(maintenance.branch, branch, getCommandDisplay, getResult.checkoutConflict));
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
	const skippedScope = maintenance.kind === "optional-descendant" ? `local branch ${branch} cleanup and descendant restack/update were` : `local branch ${branch} cleanup was`;
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
					suggestedAction: `Inspect the unexpected children, land or move them, then clean up local branch ${branch} manually before rerunning /code:land. ${LAND_BACKUP_RECOVERY_HINT}`,
				},
			),
			warning: {
				message: `All target PRs were merged, but ${branch} now has unexpected Graphite children (${unexpectedChildren.join(", ")}); ${skippedScope} skipped.`,
				suggestedAction: `Inspect the unexpected children, then delete local branch ${branch} and restack descendants manually when safe. ${LAND_BACKUP_RECOVERY_HINT}`,
			},
		});
	}

	setStatus(ctx, `deleting local Graphite branch ${branch}...`);
	const deleteArgs = ["delete", branch, "-f", "-q"];
	const deletion =
		maintenance.kind === "none" && options.commandStream && options.unstreamedPi
			? await deleteFinalLocalGraphiteBranch({
					pi: options.unstreamedPi,
					commandStream: options.commandStream,
					repoRoot,
					branch,
					trunk: stack.trunk,
				})
			: localBranchDeletionFromResult(await exec(pi, "gt", deleteArgs, repoRoot, GT_MUTATION_TIMEOUT_MS));
	switch (deletion.kind) {
		case "deleted":
			state.deletedBranches.add(branch);
			break;
		case "deleted-after-detach":
			state.cleanup.detachedWorktreeTrunk = stack.trunk;
			state.deletedBranches.add(branch);
			break;
		case "retained":
			state.cleanup.retainedLocalBranches.push({ branch: deletion.branch, path: deletion.path });
			break;
		case "failed":
			if (deletion.wasDetachedAtTrunk) {
				state.cleanup.detachedWorktreeTrunk = stack.trunk;
			}
			return failOrWarn(severity, state.warnings, {
				failure: landStackFailure(`PR #${prNumber} merged, but deleting the local Graphite branch ${branch} failed.`, {
					commandDisplay: formatCommand("gt", deleteArgs),
					result: deletion.result,
					failedBranch: branch,
					failedPr: prNumber,
					suggestedAction: `Delete or repair local Graphite branch ${branch} manually, then inspect the stack before rerunning /code:land.`,
				}),
				warning: {
					message:
						maintenance.kind === "optional-descendant"
							? `All target PRs were merged, but deleting the local Graphite branch ${branch} failed; descendant restack/update was skipped.`
							: `All target PRs were merged, but deleting the local Graphite branch ${branch} failed.`,
					commandDisplay: formatCommand("gt", deleteArgs),
					result: deletion.result,
					suggestedAction: `Delete or repair local Graphite branch ${branch} manually, then inspect the stack.`,
				},
			});
		default:
			assertNever(deletion);
	}

	if (maintenance.kind !== "required-next-landing" && maintenance.kind !== "optional-descendant") {
		return { kind: "proceed" };
	}

	setStatus(ctx, `restacking ${maintenance.branch}...`);
	const restackArgs = ["restack", "--branch", maintenance.branch, "--upstack", "--no-interactive"];
	const restacked = await exec(pi, "gt", restackArgs, repoRoot, GT_MUTATION_TIMEOUT_MS);
	if (restacked.code !== 0) {
		return failOrWarn(severity, state.warnings, {
			failure: landStackFailure(formatRestackFailureMessage(prNumber, maintenance.branch, true), {
				commandDisplay: formatCommand("gt", restackArgs),
				result: restacked,
				failedBranch: maintenance.branch,
				suggestedAction: `Resolve restack failures for ${maintenance.branch}, run gt submit/update, then rerun /code:land if appropriate.`,
			}),
			warning: {
				message: formatRestackFailureMessage(prNumber, maintenance.branch, false),
				commandDisplay: formatCommand("gt", restackArgs),
				result: restacked,
				suggestedAction: `Resolve restack failures for ${maintenance.branch}, then update that PR manually.`,
			},
		});
	}

	// gt restack --upstack legitimately rewrites upstack branches, so refresh the
	// expectation for the next iteration's forced refresh target; comparing against
	// the pre-restack SHA would false-positive on every 3+ branch stack.
	const next = nextGraphiteMaintenance(plan, index + 1);
	const nextGetTarget = next.kind === "required-next-landing" || next.kind === "optional-descendant" ? next.branch : undefined;
	if (nextGetTarget !== undefined) {
		const refreshedSha = await loadLocalSha(pi, repoRoot, nextGetTarget);
		if (refreshedSha.type === "failure") {
			return {
				kind: "halt",
				failure: landStackFailure(
					`PR #${prNumber} merged, but could not re-read local branch ${nextGetTarget} after restack.\n${refreshedSha.failure.message}`,
					{
						failedBranch: nextGetTarget,
						suggestedAction: `Inspect local branch ${nextGetTarget}, then rerun /code:land if appropriate. ${LAND_BACKUP_RECOVERY_HINT}`,
					},
				),
			};
		}
		state.expectedShas.set(nextGetTarget, refreshedSha.value);
	}

	setStatus(ctx, `submitting ${maintenance.branch}...`);
	const submitArgs = ["submit", "--branch", maintenance.branch, "--no-stack", "--update-only", "--no-edit", "--no-ai", "--no-interactive"];
	const submitted = await exec(pi, "gt", submitArgs, repoRoot, GT_MUTATION_TIMEOUT_MS);
	if (submitted.code !== 0) {
		return failOrWarn(severity, state.warnings, {
			failure: landStackFailure(formatSubmitFailureMessage(prNumber, maintenance.branch, true), {
				commandDisplay: formatCommand("gt", submitArgs),
				result: submitted,
				failedBranch: maintenance.branch,
				suggestedAction: `Update PR for ${maintenance.branch} manually, verify it targets ${stack.trunk}, then rerun /code:land if appropriate.`,
			}),
			warning: {
				message: formatSubmitFailureMessage(prNumber, maintenance.branch, false),
				commandDisplay: formatCommand("gt", submitArgs),
				result: submitted,
				suggestedAction: `Update PR for ${maintenance.branch} manually and verify it targets ${stack.trunk}.`,
			},
		});
	}
	return { kind: "proceed" };
}

async function runOptionalDescendantGraphiteCommand(
	pi: LandStackExtensionAPI,
	options: { commandStream?: LandStackCommandStream; unstreamedPi?: LandStackExtensionAPI },
	repoRoot: string,
	commandDisplay: string,
	command: string,
	args: string[],
): Promise<OptionalDescendantGraphiteCommandResult> {
	if (!options.commandStream || !options.unstreamedPi) {
		const result = await exec(pi, command, args, repoRoot, GT_MUTATION_TIMEOUT_MS);
		return optionalGraphiteCommandResult(result, parseOptionalCheckoutConflict(result));
	}

	options.commandStream.start(commandDisplay);
	const raw = await execRaw(options.unstreamedPi, command, args, repoRoot, GT_MUTATION_TIMEOUT_MS);
	const rawCheckoutConflict = parseOptionalCheckoutConflict(raw);
	if (rawCheckoutConflict) {
		return optionalGraphiteCommandResult(raw, rawCheckoutConflict);
	}

	const finish = normalizeCommandFinish(command, args, raw);
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
	const restackCommandDisplay = formatCommand("gt", ["restack", "--branch", descendantBranch, "--upstack", "--no-interactive"]);
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

	if (plan.descendantMaintenance.kind === "auto") {
		return { kind: "optional-descendant", branch: plan.descendantMaintenance.targetBranch };
	}
	if (plan.descendantMaintenance.kind === "skipped") {
		return { kind: "skip-descendant" };
	}
	return { kind: "none" };
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

function skippedDescendantNotificationAction(maintenance: Extract<DescendantMaintenancePlan, { kind: "skipped" }>): string {
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
	trunk: string;
}

type LocalBranchDeletion =
	| { kind: "deleted" }
	| { kind: "deleted-after-detach" }
	| { kind: "retained"; branch: string; path: string }
	| { kind: "failed"; result: ExecResult; wasDetachedAtTrunk: boolean };

function localBranchDeletionFromResult(result: ExecResult): LocalBranchDeletion {
	if (result.code === 0) return { kind: "deleted" };
	return { kind: "failed", result, wasDetachedAtTrunk: false };
}

function assertNever(value: never): never {
	throw new Error(`Unhandled local branch deletion result: ${JSON.stringify(value)}`);
}

async function deleteFinalLocalGraphiteBranch(options: DeleteFinalLocalGraphiteBranchOptions): Promise<LocalBranchDeletion> {
	const { pi, commandStream, repoRoot, branch, trunk } = options;
	const deleteArgs = ["delete", branch, "-f", "-q"];
	const commandDisplay = formatCommand("gt", deleteArgs);
	commandStream.start(commandDisplay);
	const result = await execRaw(pi, "gt", deleteArgs, repoRoot, GT_MUTATION_TIMEOUT_MS);
	const finish = normalizeCommandFinish("gt", deleteArgs, result);
	if (finish.result.code === 0) {
		commandStream.finish(commandDisplay, finish);
		return { kind: "deleted" };
	}

	const checkout = !result.killed ? parseGitCheckedOutElsewhere(result) : undefined;
	if (!checkout) {
		commandStream.finish(commandDisplay, finish);
		return { kind: "failed", result: finish.result, wasDetachedAtTrunk: false };
	}

	if (normalizeExistingPath(checkout.path) !== normalizeExistingPath(repoRoot)) {
		const checkedOutFinish = finalDeleteSkippedFinish(result, branch);
		commandStream.finish(commandDisplay, checkedOutFinish);
		return { kind: "retained", branch, path: checkout.path };
	}

	commandStream.finish(commandDisplay, {
		result,
		note: `branch ${branch} checked out in this worktree; detaching at ${trunk} and retrying`,
	});
	const detachArgs = ["switch", "--detach", trunk];
	const detachDisplay = formatCommand("git", detachArgs);
	commandStream.start(detachDisplay);
	const detach = await execRaw(pi, "git", detachArgs, repoRoot, GT_MUTATION_TIMEOUT_MS);
	const detachFinish = normalizeCommandFinish("git", detachArgs, detach);
	commandStream.finish(detachDisplay, detachFinish);
	if (detachFinish.result.code !== 0) {
		return { kind: "retained", branch, path: checkout.path };
	}

	commandStream.start(commandDisplay);
	const retry = await execRaw(pi, "gt", deleteArgs, repoRoot, GT_MUTATION_TIMEOUT_MS);
	const retryFinish = normalizeCommandFinish("gt", deleteArgs, retry);
	commandStream.finish(commandDisplay, retryFinish);
	if (retryFinish.result.code !== 0) {
		return { kind: "failed", result: retryFinish.result, wasDetachedAtTrunk: true };
	}
	return { kind: "deleted-after-detach" };
}

function finalDeleteSkippedFinish(result: ExecResult, branch: string): CommandStreamFinish {
	return {
		result: { ...result, code: 0 },
		note: `branch ${branch} still checked out; clean up manually with gt sync or direct branch deletion`,
	};
}
