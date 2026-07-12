import { formatCommand } from "@nseng-ai/foundation/command";
import { optionalEntry } from "@nseng-ai/foundation/primitives";

import { deleteLocalBranchOperation, formatGraphiteOperation } from "../graphite-operations.ts";
import { landingExecutionFailure } from "../results.ts";
import {
	boundaryFailureDiagnostics,
	type LandContext,
	type LandingFailure,
	type LandingShape,
	type ManagedSlotWorktree,
} from "../types.ts";
import { isManagedSlotPath, slotNameFromPath } from "../worktree-paths.ts";
import type { LandConfirmationGateway, LandExecutionProgress } from "./host-seams.ts";

export interface PostLandingSlotCleanupPreview {
	readonly branch: string;
	readonly repoRoot: string;
	readonly slotName: string;
}

export type PostLandingSlotCleanupDecision =
	| { readonly type: "not-needed" }
	| { readonly type: "approved" }
	| { readonly type: "declined" };

export interface PostLandingCleanupOptions {
	readonly isDryRun: boolean;
	readonly shouldPreserveSlot: boolean;
	readonly shouldSkipConfirmation: boolean;
	readonly shouldForceCleanup: boolean;
}

export type PostLandingCleanupResult =
	| { readonly type: "completed"; readonly successMessage?: string }
	| { readonly type: "failure"; readonly failure: LandingFailure };

interface PostLandingSlotCleanupTarget extends PostLandingSlotCleanupPreview {
	readonly localBranchDisposition: "delete" | "keep-trunk";
	readonly successMessage: string;
	readonly suggestedAction: string;
}

export function planManagedSlotPostLandingCleanup(options: {
	readonly cleanup: PostLandingCleanupOptions;
	readonly shape: LandingShape;
}): PostLandingSlotCleanupPreview | undefined {
	const target = postLandingCleanupTarget(options.cleanup, options.shape);
	if (target === undefined) return undefined;
	return { branch: target.branch, repoRoot: target.repoRoot, slotName: target.slotName };
}

export async function resolveManagedSlotPostLandingCleanupDecision(options: {
	readonly confirmation: LandConfirmationGateway;
	readonly confirmationAlreadyApproved: boolean;
	readonly cleanup: PostLandingCleanupOptions;
	readonly shape: LandingShape;
}): Promise<
	| { readonly type: "success"; readonly value: PostLandingSlotCleanupDecision }
	| { readonly type: "failure"; readonly failure: LandingFailure }
> {
	const target = postLandingCleanupTarget(options.cleanup, options.shape);
	if (target === undefined) return { type: "success", value: { type: "not-needed" } };
	if (
		options.confirmationAlreadyApproved ||
		options.cleanup.shouldSkipConfirmation ||
		options.cleanup.shouldForceCleanup
	) {
		return { type: "success", value: { type: "approved" } };
	}

	const decision = await options.confirmation.confirm({
		kind: "post-landing-cleanup",
		branch: target.branch,
		repoRoot: target.repoRoot,
		slotName: target.slotName,
		localBranchDisposition: target.localBranchDisposition,
	});
	if (decision.type === "approved") return { type: "success", value: { type: "approved" } };
	if (decision.type === "declined") return { type: "success", value: { type: "declined" } };
	return { type: "failure", failure: decision.failure };
}

