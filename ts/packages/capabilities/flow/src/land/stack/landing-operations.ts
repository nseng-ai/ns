import { formatCommand } from "@nseng-ai/foundation/command";
import type { LandStackCommandStream } from "./command-stream.ts";
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
import { performGraphiteMaintenance } from "./graphite-maintenance.ts";
import { formatGraphiteOperation } from "./graphite-command-channel.ts";
import { boundaryFailureDiagnostics, validateStrictMergeGate } from "../api.ts";
import { assertCleanRepo } from "./stack-facts.ts";
import type { StackLandingRuntime } from "./stack-landing-runtime.ts";
import type { LandingPlan, LandingWarning, PullRequestFacts, WorktreeConflict } from "../types.ts";
import type {
	LandStackCommandContext,
	LandedPr,
	MergeLoopState,
	RemainingCleanup,
} from "./types.ts";
import {
	detectWorktreeConflicts,
	formatConflict,
	formatSlotConflict,
	slotFreeArgs,
	slotNameFromPath,
} from "./worktrees.ts";
import { setStatus } from "../land-presentation.ts";
import type { LandMatrixColumnKey, LandMatrixProgressSink } from "../land-matrix-progress.ts";
import { runTrackedMatrixStep } from "../../phase-stream/matrix-progress-core.ts";
import {
	confirmPreMergeMaintenance,
	optionalField,
	type PreMergeMaintenanceOptions,
} from "./pre-merge-confirmation.ts";
import { formatRemainingSubmitRequirements } from "./pre-merge-submit.ts";
import { toLandStackFailure } from "./landing-plan.ts";
import type { LandGitGateway, LandingFailure, ManagedSlotWorktree } from "../api.ts";

function formatRemainingManagedSlotConflicts(conflicts: readonly WorktreeConflict[]): string {
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

export async function confirmAndFreeManagedSlots(
	options: PreMergeMaintenanceOptions,
): Promise<LandStackOutcome> {
	const { runtime, ctx, plan } = options;
	const landContext = runtime.landContext;
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
	const remaining = conflicts.value.filter((conflict) => conflict.type !== "current");
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

function stackMergeRejectedFailure(
	landFailureValue: LandingFailure,
	pr: PullRequestFacts,
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

export interface RunMergeLoopOptions {
	readonly runtime: StackLandingRuntime;
	readonly ctx: LandStackCommandContext;
	readonly plan: LandingPlan;
	readonly landed: LandedPr[];
	readonly warnings: LandingWarning[];
	readonly commandStream: LandStackCommandStream;
	readonly mergeState?: MergeLoopState;
}

const ignoreLandMatrixProgress = (): void => undefined;

const NULL_LAND_MATRIX_PROGRESS_SINK: LandMatrixProgressSink = {
	setRows: ignoreLandMatrixProgress,
	setActiveOperations: ignoreLandMatrixProgress,
	setCell: ignoreLandMatrixProgress,
	setAllCells: ignoreLandMatrixProgress,
	setAllOtherCells: ignoreLandMatrixProgress,
	recordMergedPr: ignoreLandMatrixProgress,
};

interface WithMatrixCellStepOptions<T> {
	matrix: LandMatrixProgressSink;
	branch: string;
	column: LandMatrixColumnKey;
	op: () => Promise<LandStackResult<T>>;
}

async function withMatrixCellStep<T>(
	options: WithMatrixCellStepOptions<T>,
): Promise<LandStackResult<T>> {
	return await runTrackedMatrixStep({
		onActive: () => {
			options.matrix.setCell(options.branch, options.column, { state: "active" });
		},
		onDone: () => {
			options.matrix.setCell(options.branch, options.column, { state: "done" });
		},
		onFailed: () => {
			options.matrix.setCell(options.branch, options.column, { state: "failed" });
		},
		op: options.op,
	});
}

export async function runMergeLoop(
	options: RunMergeLoopOptions,
): Promise<LandStackResult<RemainingCleanup>> {
	const { runtime, ctx, plan, landed, warnings, commandStream } = options;
	const landContext = runtime.landContext;
	const matrix = commandStream.matrix ?? NULL_LAND_MATRIX_PROGRESS_SINK;
	const { repoRoot, stack } = plan;
	let state = options.mergeState;
	if (!state) {
		const preparedState = await prepareMergeLoopState({
			git: landContext.git,
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
			matrix,
			branch,
			column: "gate",
			op: async () => {
				const localSha = await landContext.git.localBranchSha({ repoRoot, branch });
				if (localSha.type === "failure") return failure(toLandStackFailure(localSha.failure));
				const pr = await landContext.github.pullRequestFacts({
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
			matrix,
			branch,
			column: "merge",
			op: async () => {
				commandStream.note(`Merging PR #${currentPr.number} ${branch}...`);
				setStatus(ctx, `merging #${currentPr.number} ${branch} with PR title/body...`);
				const merge = await landContext.github.squashMergePullRequest({
					repoRoot,
					pullRequest: currentPr,
				});
				return merge.type === "failure"
					? failure(stackMergeRejectedFailure(merge.failure, currentPr, branch))
					: success(undefined);
			},
		});
		if (merged.type === "failure") return merged;
		const verified = await withMatrixCellStep({
			matrix,
			branch,
			column: "verify",
			op: async () => {
				setStatus(ctx, `verifying #${currentPr.number}...`);
				const facts = await landContext.github.pullRequestFacts({
					repoRoot,
					branchOrNumber: String(currentPr.number),
				});
				if (facts.type === "failure") {
					return failure(
						landStackFailure(
							`gh pr merge exited 0, but verification could not load PR #${currentPr.number}; local Graphite cleanup skipped.\n${facts.failure.message}`,
							{
								failedBranch: branch,
								failedPr: currentPr.number,
								suggestedAction: `Inspect PR #${currentPr.number} on GitHub before deleting or restacking local Graphite branches.`,
							},
						),
					);
				}
				if (
					facts.value.state !== "MERGED" ||
					!facts.value.mergedAt ||
					facts.value.baseRefName !== stack.trunk ||
					facts.value.headRefName !== branch
				) {
					return failure(
						landStackFailure(
							"gh pr merge exited 0 but PR did not verify as MERGED; local Graphite cleanup skipped.",
							{
								failedBranch: branch,
								failedPr: currentPr.number,
								suggestedAction: `Inspect PR #${currentPr.number} on GitHub before deleting or restacking local Graphite branches.`,
							},
						),
					);
				}
				return success(facts.value);
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
		commandStream.emitLiveProgress({
			prNumber: currentPr.number,
			branch,
		});
		commandStream.note(`Merged and verified PR #${currentPr.number} ${branch}.`);

		matrix.setCell(branch, "restack", { state: "active" });
		const maintenance = await performGraphiteMaintenance({
			landContext,
			progress: {
				note: (message) => commandStream.note(message),
				setStatus: (message) => setStatus(ctx, message),
			},
			plan,
			step: { index, branch, prNumber: currentPr.number, state },
		});
		if (maintenance.kind === "halt") {
			matrix.setCell(branch, "restack", { state: "failed" });
			return failure(maintenance.failure);
		}
		if (maintenance.kind === "skip") {
			matrix.setCell(branch, "restack", { state: "skipped" });
			if (maintenance.warning !== undefined) {
				state.warnings.push(maintenance.warning);
			}
		} else {
			matrix.setCell(branch, "restack", { state: "done" });
		}
	}
	return success(state.cleanup);
}
