import { formatCommand } from "@sdl/core/command";
import {
	deleteLocalBranchOperation,
	formatGraphiteOperation,
} from "./stack/graphite-command-channel.ts";
import { completed, landStackFailure, type LandStackOutcome } from "./stack/errors.ts";
import { notifyPrintAware, presentFailureOutcome, setStatus } from "./stack/presentation.ts";
import { boundaryFailureDiagnostics, type LandContext, type ManagedSlotWorktree } from "./api.ts";
import type { LandingShape, PrintAwareLandStackCommandContext, ParsedArgs } from "./stack/types.ts";
import { confirmLandStackAction } from "./stack/pre-merge-confirmation.ts";
import { isManagedSlotPath, slotNameFromPath } from "./stack/worktrees.ts";

interface RunPostLandingSlotCleanupOptions {
	landContext: LandContext;
	ctx: PrintAwareLandStackCommandContext;
	args: ParsedArgs;
	shape: LandingShape;
}

export async function runPostLandingSlotCleanup({
	landContext,
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
		setStatus(ctx, `freeing ${slotName}...`);
		const managedSlot: ManagedSlotWorktree = {
			type: "managed-slot",
			branch: shape.stack.actualCurrentBranch,
			path: shape.repoRoot,
			slotName,
		};
		const freeResult = await landContext.worktrees.freeSlots({
			repoRoot: shape.repoRoot,
			slots: [managedSlot],
		});
		if (freeResult.type === "failure") {
			const diagnostics = boundaryFailureDiagnostics(freeResult.failure);
			const landFailure = landStackFailure(`PRs were landed, but freeing ${slotName} failed.`, {
				commandDisplay:
					diagnostics.displayCommand ?? formatCommand("sdl", ["slot", "free", "--wt", slotName]),
				...(diagnostics.execResult === undefined ? {} : { result: diagnostics.execResult }),
				suggestedAction,
			});
			return presentFailureOutcome(ctx, landFailure);
		}

		setStatus(ctx, `deleting ${shape.stack.actualCurrentBranch}...`);
		const deleteOperation = deleteLocalBranchOperation({
			branch: shape.stack.actualCurrentBranch,
			checkedOutConflictHandling: "fail",
		});
		const deletion = await landContext.graphite.deleteLocalBranch({
			repoRoot: shape.repoRoot,
			branch: shape.stack.actualCurrentBranch,
			checkedOutConflictHandling: "fail",
		});
		if (deletion.type !== "deleted") {
			const landFailure = landStackFailure(
				`PRs were landed and ${slotName} was freed, but deleting local branch ${shape.stack.actualCurrentBranch} failed.`,
				{
					commandDisplay:
						deletion.type === "failed"
							? deletion.commandDisplay
							: formatGraphiteOperation(deleteOperation),
					...(deletion.type === "failed" ? { result: deletion.result } : {}),
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
	const deleteCommand = formatGraphiteOperation(
		deleteLocalBranchOperation({ branch: options.branch }),
	);
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
	return `Run ${formatCommand("sdl", ["slot", "free", "--wt", slotName])}, then ${formatGraphiteOperation(deleteLocalBranchOperation({ branch }))} when safe.`;
}
