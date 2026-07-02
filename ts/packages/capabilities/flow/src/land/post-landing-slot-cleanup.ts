import { formatCommand } from "@sdl/core/command";
import { GT_MUTATION_TIMEOUT_MS, SLOT_TIMEOUT_MS } from "./stack/constants.ts";
import { exec } from "./stack/command-exec.ts";
import { formatGraphiteOperation } from "./stack/graphite-command-channel.ts";
import { completed, landStackFailure, type LandStackOutcome } from "./stack/errors.ts";
import type { LandRuntime } from "./stack/land-runtime.ts";
import { notifyPrintAware, presentFailureOutcome, setStatus } from "./stack/presentation.ts";
import type { LandingShape, PrintAwareLandStackCommandContext, ParsedArgs } from "./stack/types.ts";
import { confirmLandStackAction } from "./stack/pre-merge-confirmation.ts";
import { isManagedSlotPath, slotNameFromPath } from "./stack/worktrees.ts";

interface RunPostLandingSlotCleanupOptions {
	runtime: LandRuntime;
	ctx: PrintAwareLandStackCommandContext;
	args: ParsedArgs;
	shape: LandingShape;
}

export async function runPostLandingSlotCleanup({
	runtime,
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
	const suggestedAction = postLandingCleanupSuggestedAction(
		slotName,
		shape.stack.actualCurrentBranch,
	);
	const confirmationOutcome = await confirmLandStackAction({
		ctx,
		shouldPrompt: !args.shouldForceCleanup && !args.shouldSkipConfirmation,
		title: "Free current slot and delete local branch?",
		details: cleanupDetails,
		nonInteractiveMessage: [
			"PRs were landed, but post-landing slot cleanup requires confirmation in non-interactive mode.",
			cleanupDetails,
			"Run the commands manually, or use --free --force for post-landing cleanup next time.",
		].join("\n\n"),
		nonInteractiveFailureOptions: { suggestedAction },
		cancellationMessage: `Cancelled post-landing cleanup; PRs were landed but ${slotName} and local branch ${shape.stack.actualCurrentBranch} were kept.`,
		cancellationFailureOptions: {
			level: "warning",
			outcome: "refusal",
			suggestedAction,
		},
		onFailure: (landFailure) => presentFailureOutcome(ctx, landFailure),
	});
	if (confirmationOutcome.type === "failure") return confirmationOutcome;

	try {
		const pi = runtime.commands;
		const graphite = runtime.graphite;
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
				suggestedAction,
			});
			return presentFailureOutcome(ctx, landFailure);
		}

		setStatus(ctx, `deleting ${shape.stack.actualCurrentBranch}...`);
		const deleteOperation = {
			kind: "delete-local-branch",
			branch: shape.stack.actualCurrentBranch,
		} as const;
		const deletion = await graphite.run({
			operation: deleteOperation,
			cwd: shape.repoRoot,
			timeoutMs: GT_MUTATION_TIMEOUT_MS,
		});
		if (deletion.kind !== "deleted") {
			const landFailure = landStackFailure(
				`PRs were landed and ${slotName} was freed, but deleting local branch ${shape.stack.actualCurrentBranch} failed.`,
				{
					commandDisplay: formatGraphiteOperation(deleteOperation),
					...(deletion.kind === "failed" ? { result: deletion.result } : {}),
					suggestedAction: `Delete local branch ${shape.stack.actualCurrentBranch} manually when safe.`,
				},
			);
			return presentFailureOutcome(ctx, landFailure);
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
	const deleteCommand = formatGraphiteOperation({
		kind: "delete-local-branch",
		branch: options.branch,
	});
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
	return `Run ${formatCommand("sdl", ["slot", "free", "--wt", slotName])}, then ${formatGraphiteOperation({ kind: "delete-local-branch", branch })} when safe.`;
}
