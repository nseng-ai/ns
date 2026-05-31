import { formatCommand, type ExecResult } from "../command-runtime.ts";
import {
	exec,
	execRaw,
	isGtDeleteCheckedOutElsewhere,
	normalizeCommandFinish,
	parseGitCheckedOutElsewhere,
	type CheckedOutElsewhere,
} from "./command-exec.ts";
import { GH_MERGE_TIMEOUT_MS, GT_MUTATION_TIMEOUT_MS, SLOT_TIMEOUT_MS } from "./constants.ts";
import { errorMessage, fail } from "./errors.ts";
import { restackForSubmitArgs, restackTargetForSubmit, submitUpdateArgs } from "./landing-plan.ts";
import { formatPrSubmitRequirement, loadPr, validateStrictMergeGate } from "./pr-facts.ts";
import { assertCleanRepo, loadLocalSha } from "./stack-facts.ts";
import type {
	CommandStreamFinish,
	ExtensionAPI,
	ExtensionCommandContext,
	LandedPr,
	LandingPlan,
	LandingWarning,
	PullRequestSnapshot,
	PrSubmitRequirement,
	WorktreeConflict,
} from "./types.ts";
import { detectWorktreeConflicts, formatConflict, formatSlotConflict, slotNameFromPath } from "./worktrees.ts";
import { formatCommandForDisplay, type LandStackCommandStream } from "./command-stream.ts";
import { formatRestackFailureMessage, formatSubmitFailureMessage, setStatus } from "./presentation.ts";

type NextGraphiteMaintenance =
	| { kind: "required-next-landing"; branch: string }
	| { kind: "optional-descendant"; branch: string }
	| { kind: "skip-descendant" }
	| { kind: "none" };

