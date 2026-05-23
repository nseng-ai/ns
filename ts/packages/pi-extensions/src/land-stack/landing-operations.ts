import { formatCommand, type ExecResult } from "../command-runtime.ts";
import { exec, execRaw, isGtDeleteCheckedOutElsewhere, normalizeCommandFinish } from "./command-exec.ts";
import { GH_MERGE_TIMEOUT_MS, GT_MUTATION_TIMEOUT_MS, SLOT_TIMEOUT_MS } from "./constants.ts";
import { errorMessage, fail } from "./errors.ts";
import { restackForSubmitArgs, restackTargetForSubmit, submitUpdateArgs } from "./landing-plan.ts";
import { formatPrSubmitRequirement, loadPr, validateStrictMergeGate } from "./pr-facts.ts";
import { assertCleanRepo, loadLocalSha, unique } from "./stack-facts.ts";
import type {
	CommandStreamFinish,
	ExtensionAPI,
	ExtensionCommandContext,
	LandedPr,
	LandingPlan,
	LandingWarning,
	PullRequestSnapshot,
	PrSubmitRequirement,
} from "./types.ts";
import { detectWorktreeConflicts, formatConflict, formatSlotConflict } from "./worktrees.ts";
import type { LandStackCommandStream } from "./command-stream.ts";
import { formatRestackFailureMessage, formatSubmitFailureMessage, setStatus } from "./presentation.ts";

