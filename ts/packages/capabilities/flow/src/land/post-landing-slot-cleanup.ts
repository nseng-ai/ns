import { formatCommand } from "@nseng-ai/foundation/command";
import {
	deleteLocalBranchOperation,
	formatGraphiteOperation,
} from "./stack/graphite-command-channel.ts";
import {
	completed,
	landStackFailure,
	success,
	type LandStackOutcome,
	type LandStackResult,
} from "./stack/errors.ts";
import { notifyPrintAware, presentFailureAndReturn, setStatus } from "./land-presentation.ts";
import { boundaryFailureDiagnostics, type LandContext, type ManagedSlotWorktree } from "./api.ts";
import type { LandingShape, PrintAwareLandStackCommandContext, ParsedArgs } from "./stack/types.ts";
import {
	confirmLandStackAction,
	type PreMergeConfirmation,
} from "./stack/pre-merge-confirmation.ts";
import { isManagedSlotPath, slotNameFromPath } from "./stack/worktrees.ts";

export interface PostLandingSlotCleanupPreview {
	readonly branch: string;
	readonly repoRoot: string;
	readonly slotName: string;
}

export type PostLandingSlotCleanupDecision =
	| { readonly type: "not-needed" }
	| { readonly type: "approved" }
	| { readonly type: "declined" };

interface PostLandingSlotCleanupTarget extends PostLandingSlotCleanupPreview {
	readonly cleanupDetails: string;
	readonly localBranchDisposition: LocalBranchCleanupDisposition;
	readonly suggestedAction: string;
}

type LocalBranchCleanupDisposition =
	| {
			readonly type: "delete";
			readonly detailLine: string;
			readonly intro: string;
			readonly successMessage: string;
	  }
	| {
			readonly type: "keep-trunk";
			readonly detailLine: string;
			readonly intro: string;
			readonly successMessage: string;
	  };

interface PostLandingCleanupContext {
	readonly branch: string;
	readonly localBranchDisposition: LocalBranchCleanupDisposition;
	readonly slotName: string;
}

interface ResolvePostLandingSlotCleanupDecisionOptions {
	ctx: PrintAwareLandStackCommandContext;
	args: ParsedArgs;
	shape: LandingShape;
	confirmation?: PreMergeConfirmation;
}

interface RunPostLandingSlotCleanupOptions {
	landContext: LandContext;
	ctx: PrintAwareLandStackCommandContext;
	args: ParsedArgs;
	shape: LandingShape;
	cleanupDecision: PostLandingSlotCleanupDecision;
}

export function planPostLandingSlotCleanup(options: {
	args: ParsedArgs;
	shape: LandingShape;
}): PostLandingSlotCleanupPreview | undefined {
	const target = postLandingCleanupTarget(options.args, options.shape);
	if (target === undefined) return undefined;
	return { branch: target.branch, repoRoot: target.repoRoot, slotName: target.slotName };
}

export async function resolvePostLandingSlotCleanupDecision({
	ctx,
	args,
	shape,
	confirmation,
}: ResolvePostLandingSlotCleanupDecisionOptions): Promise<
	LandStackResult<PostLandingSlotCleanupDecision>