type OptionalDescendantGraphiteCommandResult = {
	result: ExecResult;
	checkoutConflict?: CheckedOutElsewhere;
};

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
				`No PRs were landed. Run ${manualCommandText} manually, then rerun /dev:land-stack --yes.`,
			].join("\n"),
			{ suggestedAction: `Run ${manualCommandText} manually, then rerun /dev:land-stack --yes.` },
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
				suggestedAction: `Resolve the restack failure, run ${formatCommand("gt", restackArgs)} and ${formatCommand("gt", submitArgs)} manually if appropriate, then rerun /dev:land-stack.`,
			});
		}
	}

	setStatus(ctx, `submitting ${plan.stack.current}...`);
	const result = await exec(pi, "gt", submitArgs, plan.repoRoot, GT_MUTATION_TIMEOUT_MS);
	if (result.code !== 0) {
		fail("gt submit/update failed before any PRs were landed.", {
			commandDisplay: formatCommand("gt", submitArgs),
			result,
			suggestedAction: `Resolve the submit failure, run ${formatCommand("gt", submitArgs)} manually if appropriate, then rerun /dev:land-stack.`,
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
		fail(
			[
				"Managed slot worktrees for landing branches block stack restack/ref updates, but this context cannot ask for the required slot cleanup confirmation.",
				details,
				`No PRs were landed. Run \`${commandDisplay}\` manually if appropriate, then rerun /dev:land-stack --yes.`,
			].join("\n"),
		);
	}

	const confirmed = await ctx.ui.confirm("Free landing slots?", details);
	if (!confirmed) {
		fail("Cancelled before merge; no PRs were landed.", { level: "info" });
	}

	setStatus(ctx, "freeing landing slots...");
	const result = await exec(pi, "slot", freeArgs, plan.repoRoot, SLOT_TIMEOUT_MS);
	if (result.code !== 0) {
		fail("Targeted slot cleanup failed before any PRs were landed.", {
			commandDisplay,
			result,
			suggestedAction: "Inspect the slot state, free or detach blocking landing-branch worktrees manually, then rerun /dev:land-stack.",
		});
	}

	setStatus(ctx, "rechecking landing worktrees...");
	await assertCleanRepo(pi, plan.repoRoot);
	const conflicts = await detectWorktreeConflicts(pi, plan.repoRoot, plan.stack.current, plan.stack.landingBranches);
	const remaining = conflicts.filter((conflict) => conflict.kind !== "current");
	if (remaining.length > 0) {
		fail(
			[
				"slot free completed, but landing branches are still checked out in other worktrees.",
				...remaining.map((conflict) => `- ${formatConflict(conflict)}`),
				"No PRs were landed.",
			].join("\n"),
			{ suggestedAction: "Resolve the remaining landing-branch worktree checkouts manually, then rerun /dev:land-stack." },
		);
	}
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
		const maintenance = nextGraphiteMaintenance(plan, index);

		const localSha = await loadLocalSha(pi, repoRoot, branch);
		const pr = await loadPr(pi, repoRoot, branch);
		validateStrictMergeGate({ branch, localSha, pr, trunk: stack.trunk });

		setStatus(ctx, `merging #${pr.number} ${branch} with PR title/body...`);
		const mergeArgs = squashMergeArgs(pr);
		const merge = await exec(pi, "gh", mergeArgs, repoRoot, GH_MERGE_TIMEOUT_MS);
		if (merge.code !== 0) {
			fail("Merge rejected; stopping stack landing immediately.", {
				commandDisplay: formatCommandForDisplay("gh", mergeArgs),
				result: merge,
				failedBranch: branch,
				failedPr: pr.number,
				suggestedAction: `Inspect PR #${pr.number}, resolve the merge rejection, then rerun /dev:land-stack from the desired branch.`,
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

		if (maintenance.kind === "required-next-landing" || maintenance.kind === "optional-descendant") {
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
					const checkoutConflict = parseGitCheckedOutElsewhere(got);
					if (checkoutConflict) {
						fail(
							`PR #${pr.number} merged, but Graphite could not refresh next landing branch ${maintenance.branch}: ${formatCheckedOutElsewhere(checkoutConflict)}.`,
							{
								commandDisplay: getCommandDisplay,
								result: got,
								failedBranch: maintenance.branch,
								suggestedAction: `Switch/detach ${checkoutConflict.path} from ${checkoutConflict.branch}, then run ${getCommandDisplay} manually, inspect the stack, and rerun /dev:land-stack if appropriate.`,
							},
						);
					}

					fail(`PR #${pr.number} merged, but targeted Graphite refresh failed.`, {
						commandDisplay: getCommandDisplay,
						result: got,
						failedBranch: maintenance.branch,
						suggestedAction: `Run ${getCommandDisplay} manually, inspect the stack, and rerun /dev:land-stack if appropriate.`,
					});
				}

				if (getResult.checkoutConflict) {
					warnings.push(
						optionalDescendantRefreshDeferredWarning(maintenance.branch, branch, getCommandDisplay, getResult.checkoutConflict),
					);
					options.commandStream?.note(
						`Deferred optional descendant maintenance for ${maintenance.branch} because ${formatCheckedOutElsewhere(getResult.checkoutConflict)}.\nRun ${getCommandDisplay} manually when that worktree is free.`,
					);
					continue;
				}

				warnings.push({
					message: `All target PRs were merged, but Graphite refresh for descendant branch ${maintenance.branch} failed; local branch ${branch} cleanup and descendant restack/update were skipped.`,
					commandDisplay: getCommandDisplay,
					result: got,
					suggestedAction: `Run ${getCommandDisplay} manually, restack/update ${maintenance.branch}, and delete local branch ${branch} when safe.`,
				});
				continue;
			}
		}

		if (maintenance.kind === "skip-descendant") {
			warnings.push(skippedDescendantMaintenanceWarning(plan, branch));
			continue;
		}

		setStatus(ctx, `deleting local Graphite branch ${branch}...`);
		const deleteArgs = ["delete", branch, "-f", "-q"];
		const deleted =
			maintenance.kind === "none" && options.commandStream && options.unstreamedPi
				? await deleteFinalLocalGraphiteBranch(options.unstreamedPi, options.commandStream, repoRoot, branch)
				: await exec(pi, "gt", deleteArgs, repoRoot, GT_MUTATION_TIMEOUT_MS);
		if (deleted.code !== 0) {
			if (maintenance.kind === "required-next-landing") {
				fail(`PR #${pr.number} merged, but deleting the local Graphite branch ${branch} failed.`, {
					commandDisplay: formatCommand("gt", deleteArgs),
					result: deleted,
					failedBranch: branch,
					failedPr: pr.number,
					suggestedAction: `Delete or repair local Graphite branch ${branch} manually, then inspect the stack before rerunning /dev:land-stack.`,
				});
			}

			warnings.push({
				message:
					maintenance.kind === "optional-descendant"
						? `All target PRs were merged, but deleting the local Graphite branch ${branch} failed; descendant restack/update was skipped.`
						: `All target PRs were merged, but deleting the local Graphite branch ${branch} failed.`,
				commandDisplay: formatCommand("gt", deleteArgs),
				result: deleted,
				suggestedAction: `Delete or repair local Graphite branch ${branch} manually, then inspect the stack.`,
			});
			continue;
		}

		if (maintenance.kind === "required-next-landing" || maintenance.kind === "optional-descendant") {
			setStatus(ctx, `restacking ${maintenance.branch}...`);
			const restackArgs = ["restack", "--branch", maintenance.branch, "--upstack", "--no-interactive"];
			const restacked = await exec(pi, "gt", restackArgs, repoRoot, GT_MUTATION_TIMEOUT_MS);
			if (restacked.code !== 0) {
				if (maintenance.kind === "required-next-landing") {
					fail(formatRestackFailureMessage(pr.number, maintenance.branch, true), {
						commandDisplay: formatCommand("gt", restackArgs),
						result: restacked,
						failedBranch: maintenance.branch,
						suggestedAction: `Resolve restack failures for ${maintenance.branch}, run gt submit/update, then rerun /dev:land-stack if appropriate.`,
					});
				}

				warnings.push({
					message: formatRestackFailureMessage(pr.number, maintenance.branch, false),
					commandDisplay: formatCommand("gt", restackArgs),
					result: restacked,
					suggestedAction: `Resolve restack failures for ${maintenance.branch}, then update that PR manually.`,
				});
				continue;
			}

			setStatus(ctx, `submitting ${maintenance.branch}...`);
			const submitArgs = ["submit", "--branch", maintenance.branch, "--no-stack", "--update-only", "--no-edit", "--no-ai", "--no-interactive"];
			const submitted = await exec(pi, "gt", submitArgs, repoRoot, GT_MUTATION_TIMEOUT_MS);
			if (submitted.code !== 0) {
				if (maintenance.kind === "required-next-landing") {
					fail(formatSubmitFailureMessage(pr.number, maintenance.branch, true), {
						commandDisplay: formatCommand("gt", submitArgs),
						result: submitted,
						failedBranch: maintenance.branch,
						suggestedAction: `Update PR for ${maintenance.branch} manually, verify it targets ${stack.trunk}, then rerun /dev:land-stack if appropriate.`,
					});
				}

				warnings.push({
					message: formatSubmitFailureMessage(pr.number, maintenance.branch, false),
					commandDisplay: formatCommand("gt", submitArgs),
					result: submitted,
					suggestedAction: `Update PR for ${maintenance.branch} manually and verify it targets ${stack.trunk}.`,
				});
			}
		}
	}
}

async function runOptionalDescendantGraphiteCommand(
	pi: ExtensionAPI,
	options: { commandStream?: LandStackCommandStream; unstreamedPi?: ExtensionAPI },
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
	};
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
