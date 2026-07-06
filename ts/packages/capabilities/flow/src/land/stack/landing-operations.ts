import { formatCommand } from "@nseng-ai/foundation/command";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import {
	completed,
	failure,
	landStackFailure,
	success,
	type LandStackFailure,
	type LandStackOutcome,
	type LandStackResult,
} from "./errors.ts";
import {
	performGraphiteMaintenance,
	type GraphiteMaintenanceOptions,
} from "./graphite-maintenance.ts";
import { formatGraphiteOperation } from "./graphite-command-channel.ts";
import { boundaryFailureDiagnostics, validateStrictMergeGate } from "../api.ts";
import { assertCleanRepo } from "./stack-facts.ts";
import type { LandRuntime } from "./land-runtime.ts";
import type {
	LandStackCommandContext,
	LandedPr,
	FlowLandingPlan,
	LandingWarning,
	MergeLoopState,
	PullRequestSnapshot,
	RemainingCleanup,
	WorktreeConflict,
} from "./types.ts";
import {
	detectWorktreeConflicts,
	formatConflict,
	formatSlotConflict,
	slotFreeArgs,
	slotNameFromPath,
} from "./worktrees.ts";
import { setStatus } from "./presentation.ts";
import type { LandMatrixColumnKey, LandMatrixProgressSink } from "../land-matrix-progress.ts";
import { runTrackedMatrixStep } from "../../phase-stream/matrix-progress-core.ts";
import {
	confirmPreMergeMaintenance,
	optionalField,
	type PreMergeMaintenanceOptions,
} from "./pre-merge-confirmation.ts";
import { formatRemainingSubmitRequirements } from "./pre-merge-submit.ts";
import { toLandStackFailure } from "./landing-plan.ts";
import type { LandContext, LandGitGateway, LandingFailure, ManagedSlotWorktree } from "../api.ts";

function formatRemainingManagedSlotConflicts(conflicts: WorktreeConflict[]): string {
	return [
		"Landing branches are checked out in managed slots after submit/update.",
		"No PRs were landed.",
		"",
		...conflicts.map((conflict) => `- ${formatSlotConflict(conflict)}`),
	].join("\n");
}

export function residualPreMergeFailure(plan: FlowLandingPlan): LandStackFailure | undefined {
	if (plan.managedSlotConflicts.length > 0) {
		return landStackFailure(formatRemainingManagedSlotConflicts(plan.managedSlotConflicts), {
			suggestedAction: `Run ${formatCommand("ns", ["slot", ...slotFreeArgs(plan.managedSlotConflicts)])} manually, inspect worktrees, and rerun /ns:flow:land.`,
		});
	}
	if (plan.prSubmitRequirements.length > 0) {
		return landStackFailure(formatRemainingSubmitRequirements(plan.prSubmitRequirements), {
			suggestedAction: `Run ${formatGraphiteOperation({ kind: "submit-update", branch: plan.stack.landingTargetBranch })} manually, inspect PR heads, and rerun /ns:flow:land.`,
		});
	}
	return undefined;
}

interface PreMergeSlotMaintenanceOptions extends PreMergeMaintenanceOptions {
	readonly landContext: LandContext;
}

export async function confirmAndFreeManagedSlots(
	options: PreMergeSlotMaintenanceOptions,
): Promise<LandStackOutcome> {
	const { runtime, ctx, landContext, plan } = options;
	const pi = runtime.commands;
	const freeArgs = slotFreeArgs(plan.managedSlotConflicts);
	const commandDisplay = formatCommand("ns", ["slot", ...freeArgs]);
	const details = [
		"Run targeted slot cleanup? This detaches/frees managed slots for landing branches only.",
		"",
		...plan.managedSlotConflicts.map((conflict) => `- ${formatSlotConflict(conflict)}`),
		"",
		`Command: ${commandDisplay}`,
	].join("\n");

	const confirmationOutcome = await confirmPreMergeMaintenance({
		ctx,
		...optionalField("confirmation", options.confirmation),
		title: "Free landing slots?",
		details,
		nonInteractiveMessage: [
			"Managed slot worktrees for landing branches block stack restack/ref updates, but this context cannot ask for the required slot cleanup confirmation.",
			details,
			`No PRs were landed. Run \`${commandDisplay}\` manually if appropriate, then rerun /ns:flow:land --yes.`,
		].join("\n"),
	});
	if (confirmationOutcome.type === "failure") return confirmationOutcome;

	setStatus(ctx, "freeing landing slots...");
	const result = await landContext.worktrees.freeSlots({
		repoRoot: plan.repoRoot,
		slots: plan.managedSlotConflicts.map(toManagedSlotWorktree),
	});
	if (result.type === "failure") return failure(preMergeSlotFailure(result.failure));

	setStatus(ctx, "rechecking landing worktrees...");
	const cleanRepo = await assertCleanRepo(
		pi,
		plan.repoRoot,
		optionalEntry("gitStateFs", runtime.gitStateFs),
	);
	if (cleanRepo.type === "failure") return cleanRepo;
	const conflicts = await detectWorktreeConflicts(
		pi,
		plan.repoRoot,
		plan.stack.actualCurrentBranch,
		plan.stack.landingBranches,
	);
	if (conflicts.type === "failure") return conflicts;
	const remaining = conflicts.value.filter((conflict) => conflict.kind !== "current");
	if (remaining.length > 0) {
		return failure(
			landStackFailure(
				[
					"ns slot free completed, but landing branches are still checked out in other worktrees.",
					...remaining.map((conflict) => `- ${formatConflict(conflict)}`),
					"No PRs were landed.",
				].join("\n"),
				{
					suggestedAction:
						"Resolve the remaining landing-branch worktree checkouts manually, then rerun /ns:flow:land.",
				},
			),
		);
	}
	return completed();
}

