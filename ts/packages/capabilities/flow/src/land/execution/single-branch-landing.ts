import { detectWorktreeConflicts } from "../preflight.ts";
import { landingCancelledBeforeMergeFailure, landingExecutionFailure } from "../results.ts";
import { managedSlotConflictWithoutSlotsExtensionFailure } from "./pre-merge.ts";
import type {
	LandContext,
	LandingFailure,
	LandingShape,
	PullRequestFacts,
	StackSnapshot,
} from "../types.ts";
import type { LandConfirmationGateway, LandExecutionMessageProgress } from "./host-seams.ts";
import { isVerifiedMergedPullRequest } from "./merged-pull-request-verification.ts";
import {
	planManagedSlotPostLandingCleanup,
	type PostLandingCleanupRequest,
	type PostLandingSlotCleanupDecision,
} from "./post-landing-cleanup.ts";

const SQUASH_MERGE_PROGRESS = "Running gh pr merge --squash with PR title/body as commit message…";

export interface SingleBranchLandingHost {
	readonly confirmation: LandConfirmationGateway;
	readonly progress: LandExecutionMessageProgress;
}

export interface ExecuteSingleBranchLandingOptions {
	readonly context: LandContext;
	readonly host: SingleBranchLandingHost;
	readonly target: LandingShape;
	readonly isDryRun: boolean;
	readonly cleanup: PostLandingCleanupRequest;
}

export type SingleBranchLandingOutcome =
	| {
			readonly type: "completed";
			readonly result: "dry-run";
			readonly pullRequest: PullRequestFacts;
			readonly cleanupDecision: { readonly type: "not-needed" };
	  }
	| {
			readonly type: "completed";
			readonly result: "merged";
			readonly pullRequest: PullRequestFacts;
			readonly commandOutput: string;
			readonly cleanupDecision: PostLandingSlotCleanupDecision;
	  }
	| {
			readonly type: "failure";
			readonly stage:
				| "load"
				| "base-check"
				| "worktree-safety"
				| "confirmation"
				| "merge"
				| "verification";
			readonly failure: LandingFailure;
			readonly cleanupDecision: PostLandingSlotCleanupDecision;
	  };

export function isSingleBranchFastPath(stack: StackSnapshot): boolean {
	return (
		stack.actualCurrentBranch !== stack.trunk &&
		stack.landingBranches.length === 1 &&
		stack.landingBranches[0] === stack.actualCurrentBranch &&
		stack.descendantBranches.length === 0
	);
}

export async function executeSingleBranchLanding(
	options: ExecuteSingleBranchLandingOptions,
): Promise<SingleBranchLandingOutcome> {
	const noCleanup: PostLandingSlotCleanupDecision = { type: "not-needed" };
	const prResult = await options.context.github.pullRequestFacts({
		repoRoot: options.target.repoRoot,
		branchOrNumber: options.target.stack.actualCurrentBranch,
	});
	if (prResult.type === "failure") {
		return {
			type: "failure",
			stage: "load",
			failure: prResult.failure,
			cleanupDecision: noCleanup,
		};
	}
	const pullRequest = prResult.value;

	if (pullRequest.baseRefName !== options.target.trunk) {
		return {
			type: "failure",
			stage: "base-check",
			failure: landingExecutionFailure(
				`Refusing to land PR #${pullRequest.number}: base branch is '${pullRequest.baseRefName}', not Graphite trunk '${options.target.trunk}'. Merge not attempted.`,
				{ outcome: "refusal" },
			),
			cleanupDecision: noCleanup,
		};
	}

	if (options.isDryRun) {
		return {
			type: "completed",
			result: "dry-run",
			pullRequest,
			cleanupDecision: noCleanup,
		};
	}

	if (!options.cleanup.hasSlotsExtension) {
		const conflicts = await detectWorktreeConflicts({
			context: options.context,
			repoRoot: options.target.repoRoot,
			currentBranch: options.target.stack.actualCurrentBranch,
			relevantBranches: options.target.stack.landingBranches,
		});
		if (conflicts.type === "failure") {
			return {
				type: "failure",
				stage: "worktree-safety",
				failure: conflicts.failure,
				cleanupDecision: noCleanup,
			};
		}
		const managedSlotConflicts = conflicts.value.filter(
			(conflict) => conflict.type === "managed-slot",
		);
		if (managedSlotConflicts.length > 0) {
			return {
				type: "failure",
				stage: "worktree-safety",
				failure: managedSlotConflictWithoutSlotsExtensionFailure(managedSlotConflicts),
				cleanupDecision: noCleanup,
			};
		}
	}

	const cleanupPreview = planManagedSlotPostLandingCleanup({
		cleanup: options.cleanup,
		shape: options.target,
	});
	const confirmation = await options.host.confirmation.confirm({
		kind: "single-branch-main-landing",
		pullRequest,
		trunk: options.target.trunk,
		...(cleanupPreview === undefined ? {} : { cleanup: cleanupPreview }),
	});
	if (confirmation.type !== "approved") {
		return {
			type: "failure",
			stage: "confirmation",
			failure:
				confirmation.type === "declined"
					? landingCancelledBeforeMergeFailure()
					: confirmation.failure,
			cleanupDecision: noCleanup,
		};
	}

	const cleanupDecision: PostLandingSlotCleanupDecision =
		cleanupPreview === undefined ? noCleanup : { type: "approved" };

	options.host.progress.setStatus(SQUASH_MERGE_PROGRESS);
	options.host.progress.note(SQUASH_MERGE_PROGRESS);
	const mergeResult = await options.context.github.squashMergePullRequest({
		repoRoot: options.target.repoRoot,
		pullRequest,
	});
	if (mergeResult.type === "failure") {
		return {
			type: "failure",
			stage: "merge",
			failure: mergeResult.failure,
			cleanupDecision,
		};
	}

	const verified = await options.context.github.pullRequestFacts({
		repoRoot: options.target.repoRoot,
		branchOrNumber: String(pullRequest.number),
	});
	if (verified.type === "failure") {
		return {
			type: "failure",
			stage: "verification",
			failure: landingExecutionFailure(
				`gh pr merge exited 0, but verification could not load PR #${pullRequest.number}; post-landing cleanup skipped.\n${verified.failure.message}`,
			),
			cleanupDecision,
		};
	}

	const isVerifiedMerged = isVerifiedMergedPullRequest(verified.value, {
		expectedTrunk: options.target.trunk,
		expectedHeadBranch: options.target.stack.actualCurrentBranch,
	});
	if (!isVerifiedMerged) {
		return {
			type: "failure",
			stage: "verification",
			failure: landingExecutionFailure(
				"gh pr merge exited 0 but PR did not verify as MERGED; post-landing cleanup skipped.",
			),
			cleanupDecision,
		};
	}

	return {
		type: "completed",
		result: "merged",
		pullRequest,
		commandOutput: successfulCommandOutput(mergeResult.value),
		cleanupDecision,
	};
}

function successfulCommandOutput(result: {
	readonly stdout: string;
	readonly stderr: string;
}): string {
	return [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n");
}