export async function runManagedSlotPostLandingCleanup(options: {
	readonly landContext: LandContext;
	readonly progress: LandExecutionProgress;
	readonly cleanup: PostLandingCleanupOptions;
	readonly shape: LandingShape;
	readonly cleanupDecision: PostLandingSlotCleanupDecision;
}): Promise<PostLandingCleanupResult> {
	if (options.cleanupDecision.type === "not-needed") return { type: "completed" };

	const target = postLandingCleanupTarget(options.cleanup, options.shape);
	if (target === undefined) return { type: "completed" };

	if (options.cleanupDecision.type === "declined") {
		return {
			type: "failure",
			failure: landingExecutionFailure(
				`Skipped post-landing cleanup by upfront choice; PRs were landed but ${target.slotName} and local branch ${target.branch} were kept.`,
				{
					level: "warning",
					outcome: "refusal",
					suggestedAction: target.suggestedAction,
				},
			),
		};
	}

	try {
		options.progress.setStatus(`freeing ${target.slotName}...`);
		const managedSlot: ManagedSlotWorktree = {
			type: "managed-slot",
			branch: target.branch,
			path: target.repoRoot,
			slotName: target.slotName,
		};
		const freeResult = await options.landContext.worktrees.freeSlots({
			repoRoot: target.repoRoot,
			slots: [managedSlot],
		});
		if (freeResult.type === "failure") {
			const diagnostics = boundaryFailureDiagnostics(freeResult.failure);
			return {
				type: "failure",
				failure: landingExecutionFailure(
					`PRs were landed, but freeing ${target.slotName} failed.`,
					{
						displayCommand:
							diagnostics.displayCommand ??
							formatCommand("ns", ["slot", "free", "--wt", target.slotName]),
						...optionalEntry("execResult", diagnostics.execResult),
						suggestedAction: target.suggestedAction,
					},
				),
			};
		}

		if (target.localBranchDisposition === "delete") {
			const branch = target.branch;
			options.progress.setStatus(`deleting ${branch}...`);
			const deleteOperation = deleteLocalBranchOperation({
				branch,
				checkedOutConflictHandling: "fail",
			});
			const deletion = await options.landContext.graphite.deleteLocalBranch({
				repoRoot: target.repoRoot,
				branch,
				checkedOutConflictHandling: "fail",
			});
			if (deletion.type !== "deleted") {
				return {
					type: "failure",
					failure: landingExecutionFailure(
						`PRs were landed and ${target.slotName} was freed, but deleting local branch ${branch} failed.`,
						{
							displayCommand:
								deletion.type === "failed"
									? deletion.commandDisplay
									: formatGraphiteOperation(deleteOperation),
							...(deletion.type === "failed" ? { execResult: deletion.result } : {}),
							suggestedAction: `Delete local branch ${branch} manually when safe.`,
						},
					),
				};
			}
		}
	} finally {
		options.progress.setStatus(undefined);
	}

	return { type: "completed", successMessage: target.successMessage };
}

function postLandingCleanupTarget(
	cleanup: PostLandingCleanupOptions,
	shape: LandingShape,
): PostLandingSlotCleanupTarget | undefined {
	if (cleanup.shouldPreserveSlot || cleanup.isDryRun) return undefined;

	const slotName = isManagedSlotPath(shape.repoRoot) ? slotNameFromPath(shape.repoRoot) : undefined;
	if (slotName === undefined) return undefined;

	const branch = shape.stack.actualCurrentBranch;
	const localBranchDisposition = branch === shape.stack.trunk ? "keep-trunk" : "delete";
	return {
		branch,
		localBranchDisposition,
		repoRoot: shape.repoRoot,
		slotName,
		successMessage:
			localBranchDisposition === "keep-trunk"
				? `Post-landing cleanup complete: freed ${slotName}; local trunk branch ${branch} was kept.`
				: `Post-landing cleanup complete: freed ${slotName} and deleted local branch ${branch}.`,
		suggestedAction: postLandingCleanupSuggestedAction({
			branch,
			localBranchDisposition,
			slotName,
		}),
	};
}

function postLandingCleanupSuggestedAction(options: {
	readonly branch: string;
	readonly localBranchDisposition: "delete" | "keep-trunk";
	readonly slotName: string;
}): string {
	const commands = [formatCommand("ns", ["slot", "free", "--wt", options.slotName])];
	if (options.localBranchDisposition === "delete") {
		commands.push(formatGraphiteOperation(deleteLocalBranchOperation({ branch: options.branch })));
	}
	return `Run ${commands.join(", then ")} when safe.`;
}