function toManagedSlotWorktree(conflict: WorktreeConflict): ManagedSlotWorktree {
	const slotName = slotNameFromPath(conflict.path);
	return {
		type: "managed-slot",
		branch: conflict.branch,
		path: conflict.path,
		...(slotName === undefined ? {} : { slotName }),
	};
}

function preMergeSlotFailure(landFailureValue: LandingFailure): LandStackFailure {
	return landStackFailure(landFailureValue.message, {
		suggestedAction:
			"Inspect the slot state, free or detach blocking landing-branch worktrees manually, then rerun /ns:flow:land.",
	});
}

function isVerifyUnavailableFailure(landFailureValue: LandingFailure): boolean {
	return (
		landFailureValue.type === "boundary" &&
		landFailureValue.code === "squash_merge_verify_unavailable"
	);
}

function stackMergeRejectedFailure(
	landFailureValue: LandingFailure,
	pr: PullRequestSnapshot,
	branch: string,
): LandStackFailure {
	const { displayCommand, execResult } = boundaryFailureDiagnostics(landFailureValue);
	return landStackFailure("Merge rejected; stopping stack landing immediately.", {
		...(execResult === undefined
			? {}
			: {
					...(displayCommand === undefined ? {} : { commandDisplay: displayCommand }),
					result: execResult,
				}),
		failedBranch: branch,
		failedPr: pr.number,
		suggestedAction: `Inspect PR #${pr.number}, resolve the merge rejection, then rerun /ns:flow:land from the desired branch.`,
	});
}

export interface PrepareMergeLoopStateOptions {
	git: LandGitGateway;
	repoRoot: string;
	branches: readonly string[];
	warnings: LandingWarning[];
}

export async function prepareMergeLoopState(
	options: PrepareMergeLoopStateOptions,
): Promise<LandStackResult<MergeLoopState>> {
	const backupRefs = await options.git.snapshotBackupRefs({
		repoRoot: options.repoRoot,
		branches: options.branches,
	});
	if (backupRefs.type === "failure") return failure(toLandStackFailure(backupRefs.failure));
	return success({
		expectedShas: new Map(backupRefs.value),
		deletedBranches: new Set(),
		warnings: options.warnings,
		cleanup: { retainedLocalBranches: [] },
	});
}

export interface RunMergeLoopOptions extends GraphiteMaintenanceOptions {
	runtime: LandRuntime;
	landContext: LandContext;
	ctx: LandStackCommandContext;
	plan: FlowLandingPlan;
	landed: LandedPr[];
	warnings: LandingWarning[];
}

interface WithMatrixCellStepOptions<T> {
	matrix: LandMatrixProgressSink | undefined;
	branch: string;
	column: LandMatrixColumnKey;
	op: () => Promise<LandStackResult<T>>;
}

async function withMatrixCellStep<T>(
	options: WithMatrixCellStepOptions<T>,
): Promise<LandStackResult<T>> {
	return await runTrackedMatrixStep({
		onActive: () => {
			options.matrix?.setCell(options.branch, options.column, { state: "active" });
		},
		onDone: () => {
			options.matrix?.setCell(options.branch, options.column, { state: "done" });
		},
		onFailed: () => {
			options.matrix?.setCell(options.branch, options.column, { state: "failed" });
		},
		op: options.op,
	});
}