> {
	const target = postLandingCleanupTarget(args, shape);
	if (target === undefined) return success({ type: "not-needed" });
	if (
		confirmation === "already-approved" ||
		args.shouldSkipConfirmation ||
		args.shouldForceCleanup
	) {
		return success({ type: "approved" });
	}

	const confirmationOutcome = await confirmLandStackAction({
		ctx,
		shouldPrompt: true,
		title: "Free current slot and delete local branch?",
		details: target.cleanupDetails,
		nonInteractiveMessage: [
			"Refusing to land before merge: post-landing slot cleanup requires confirmation in non-interactive mode. No PRs were landed.",
			target.cleanupDetails,
			"Re-run with --yes or --force to approve cleanup, or --preserve to land while keeping the current managed slot and local branch.",
		].join("\n\n"),
		nonInteractiveFailureOptions: {
			suggestedAction:
				"Pass --yes or --force to approve cleanup, or --preserve to keep the current slot and local branch.",
		},
		cancellationMessage: "Skipped post-landing cleanup by upfront choice.",
		cancellationFailureOptions: {
			level: "warning",
			outcome: "refusal",
			suggestedAction: target.suggestedAction,
		},
		defaultAnswer: "yes",
	});
	if (confirmationOutcome.type === "success") return success({ type: "approved" });
	if (confirmationOutcome.failure.refusalReason === "declined")
		return success({ type: "declined" });

	return presentFailureAndReturn(ctx, confirmationOutcome.failure);
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
		return presentFailureAndReturn(ctx, landFailure);
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
			return presentFailureAndReturn(ctx, landFailure);
		}

		if (target.localBranchDisposition.type === "delete") {
			const branch = target.branch;
			setStatus(ctx, `deleting ${branch}...`);
			const deleteOperation = deleteLocalBranchOperation({
				branch,
				checkedOutConflictHandling: "fail",
			});
			const deletion = await landContext.graphite.deleteLocalBranch({
				repoRoot: target.repoRoot,
				branch,
				checkedOutConflictHandling: "fail",
			});
			if (deletion.type !== "deleted") {
				const landFailure = landStackFailure(
					`PRs were landed and ${target.slotName} was freed, but deleting local branch ${branch} failed.`,
					{
						commandDisplay:
							deletion.type === "failed"
								? deletion.commandDisplay
								: formatGraphiteOperation(deleteOperation),
						...(deletion.type === "failed" ? { result: deletion.result } : {}),
						suggestedAction: `Delete local branch ${branch} manually when safe.`,
					},
				);
				return presentFailureAndReturn(ctx, landFailure);
			}
		}
	} finally {
		setStatus(ctx, undefined);
	}

	notifyPrintAware({
		ctx,
		message: target.localBranchDisposition.successMessage,
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
	const localBranchDisposition = localBranchCleanupDisposition({
		branch,
		isTrunk: branch === shape.stack.trunk,
		slotName,
	});
	const cleanupContext: PostLandingCleanupContext = { branch, localBranchDisposition, slotName };
	return {
		branch,
		cleanupDetails: formatPostLandingCleanupDetails({
			...cleanupContext,
			repoRoot: shape.repoRoot,
		}),
		localBranchDisposition,
		repoRoot: shape.repoRoot,
		slotName,
		suggestedAction: postLandingCleanupSuggestedAction(cleanupContext),
	};
}

function localBranchCleanupDisposition(options: {
	readonly branch: string;
	readonly isTrunk: boolean;
	readonly slotName: string;
}): LocalBranchCleanupDisposition {
	if (options.isTrunk) {
		return {
			type: "keep-trunk",
			detailLine: `Local branch: ${options.branch} (trunk; will not be deleted)`,
			intro:
				"Post-landing cleanup will detach the current managed slot to trunk. The local trunk branch is kept.",
			successMessage: `Post-landing cleanup complete: freed ${options.slotName}; local trunk branch ${options.branch} was kept.`,
		};
	}
	return {
		type: "delete",
		detailLine: `Local branch: ${options.branch}`,
		intro:
			"Post-landing cleanup will detach the current managed slot to trunk, then delete the landed local Graphite branch.",
		successMessage: `Post-landing cleanup complete: freed ${options.slotName} and deleted local branch ${options.branch}.`,
	};
}

function formatPostLandingCleanupDetails(
	options: PostLandingCleanupContext & { readonly repoRoot: string },
): string {
	return [
		options.localBranchDisposition.intro,
		"",
		`Slot: ${options.slotName}`,
		`Worktree: ${options.repoRoot}`,
		options.localBranchDisposition.detailLine,
		"",
		"Commands:",
		...postLandingCleanupCommands(options).map((command) => `$ ${command}`),
	].join("\n");
}

function postLandingCleanupCommands(options: PostLandingCleanupContext): string[] {
	const commands = [formatCommand("ns", ["slot", "free", "--wt", options.slotName])];
	if (options.localBranchDisposition.type === "delete") {
		commands.push(formatGraphiteOperation(deleteLocalBranchOperation({ branch: options.branch })));
	}
	return commands;
}

function postLandingCleanupSuggestedAction(options: PostLandingCleanupContext): string {
	const commands = postLandingCleanupCommands(options);
	return `Run ${commands.join(", then ")} when safe.`;
}