export async function confirmAndSubmitRequiredPrUpdates(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	plan: LandingPlan,
): Promise<void> {
	const submitArgs = submitUpdateArgs(plan.stack.current);
	const restackTarget = restackTargetForSubmit(plan);
	const details = formatSubmitUpdateDetails(plan);
	const commandLines = restackTarget
		? [formatCommand("gt", restackForSubmitArgs(restackTarget)), formatCommand("gt", submitArgs)]
		: [formatCommand("gt", submitArgs)];
	const manualCommandText = commandLines.map((commandLine) => `\`${commandLine}\``).join(" then ");
	const actionName = restackTarget ? "restack + submit/update" : "submit/update";

	if (!ctx.hasUI) {
		fail(
			[
				`GitHub PR metadata is behind local Graphite refs, but this context cannot ask for the required ${actionName} confirmation.`,
				details,
				`No PRs were landed. Run ${manualCommandText} manually, then rerun /land-stack --yes.`,
			].join("\n"),
			{ suggestedAction: `Run ${manualCommandText} manually, then rerun /land-stack --yes.` },
		);
	}

	const confirmed = await ctx.ui.confirm(restackTarget ? "Run gt restack + submit/update?" : "Run gt submit/update?", details);
	if (!confirmed) {
		fail("Cancelled before merge; no PRs were landed.", { level: "info" });
	}

	if (restackTarget) {
		const restackArgs = restackForSubmitArgs(restackTarget);
		setStatus(ctx, `restacking ${restackTarget}...`);
		const restacked = await exec(pi, "gt", restackArgs, plan.repoRoot, GT_MUTATION_TIMEOUT_MS);
		if (restacked.code !== 0) {
			fail("gt restack failed before any PRs were landed.", {
				commandDisplay: formatCommand("gt", restackArgs),
				result: restacked,
				suggestedAction: `Resolve the restack failure, run ${formatCommand("gt", restackArgs)} and ${formatCommand("gt", submitArgs)} manually if appropriate, then rerun /land-stack.`,
			});
		}
	}

	setStatus(ctx, `submitting ${plan.stack.current}...`);
	const result = await exec(pi, "gt", submitArgs, plan.repoRoot, GT_MUTATION_TIMEOUT_MS);
	if (result.code !== 0) {
		fail("gt submit/update failed before any PRs were landed.", {
			commandDisplay: formatCommand("gt", submitArgs),
			result,
			suggestedAction: `Resolve the submit failure, run ${formatCommand("gt", submitArgs)} manually if appropriate, then rerun /land-stack.`,
		});
	}
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

export function formatRemainingSubmitRequirements(requirements: PrSubmitRequirement[]): string {
	return [
		"gt submit/update completed, but GitHub PR metadata still differs from local Graphite refs.",
		"No PRs were landed.",
		"",
		...requirements.map(formatPrSubmitRequirement),
	].join("\n");
}

export async function confirmAndFreeManagedSlots(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	plan: LandingPlan,
): Promise<void> {
	const details = [
		"Run slot gt free-stack? This detaches/frees managed slots for stack branches.",
		"",
		...plan.managedSlotConflicts.map((conflict) => `- ${formatSlotConflict(conflict)}`),
	].join("\n");

	if (!ctx.hasUI) {
		fail(
			[
				"Managed slot worktrees block stack restack/ref updates, but this context cannot ask for the required slot cleanup confirmation.",
				details,
				"No PRs were landed. Run `slot gt free-stack` manually if appropriate, then rerun /land-stack --yes.",
			].join("\n"),
		);
	}

	const confirmed = await ctx.ui.confirm("Run slot gt free-stack?", details);
	if (!confirmed) {
		fail("Cancelled before merge; no PRs were landed.", { level: "info" });
	}

	setStatus(ctx, "freeing slots...");
	const result = await exec(pi, "slot", ["gt", "free-stack"], plan.repoRoot, SLOT_TIMEOUT_MS);
	if (result.code !== 0) {
		fail("slot gt free-stack failed before any PRs were landed.", {
			commandDisplay: formatCommand("slot", ["gt", "free-stack"]),
			result,
			suggestedAction: "Inspect the slot state, free or detach blocking worktrees manually, then rerun /land-stack.",
		});
	}

	setStatus(ctx, "rechecking worktrees...");
	await assertCleanRepo(pi, plan.repoRoot);
	const relevantBranches = unique([...plan.stack.landingBranches, ...plan.stack.descendantBranches]);
	const conflicts = await detectWorktreeConflicts(pi, plan.repoRoot, plan.stack.current, relevantBranches);
	const remaining = conflicts.filter((conflict) => conflict.kind !== "current");
	if (remaining.length > 0) {
		fail(
			[
				"slot gt free-stack completed, but relevant branches are still checked out in other worktrees.",
				...remaining.map((conflict) => `- ${formatConflict(conflict)}`),
				"No PRs were landed.",
			].join("\n"),
			{ suggestedAction: "Resolve the remaining worktree checkouts manually, then rerun /land-stack." },
		);
	}
}

export async function runMergeLoop(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	plan: LandingPlan,
	landed: LandedPr[],
	warnings: LandingWarning[],
	options: { commandStream?: LandStackCommandStream; unstreamedPi?: ExtensionAPI } = {},
): Promise<void> {
	const { repoRoot, stack } = plan;

	for (let index = 0; index < stack.landingBranches.length; index += 1) {
		const branch = stack.landingBranches[index] ?? "";
		const nextLandingBranch = stack.landingBranches[index + 1];
		const nextRestackBranch = nextLandingBranch ?? (index === stack.landingBranches.length - 1 ? stack.descendantBranches[0] : undefined);

		const localSha = await loadLocalSha(pi, repoRoot, branch);
		const pr = await loadPr(pi, repoRoot, branch);
		validateStrictMergeGate({ branch, localSha, pr, trunk: stack.trunk });

		setStatus(ctx, `merging #${pr.number} ${branch}...`);
		const mergeArgs = ["pr", "merge", String(pr.number), "--squash", "--match-head-commit", pr.headRefOid];
		const merge = await exec(pi, "gh", mergeArgs, repoRoot, GH_MERGE_TIMEOUT_MS);
		if (merge.code !== 0) {
			fail("Merge rejected; stopping stack landing immediately.", {
				commandDisplay: formatCommand("gh", mergeArgs),
				result: merge,
				failedBranch: branch,
				failedPr: pr.number,
				suggestedAction: `Inspect PR #${pr.number}, resolve the merge rejection, then rerun /land-stack from the desired branch.`,
			});
		}

		setStatus(ctx, `verifying #${pr.number}...`);
		let verified: PullRequestSnapshot;
		try {
			verified = await loadPr(pi, repoRoot, String(pr.number));
		} catch (error) {
			fail(`gh pr merge exited 0, but verification could not load PR #${pr.number}; local Graphite cleanup skipped.\n${errorMessage(error)}`, {
				failedBranch: branch,
				failedPr: pr.number,
				suggestedAction: `Inspect PR #${pr.number} on GitHub before deleting or restacking local Graphite branches.`,
			});
		}
		if (verified.state !== "MERGED" || !verified.mergedAt || verified.baseRefName !== stack.trunk || verified.headRefName !== branch) {
			fail("gh pr merge exited 0 but PR did not verify as MERGED; local Graphite cleanup skipped.", {
				failedBranch: branch,
				failedPr: pr.number,
				suggestedAction: `Inspect PR #${pr.number} on GitHub before deleting or restacking local Graphite branches.`,
			});
		}

		const prUrl = verified.url ?? pr.url;
		landed.push({ branch, number: pr.number, title: pr.title, ...(prUrl ? { url: prUrl } : {}) });

		if (nextRestackBranch) {
			setStatus(ctx, `refreshing stack through ${nextRestackBranch}...`);
			const getArgs = ["get", nextRestackBranch, "--downstack", "--no-restack", "--no-checkout", "--force", "--no-interactive"];
			const got = await exec(pi, "gt", getArgs, repoRoot, GT_MUTATION_TIMEOUT_MS);
			if (got.code !== 0) {
				fail(`PR #${pr.number} merged, but targeted Graphite refresh failed.`, {
					commandDisplay: formatCommand("gt", getArgs),
					result: got,
					failedBranch: branch,
					failedPr: pr.number,
					suggestedAction: `Run ${formatCommand("gt", getArgs)} manually, inspect the stack, and rerun /land-stack if appropriate.`,
				});
			}
		}

		setStatus(ctx, `deleting local Graphite branch ${branch}...`);
		const deleteArgs = ["delete", branch, "-f", "-q"];
		const deleted =
			!nextRestackBranch && options.commandStream && options.unstreamedPi
				? await deleteFinalLocalGraphiteBranch(options.unstreamedPi, options.commandStream, repoRoot, branch)
				: await exec(pi, "gt", deleteArgs, repoRoot, GT_MUTATION_TIMEOUT_MS);
		if (deleted.code !== 0) {
			if (!nextRestackBranch) {
				warnings.push({
					message: `All target PRs were merged, but deleting the local Graphite branch ${branch} failed.`,
					commandDisplay: formatCommand("gt", deleteArgs),
					result: deleted,
					suggestedAction: `Delete or repair local Graphite branch ${branch} manually, then inspect the stack.`,
				});
				continue;
			}

			fail(`PR #${pr.number} merged, but deleting the local Graphite branch ${branch} failed.`, {
				commandDisplay: formatCommand("gt", deleteArgs),
				result: deleted,
				failedBranch: branch,
				failedPr: pr.number,
				suggestedAction: `Delete or repair local Graphite branch ${branch} manually, then inspect the stack before rerunning /land-stack.`,
			});
		}

		if (nextRestackBranch) {
			setStatus(ctx, `restacking ${nextRestackBranch}...`);
			const restackArgs = ["restack", "--branch", nextRestackBranch, "--upstack", "--no-interactive"];
			const restacked = await exec(pi, "gt", restackArgs, repoRoot, GT_MUTATION_TIMEOUT_MS);
			if (restacked.code !== 0) {
				fail(formatRestackFailureMessage(pr.number, nextRestackBranch, Boolean(nextLandingBranch)), {
					commandDisplay: formatCommand("gt", restackArgs),
					result: restacked,
					failedBranch: nextRestackBranch,
					suggestedAction: `Resolve restack failures for ${nextRestackBranch}, run gt submit/update, then rerun /land-stack if appropriate.`,
				});
			}

			setStatus(ctx, `submitting ${nextRestackBranch}...`);
			const submitArgs = ["submit", "--branch", nextRestackBranch, "--no-stack", "--update-only", "--no-edit", "--no-ai", "--no-interactive"];
			const submitted = await exec(pi, "gt", submitArgs, repoRoot, GT_MUTATION_TIMEOUT_MS);
			if (submitted.code !== 0) {
				fail(formatSubmitFailureMessage(pr.number, nextRestackBranch, Boolean(nextLandingBranch)), {
					commandDisplay: formatCommand("gt", submitArgs),
					result: submitted,
					failedBranch: nextRestackBranch,
					suggestedAction: `Update PR for ${nextRestackBranch} manually, verify it targets ${stack.trunk}, then rerun /land-stack if appropriate.`,
				});
			}
		}
	}
}

async function deleteFinalLocalGraphiteBranch(
	pi: ExtensionAPI,
	commandStream: LandStackCommandStream,
	repoRoot: string,
	branch: string,
): Promise<ExecResult> {
	const deleteArgs = ["delete", branch, "-f", "-q"];
	const commandDisplay = formatCommand("gt", deleteArgs);
	commandStream.start(commandDisplay);
	const result = await execRaw(pi, "gt", deleteArgs, repoRoot, GT_MUTATION_TIMEOUT_MS);
	const finish = normalizeCommandFinish("gt", deleteArgs, result);
	if (finish.result.code === 0) {
		commandStream.finish(commandDisplay, finish);
		return finish.result;
	}

	if (!result.killed && isGtDeleteCheckedOutElsewhere(result)) {
		const checkedOutFinish: CommandStreamFinish = {
			result: { ...result, code: 0 },
			note: `branch ${branch} still checked out; clean up manually with gt sync or direct branch deletion`,
		};
		commandStream.finish(commandDisplay, checkedOutFinish);
		return checkedOutFinish.result;
	}
	commandStream.finish(commandDisplay, finish);
	return finish.result;
}