export async function runMergeLoop(
	options: RunMergeLoopOptions,
): Promise<LandStackResult<RemainingCleanup>> {
	const { runtime, ctx, plan, landed, warnings } = options;
	const { repoRoot, stack } = plan;
	let state = options.mergeState;
	if (!state) {
		const preparedState = await prepareMergeLoopState({
			git: options.landContext.git,
			repoRoot,
			branches: [...stack.landingBranches, ...stack.descendantBranches],
			warnings,
		});
		if (preparedState.type === "failure") return preparedState;
		state = preparedState.value;
	}

	for (let index = 0; index < stack.landingBranches.length; index += 1) {
		const branch = stack.landingBranches[index] ?? "";
		const gated = await withMatrixCellStep({
			matrix: options.commandStream?.matrix,
			branch,
			column: "gate",
			op: async () => {
				const localSha = await options.landContext.git.localBranchSha({ repoRoot, branch });
				if (localSha.type === "failure") return failure(toLandStackFailure(localSha.failure));
				const pr = await options.landContext.github.pullRequestFacts({
					repoRoot,
					branchOrNumber: branch,
				});
				if (pr.type === "failure") return failure(toLandStackFailure(pr.failure));
				const mergeGate = validateStrictMergeGate({
					branch,
					localSha: localSha.value,
					pr: pr.value,
					trunk: stack.trunk,
				});
				if (mergeGate.type === "failure") return failure(toLandStackFailure(mergeGate.failure));
				return success(pr.value);
			},
		});
		if (gated.type === "failure") return gated;
		const currentPr = gated.value;
		const merged = await withMatrixCellStep({
			matrix: options.commandStream?.matrix,
			branch,
			column: "merge",
			op: async () => {
				options.commandStream?.note(`Merging PR #${currentPr.number} ${branch}...`);
				setStatus(ctx, `merging #${currentPr.number} ${branch} with PR title/body...`);
				const merge = await options.landContext.github.squashMergePullRequest({
					repoRoot,
					pullRequest: currentPr,
				});
				if (merge.type === "failure") {
					// The merge command exited 0 but verification could not load the PR: the merge may have
					// landed, so halt conservatively and warn against deleting/restacking local branches.
					if (isVerifyUnavailableFailure(merge.failure)) {
						return failure(
							landStackFailure(`${merge.failure.message}\nLocal Graphite cleanup skipped.`, {
								failedBranch: branch,
								failedPr: currentPr.number,
								suggestedAction: `Inspect PR #${currentPr.number} on GitHub before deleting or restacking local Graphite branches.`,
							}),
						);
					}
					return failure(stackMergeRejectedFailure(merge.failure, currentPr, branch));
				}
				return success(merge.value.verification);
			},
		});
		if (merged.type === "failure") return merged;
		const verified = await withMatrixCellStep({
			matrix: options.commandStream?.matrix,
			branch,
			column: "verify",
			op: async () => {
				setStatus(ctx, `verifying #${currentPr.number}...`);
				const verification = merged.value;
				if (
					verification.state !== "MERGED" ||
					!verification.mergedAt ||
					verification.baseRefName !== stack.trunk ||
					verification.headRefName !== branch
				) {
					return failure(
						landStackFailure(
							"squash merge succeeded but PR did not verify as MERGED; local Graphite cleanup skipped.",
							{
								failedBranch: branch,
								failedPr: currentPr.number,
								suggestedAction: `Inspect PR #${currentPr.number} on GitHub before deleting or restacking local Graphite branches.`,
							},
						),
					);
				}
				return success(verification);
			},
		});
		if (verified.type === "failure") return verified;
		const prUrl = verified.value.url ?? currentPr.url;
		landed.push({
			branch,
			number: currentPr.number,
			title: currentPr.title,
			...(prUrl ? { url: prUrl } : {}),
		});
		options.commandStream?.matrix?.setCell(branch, "verify", { state: "done" });
		options.commandStream?.emitLiveProgress({
			prNumber: currentPr.number,
			branch,
		});
		options.commandStream?.note(`Merged and verified PR #${currentPr.number} ${branch}.`);

		options.commandStream?.matrix?.setCell(branch, "restack", { state: "active" });
		const maintenance = await performGraphiteMaintenance({
			landContext: options.landContext,
			runtime,
			ctx,
			plan,
			step: { index, branch, prNumber: currentPr.number, state, options },
		});
		if (maintenance.kind === "halt") {
			options.commandStream?.matrix?.setCell(branch, "restack", { state: "failed" });
			return failure(maintenance.failure);
		}
		if (maintenance.kind === "skip") {
			options.commandStream?.matrix?.setCell(branch, "restack", { state: "skipped" });
			if (maintenance.warning !== undefined) {
				state.warnings.push(maintenance.warning);
			}
		} else {
			options.commandStream?.matrix?.setCell(branch, "restack", { state: "done" });
		}
	}
	return success(state.cleanup);
}
