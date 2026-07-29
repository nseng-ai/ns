import { formatCommand } from "@nseng-ai/foundation/command";
import { optionalEntry } from "@nseng-ai/foundation/primitives";

import { postLandingCleanupCommands } from "../confirmation-commands.ts";
import { deleteLocalBranchOperation, formatGraphiteOperation } from "../graphite-operations.ts";
import { landingExecutionFailure } from "../results.ts";
import type { LandExecutionStatusProgress } from "./host-seams.ts";
import {
	boundaryFailureDiagnostics,
	type LandContext,
	type LandingCleanupPolicy,
	type LandingFailure,
	type LandingMode,
	type LandingShape,
	type ManagedSlotWorktree,
	type PostLandingSlotCleanupReport,
} from "../types.ts";
import { isManagedSlotPath, slotNameFromPath } from "../worktree-paths.ts";

export interface PostLandingSlotCleanupPreview {
	readonly branch: string;
	readonly repoRoot: string;
	readonly slotName: string;
	readonly localBranchDisposition: "delete" | "keep-trunk";
}

/** Post-landing cleanup inputs derived from the public landing request. */
export interface PostLandingCleanupRequest {
	readonly mode: LandingMode;
	readonly policy: LandingCleanupPolicy;
}

export type PostLandingCleanupResult =
	| {
			readonly type: "completed";
			readonly outcome: PostLandingSlotCleanupReport;
			readonly successMessage?: string;
	  }
	| {
			readonly type: "failure";
			readonly outcome: PostLandingSlotCleanupReport;
			readonly failure: LandingFailure;
	  };

interface PostLandingSlotCleanupTarget extends PostLandingSlotCleanupPreview {
	readonly successMessage: string;
	readonly suggestedAction: string;
}

export function planManagedSlotPostLandingCleanup(options: {
	readonly cleanup: PostLandingCleanupRequest;
	readonly shape: LandingShape;
}): PostLandingSlotCleanupPreview | undefined {
	const target = postLandingCleanupTarget(options.cleanup, options.shape);
	if (target === undefined) return undefined;
	return {
		branch: target.branch,
		repoRoot: target.repoRoot,
		slotName: target.slotName,
		localBranchDisposition: target.localBranchDisposition,
	};
}

/** Observed cleanup outcome when the target is skipped before any cleanup mutation runs. */
export function postLandingCleanupSkipReport(
	cleanup: PostLandingCleanupRequest,
	shape: LandingShape,
): PostLandingSlotCleanupReport {
	const slotName = isManagedSlotPath(shape.repoRoot) ? slotNameFromPath(shape.repoRoot) : undefined;
	if (slotName === undefined) return { type: "not-applicable" };
	if (cleanup.mode === "dry-run") return { type: "dry-run" };
	if (cleanup.policy === "preserve") {
		return { type: "preserved", slotName, branch: shape.stack.actualCurrentBranch };
	}
	return { type: "not-applicable" };
}

export async function runManagedSlotPostLandingCleanup(options: {
	readonly landContext: LandContext;
	readonly progress: LandExecutionStatusProgress;
	readonly cleanup: PostLandingCleanupRequest;
	readonly shape: LandingShape;
}): Promise<PostLandingCleanupResult> {
	// Deterministic cleanup authorization: the explicit `free` policy (`--free`) is itself the
	// consent, so a resolved cleanup target is the sole decision point for mutation.
	const target = postLandingCleanupTarget(options.cleanup, options.shape);
	if (target === undefined) {
		return {
			type: "completed",
			outcome: postLandingCleanupSkipReport(options.cleanup, options.shape),
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
			const failure = landingExecutionFailure(
				`PRs were landed, but freeing ${target.slotName} failed.`,
				{
					displayCommand:
						diagnostics.displayCommand ??
						formatCommand("ns", ["slot", "free", "--wt", target.slotName]),
					...optionalEntry("execResult", diagnostics.execResult),
					suggestedAction: target.suggestedAction,
				},
			);
			return { type: "failure", outcome: { type: "failed", failure }, failure };
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
				const failure = landingExecutionFailure(
					`PRs were landed and ${target.slotName} was freed, but deleting local branch ${branch} failed.`,
					{
						displayCommand:
							deletion.type === "failed"
								? deletion.commandDisplay
								: formatGraphiteOperation(deleteOperation),
						...(deletion.type === "failed" ? { execResult: deletion.result } : {}),
						suggestedAction: `Delete local branch ${branch} manually when safe.`,
					},
				);
				// Partial success: retain the freed-slot fact alongside the deletion failure.
				return {
					type: "failure",
					outcome: { type: "failed", freedSlot: managedSlot, failure },
					failure,
				};
			}
		}

		return {
			type: "completed",
			outcome: {
				type: "completed",
				freedSlot: managedSlot,
				...(target.localBranchDisposition === "keep-trunk"
					? { keptTrunkBranch: target.branch }
					: { deletedLocalBranch: target.branch }),
			},
			successMessage: target.successMessage,
		};
	} finally {
		options.progress.setStatus(undefined);
	}
}

function postLandingCleanupTarget(
	cleanup: PostLandingCleanupRequest,
	shape: LandingShape,
): PostLandingSlotCleanupTarget | undefined {
	if (cleanup.policy === "preserve" || cleanup.mode === "dry-run") return undefined;

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
		suggestedAction: `Run ${postLandingCleanupCommands({
			branch,
			slotName,
			localBranchDisposition,
		}).join(", then ")} when safe.`,
	};
}
