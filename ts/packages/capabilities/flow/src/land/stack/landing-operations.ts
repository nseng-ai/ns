import { formatCommand } from "@sdl/core/command";
import { exec } from "./command-exec.ts";
import { formatCommandForDisplay } from "./command-stream.ts";
import { GH_MERGE_TIMEOUT_MS, SLOT_TIMEOUT_MS } from "./constants.ts";
import { writeLandBackupRefs } from "./backup-refs.ts";
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
import { loadPr, validateStrictMergeGateForLandStack } from "./pr-facts.ts";
import { assertCleanRepo, loadLocalSha } from "./stack-facts.ts";
import type { LandRuntime } from "./land-runtime.ts";
import type {
	LandStackCommandContext,
	LandStackExtensionAPI,
	LandedPr,
	LandingPlan,
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
	slotNameFromPath,
} from "./worktrees.ts";
import { setStatus } from "./presentation.ts";
import {
	confirmPreMergeMaintenance,
	optionalField,
	type PreMergeMaintenanceOptions,
} from "./pre-merge-confirmation.ts";
import { formatRemainingSubmitRequirements } from "./pre-merge-submit.ts";

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
			suggestedAction: `Run ${formatCommand("sdl", ["slot", ...slotFreeArgs(plan.managedSlotConflicts)])} manually, inspect worktrees, and rerun /sdl:flow:land.`,
		});
	}
	if (plan.prSubmitRequirements.length > 0) {
		return landStackFailure(formatRemainingSubmitRequirements(plan.prSubmitRequirements), {
			suggestedAction: `Run ${formatGraphiteOperation({ kind: "submit-update", branch: plan.stack.landingTargetBranch })} manually, inspect PR heads, and rerun /sdl:flow:land.`,
		});
	}
	return undefined;
}

export async function confirmAndFreeManagedSlots(
	options: PreMergeMaintenanceOptions,
): Promise<LandStackOutcome> {
	const { runtime, ctx, plan } = options;
	const pi = runtime.commands;
	const freeArgs = slotFreeArgs(plan.managedSlotConflicts);
	const commandDisplay = formatCommand("sdl", ["slot", ...freeArgs]);
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
			`No PRs were landed. Run \`${commandDisplay}\` manually if appropriate, then rerun /sdl:flow:land --yes.`,
		].join("\n"),
	});
	if (confirmationOutcome.type === "failure") return confirmationOutcome;

	setStatus(ctx, "freeing landing slots...");
	const result = await exec({
		pi,
		command: "sdl",
		args: ["slot", ...freeArgs],
		cwd: plan.repoRoot,
		timeoutMs: SLOT_TIMEOUT_MS,
	});
	if (result.code !== 0) {
		return failure(
			landStackFailure("Targeted slot cleanup failed before any PRs were landed.", {
				commandDisplay,
				result,
				suggestedAction:
					"Inspect the slot state, free or detach blocking landing-branch worktrees manually, then rerun /sdl:flow:land.",
			}),
		);
	}

	setStatus(ctx, "rechecking landing worktrees...");
	const cleanRepo = await assertCleanRepo(pi, plan.repoRoot);
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
					"sdl slot free completed, but landing branches are still checked out in other worktrees.",
					...remaining.map((conflict) => `- ${formatConflict(conflict)}`),
					"No PRs were landed.",
				].join("\n"),
				{
					suggestedAction:
						"Resolve the remaining landing-branch worktree checkouts manually, then rerun /sdl:flow:land.",
				},
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

export function squashMergeArgs(pr: PullRequestSnapshot): string[] {
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

export interface PrepareMergeLoopStateOptions {
	pi: LandStackExtensionAPI;
	repoRoot: string;
	branches: readonly string[];
	warnings: LandingWarning[];
}

export async function prepareMergeLoopState(
	options: PrepareMergeLoopStateOptions,
): Promise<LandStackResult<MergeLoopState>> {
	const backupRefs = await writeLandBackupRefs(options.pi, options.repoRoot, [...options.branches]);
	if (backupRefs.type === "failure") return backupRefs;
	return success({
		expectedShas: new Map(backupRefs.value),
		deletedBranches: new Set(),
		warnings: options.warnings,
		cleanup: { retainedLocalBranches: [] },
	});
}

export interface RunMergeLoopOptions extends GraphiteMaintenanceOptions {
	runtime: LandRuntime;
	ctx: LandStackCommandContext;
	plan: LandingPlan;
	landed: LandedPr[];
	warnings: LandingWarning[];
}

export async function runMergeLoop(
	options: RunMergeLoopOptions,
): Promise<LandStackResult<RemainingCleanup>> {
	const { runtime, ctx, plan, landed, warnings } = options;
	const pi = runtime.commands;
	const { repoRoot, stack } = plan;
	let state = options.mergeState;
	if (!state) {
		const preparedState = await prepareMergeLoopState({
			pi,
			repoRoot,
			branches: [...stack.landingBranches, ...stack.descendantBranches],
			warnings,
		});
		if (preparedState.type === "failure") return preparedState;
		state = preparedState.value;
	}

	for (let index = 0; index < stack.landingBranches.length; index += 1) {
		const branch = stack.landingBranches[index] ?? "";
		const localSha = await loadLocalSha(pi, repoRoot, branch);
		if (localSha.type === "failure") return localSha;
		const pr = await loadPr(pi, repoRoot, branch);
		if (pr.type === "failure") return pr;
		const currentPr = pr.value;
		const mergeGate = validateStrictMergeGateForLandStack({
			branch,
			localSha: localSha.value,
			pr: currentPr,
			trunk: stack.trunk,
		});
		if (mergeGate.type === "failure") return mergeGate;
		options.commandStream?.note(`Merging PR #${currentPr.number} ${branch}...`);
		setStatus(ctx, `merging #${currentPr.number} ${branch} with PR title/body...`);
		const mergeArgs = squashMergeArgs(currentPr);
		const merge = await exec({
			pi,
			command: "gh",
			args: mergeArgs,
			cwd: repoRoot,
			timeoutMs: GH_MERGE_TIMEOUT_MS,
		});
		if (merge.code !== 0) {
			return failure(
				landStackFailure("Merge rejected; stopping stack landing immediately.", {
					commandDisplay: formatCommandForDisplay("gh", mergeArgs),
					result: merge,
					failedBranch: branch,
					failedPr: currentPr.number,
					suggestedAction: `Inspect PR #${currentPr.number}, resolve the merge rejection, then rerun /sdl:flow:land from the desired branch.`,
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
		const prUrl = verified.value.url ?? currentPr.url;
		landed.push({
			branch,
			number: currentPr.number,
			title: currentPr.title,
			...(prUrl ? { url: prUrl } : {}),
		});
		options.commandStream?.emitLiveProgress({
			prNumber: currentPr.number,
			branch,
		});
		options.commandStream?.note(`Merged and verified PR #${currentPr.number} ${branch}.`);

		const maintenance = await performGraphiteMaintenance({
			runtime,
			ctx,
			plan,
			step: { index, branch, prNumber: currentPr.number, state, options },
		});
		if (maintenance.kind === "halt") return failure(maintenance.failure);
		if (maintenance.kind === "skip" && maintenance.warning !== undefined) {
			state.warnings.push(maintenance.warning);
		}
	}
	return success(state.cleanup);
}
