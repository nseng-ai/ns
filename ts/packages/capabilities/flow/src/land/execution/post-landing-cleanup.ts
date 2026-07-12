import { formatCommand } from "@nseng-ai/foundation/command";
import { optionalEntry } from "@nseng-ai/foundation/primitives";

import { postLandingCleanupCommands } from "../confirmation-commands.ts";
import { deleteLocalBranchOperation, formatGraphiteOperation } from "../graphite-operations.ts";
import { landingExecutionFailure } from "../results.ts";
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
	readonly localBranchDisposition: "delete" | "keep-trunk";
	readonly successMessage: string;
	readonly suggestedAction: string;
}

export function planManagedSlotPostLandingCleanup(options: {
	readonly cleanup: PostLandingCleanupRequest;
	readonly shape: LandingShape;
}): PostLandingSlotCleanupPreview | undefined {
	const target = postLandingCleanupTarget(options.cleanup, options.shape);
	if (target === undefined) return undefined;
	return { branch: target.branch, repoRoot: target.repoRoot, slotName: target.slotName };
}

/** Observed cleanup outcome when the target is skipped before any cleanup mutation runs. */
export function postLandingCleanupSkipReport(
	cleanup: PostLandingCleanupRequest,
	shape: LandingShape,
): PostLandingSlotCleanupReport {
	if (!isManagedSlotPath(shape.repoRoot) || slotNameFromPath(shape.repoRoot) === undefined) {
		return { type: "not-applicable" };
	}
	if (cleanup.mode === "dry-run") return { type: "dry-run" };
	if (cleanup.policy === "preserve") return { type: "preserved" };
	return { type: "not-applicable" };
}

export async function resolveManagedSlotPostLandingCleanupDecision(options: {
	readonly confirmation: LandConfirmationGateway;
	readonly isConfirmationAlreadyApproved: boolean;
	readonly cleanup: PostLandingCleanupRequest;
	readonly shape: LandingShape;
}): Promise<
	| { readonly type: "success"; readonly value: PostLandingSlotCleanupDecision }
	| { readonly type: "failure"; readonly failure: LandingFailure }
> {
	const target = postLandingCleanupTarget(options.cleanup, options.shape);
	if (target === undefined) return { type: "success", value: { type: "not-needed" } };
	if (options.isConfirmationAlreadyApproved || options.cleanup.policy === "force-cleanup") {
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
	readonly cleanup: PostLandingCleanupRequest;
	readonly shape: LandingShape;
	readonly cleanupDecision: PostLandingSlotCleanupDecision;
}): Promise<PostLandingCleanupResult> {
	const target = postLandingCleanupTarget(options.cleanup, options.shape);
	if (options.cleanupDecision.type === "not-needed" || target === undefined) {
		return {
			type: "completed",
			outcome: postLandingCleanupSkipReport(options.cleanup, options.shape),
		};
	}

	if (options.cleanupDecision.type === "declined") {
		return {
			type: "failure",
			outcome: { type: "declined", slotName: target.slotName, branch: target.branch },
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
