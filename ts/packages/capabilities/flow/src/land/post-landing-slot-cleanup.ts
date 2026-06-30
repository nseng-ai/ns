import { formatCommand } from "@sdl/exec";
import { GT_MUTATION_TIMEOUT_MS, SLOT_TIMEOUT_MS } from "../land-stack/constants.ts";
import { exec, execGraphite } from "../land-stack/command-exec.ts";
import {
	completed,
	failure,
	landStackFailure,
	type LandStackOutcome,
} from "../land-stack/errors.ts";
import {
	formatFailureNotification,
	landFailureKind,
	notifyPrintAware,
	presentBrief,
	setStatus,
} from "../land-stack/presentation.ts";
import type {
	LandStackExtensionAPI,
	LandingShape,
	PrintAwareLandStackCommandContext,
	ParsedArgs,
} from "../land-stack/types.ts";
import { isManagedSlotPath, slotNameFromPath } from "../land-stack/worktrees.ts";

interface RunPostLandingSlotCleanupOptions {
	pi: LandStackExtensionAPI;
	ctx: PrintAwareLandStackCommandContext;
	args: ParsedArgs;
	shape: LandingShape;
}

export async function runPostLandingSlotCleanup({
	pi,
	ctx,
	args,
	shape,
}: RunPostLandingSlotCleanupOptions): Promise<LandStackOutcome> {
	if (!args.shouldFreeSlot || args.isDryRun) return completed();

	const slotName = isManagedSlotPath(shape.repoRoot) ? slotNameFromPath(shape.repoRoot) : undefined;
	if (slotName === undefined) {
		const message = `Post-landing --free requested, but current worktree ${shape.repoRoot} is not a managed slot; kept local branch ${shape.stack.actualCurrentBranch}.`;
		notifyPrintAware({ ctx, message, level: "info", kind: "refusal" });
		return completed();
	}

	const cleanupDetails = formatPostLandingCleanupDetails({
		branch: shape.stack.actualCurrentBranch,
		repoRoot: shape.repoRoot,
		slotName,
	});
	if (!args.shouldForceCleanup && !args.shouldSkipConfirmation) {
		if (!ctx.hasUI) {
			const landFailure = landStackFailure(
				[
					"PRs were landed, but post-landing slot cleanup requires confirmation in non-interactive mode.",
					cleanupDetails,
					"Run the commands manually, or use --free --force for post-landing cleanup next time.",
				].join("\n\n"),
				{
					outcome: "refusal",
					suggestedAction: postLandingCleanupSuggestedAction(
						slotName,
						shape.stack.actualCurrentBranch,
					),
				},
			);
			presentBrief({
				ctx,
				fullMessage: landFailure.message,
				level: landFailure.level,
				uiMessage: formatFailureNotification(landFailure),
				kind: landFailureKind(landFailure),
			});
			return failure(landFailure);
		}

		const confirmed = await ctx.ui.confirm(
			"Free current slot and delete local branch?",
			cleanupDetails,
		);
		if (!confirmed) {
			const landFailure = landStackFailure(
				`Cancelled post-landing cleanup; PRs were landed but ${slotName} and local branch ${shape.stack.actualCurrentBranch} were kept.`,
				{
					level: "warning",
					outcome: "refusal",
					suggestedAction: postLandingCleanupSuggestedAction(
						slotName,
						shape.stack.actualCurrentBranch,
					),
				},
			);
			presentBrief({
				ctx,
				fullMessage: landFailure.message,
				level: landFailure.level,
				uiMessage: formatFailureNotification(landFailure),
				kind: landFailureKind(landFailure),
			});
			return failure(landFailure);
		}
	}

	try {
		setStatus(ctx, `freeing ${slotName}...`);
		const freeArgs = ["slot", "free", "--wt", slotName];
		const freeResult = await exec({
			pi,
			command: "sdl",
			args: freeArgs,
			cwd: shape.repoRoot,
			timeoutMs: SLOT_TIMEOUT_MS,
		});
		if (freeResult.code !== 0) {
			const landFailure = landStackFailure(`PRs were landed, but freeing ${slotName} failed.`, {
				commandDisplay: formatCommand("sdl", freeArgs),
				result: freeResult,
				suggestedAction: postLandingCleanupSuggestedAction(
					slotName,
					shape.stack.actualCurrentBranch,
				),
			});
			presentBrief({
				ctx,
				fullMessage: landFailure.message,
				level: landFailure.level,
				uiMessage: formatFailureNotification(landFailure),
				kind: landFailureKind(landFailure),
			});
			return failure(landFailure);
		}

		setStatus(ctx, `deleting ${shape.stack.actualCurrentBranch}...`);
		const deleteArgs = ["delete", shape.stack.actualCurrentBranch, "-f", "-q"];
		const deleteResult = await execGraphite(pi, {
			args: deleteArgs,
			cwd: shape.repoRoot,
			timeoutMs: GT_MUTATION_TIMEOUT_MS,
		});
		if (deleteResult.code !== 0) {
			const landFailure = landStackFailure(
				`PRs were landed and ${slotName} was freed, but deleting local branch ${shape.stack.actualCurrentBranch} failed.`,
				{
					commandDisplay: formatCommand("gt", deleteArgs),
					result: deleteResult,
					suggestedAction: `Delete local branch ${shape.stack.actualCurrentBranch} manually when safe.`,
				},
			);
			presentBrief({
				ctx,
				fullMessage: landFailure.message,
				level: landFailure.level,
				uiMessage: formatFailureNotification(landFailure),
				kind: landFailureKind(landFailure),
			});
			return failure(landFailure);
		}
	} finally {
		setStatus(ctx, undefined);
	}

	notifyPrintAware({
		ctx,
		message: `Post-landing cleanup complete: freed ${slotName} and deleted local branch ${shape.stack.actualCurrentBranch}.`,
		level: "success",
		kind: "success",
	});
	return completed();
}

function formatPostLandingCleanupDetails(options: {
	branch: string;
	repoRoot: string;
	slotName: string;
}): string {
	const freeCommand = formatCommand("sdl", ["slot", "free", "--wt", options.slotName]);
	const deleteCommand = formatCommand("gt", ["delete", options.branch, "-f", "-q"]);
	return [
		"Post-landing --free cleanup will detach the current managed slot to trunk, then delete the landed local Graphite branch.",
		"",
		`Slot: ${options.slotName}`,
		`Worktree: ${options.repoRoot}`,
		`Local branch: ${options.branch}`,
		"",
		"Commands:",
		`$ ${freeCommand}`,
		`$ ${deleteCommand}`,
	].join("\n");
}

function postLandingCleanupSuggestedAction(slotName: string, branch: string): string {
	return `Run ${formatCommand("sdl", ["slot", "free", "--wt", slotName])}, then ${formatCommand("gt", ["delete", branch, "-f", "-q"])} when safe.`;
}
