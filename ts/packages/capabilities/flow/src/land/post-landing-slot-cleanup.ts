import { formatCommand } from "@ns/core/command";
import {
	deleteLocalBranchOperation,
	formatGraphiteOperation,
} from "./stack/graphite-command-channel.ts";
import {
	completed,
	failure,
	landStackFailure,
	success,
	type LandStackOutcome,
	type LandStackResult,
} from "./stack/errors.ts";
import { notifyPrintAware, presentFailureOutcome, setStatus } from "./stack/presentation.ts";
import { boundaryFailureDiagnostics, type LandContext, type ManagedSlotWorktree } from "./api.ts";
import type { LandingShape, PrintAwareLandStackCommandContext, ParsedArgs } from "./stack/types.ts";
import { isManagedSlotPath, slotNameFromPath } from "./stack/worktrees.ts";

export type PostLandingSlotCleanupDecision =
	| { readonly type: "not-needed" }
	| { readonly type: "approved" }
	| { readonly type: "declined" };

interface PostLandingSlotCleanupTarget {
	readonly branch: string;
	readonly cleanupDetails: string;
	readonly repoRoot: string;
	readonly slotName: string;
	readonly suggestedAction: string;
}

interface ResolvePostLandingSlotCleanupDecisionOptions {
	ctx: PrintAwareLandStackCommandContext;
	args: ParsedArgs;
	shape: LandingShape;
}

interface RunPostLandingSlotCleanupOptions {
	landContext: LandContext;
	ctx: PrintAwareLandStackCommandContext;
	args: ParsedArgs;
	shape: LandingShape;
	cleanupDecision: PostLandingSlotCleanupDecision;
}

export async function resolvePostLandingSlotCleanupDecision({
	ctx,
	args,
	shape,
}: ResolvePostLandingSlotCleanupDecisionOptions): Promise<
	LandStackResult<PostLandingSlotCleanupDecision>
> {
	const target = postLandingCleanupTarget(args, shape);
	if (target === undefined) return success({ type: "not-needed" });
	if (args.shouldSkipConfirmation || args.shouldForceCleanup) return success({ type: "approved" });

	if (!ctx.hasUI) {
		const landFailure = landStackFailure(
			[
				"Refusing to land before merge: post-landing slot cleanup requires confirmation in non-interactive mode. No PRs were landed.",
				target.cleanupDetails,
				"Re-run with --yes or --force to approve cleanup, or --preserve to land while keeping the current managed slot and local branch.",
			].join("\n\n"),
			{
				outcome: "refusal",
				suggestedAction:
					"Pass --yes or --force to approve cleanup, or --preserve to keep the current slot and local branch.",
			},
		);
		presentFailureOutcome(ctx, landFailure);
		return failure(landFailure);
	}

	const confirmed = await ctx.ui.confirm(
		"Free current slot and delete local branch?",
		target.cleanupDetails,
	);
	return success({ type: confirmed ? "approved" : "declined" });
}

export async function runPostLandingSlotCleanup({
	landContext,
	ctx,
	args,
	shape,
	cleanupDecision,
}: RunPostLandingSlotCleanupOptions): Promise<LandStackOutcome> {
	if (cleanupDecision.type === "not-needed") return completed();

	const target = postLandingCleanupTarget(args, shape);
	if (target === undefined) return completed();

	if (cleanupDecision.type === "declined") {
		const landFailure = landStackFailure(
			`Skipped post-landing cleanup by upfront choice; PRs were landed but ${target.slotName} and local branch ${target.branch} were kept.`,
			{
				level: "warning",
				outcome: "refusal",
				suggestedAction: target.suggestedAction,
			},
		);
		return presentFailureOutcome(ctx, landFailure);
	}

	try {
		setStatus(ctx, `freeing ${target.slotName}...`);
		const managedSlot: ManagedSlotWorktree = {
			type: "managed-slot",
			branch: target.branch,
			path: target.repoRoot,
			slotName: target.slotName,
		};
		const freeResult = await landContext.worktrees.freeSlots({
			repoRoot: target.repoRoot,
			slots: [managedSlot],
		});
		if (freeResult.type === "failure") {
			const diagnostics = boundaryFailureDiagnostics(freeResult.failure);
			const landFailure = landStackFailure(
				`PRs were landed, but freeing ${target.slotName} failed.`,
				{
					commandDisplay:
						diagnostics.displayCommand ??
						formatCommand("ns", ["slot", "free", "--wt", target.slotName]),
					...(diagnostics.execResult === undefined ? {} : { result: diagnostics.execResult }),
					suggestedAction: target.suggestedAction,
				},
			);
			return presentFailureOutcome(ctx, landFailure);
		}

		setStatus(ctx, `deleting ${target.branch}...`);
		const deleteOperation = deleteLocalBranchOperation({
			branch: target.branch,
			checkedOutConflictHandling: "fail",
		});
		const deletion = await landContext.graphite.deleteLocalBranch({
			repoRoot: target.repoRoot,
			branch: target.branch,
			checkedOutConflictHandling: "fail",
		});
		if (deletion.type !== "deleted") {
			const landFailure = landStackFailure(
				`PRs were landed and ${target.slotName} was freed, but deleting local branch ${target.branch} failed.`,
				{
					commandDisplay:
						deletion.type === "failed"
							? deletion.commandDisplay
							: formatGraphiteOperation(deleteOperation),
					...(deletion.type === "failed" ? { result: deletion.result } : {}),
					suggestedAction: `Delete local branch ${target.branch} manually when safe.`,
				},
			);
			return presentFailureOutcome(ctx, landFailure);
		}
	} finally {
		setStatus(ctx, undefined);
	}

	notifyPrintAware({
		ctx,
		message: `Post-landing cleanup complete: freed ${target.slotName} and deleted local branch ${target.branch}.`,
		level: "success",
		kind: "success",
	});
	return completed();
}

function postLandingCleanupTarget(
	args: ParsedArgs,
	shape: LandingShape,
): PostLandingSlotCleanupTarget | undefined {
	if (args.shouldPreserveSlot || args.isDryRun) return undefined;

	const slotName = isManagedSlotPath(shape.repoRoot) ? slotNameFromPath(shape.repoRoot) : undefined;
	if (slotName === undefined) return undefined;

	const branch = shape.stack.actualCurrentBranch;
	return {
		branch,
		cleanupDetails: formatPostLandingCleanupDetails({ branch, repoRoot: shape.repoRoot, slotName }),
		repoRoot: shape.repoRoot,
		slotName,
		suggestedAction: postLandingCleanupSuggestedAction(slotName, branch),
	};
}

function formatPostLandingCleanupDetails(options: {
	branch: string;
	repoRoot: string;
	slotName: string;
}): string {
	const freeCommand = formatCommand("ns", ["slot", "free", "--wt", options.slotName]);
	const deleteCommand = formatGraphiteOperation(
		deleteLocalBranchOperation({ branch: options.branch }),
	);
	return [
		"Post-landing cleanup will detach the current managed slot to trunk, then delete the landed local Graphite branch.",
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
	return `Run ${formatCommand("ns", ["slot", "free", "--wt", slotName])}, then ${formatGraphiteOperation(deleteLocalBranchOperation({ branch }))} when safe.`;
}
