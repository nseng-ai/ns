import { landingExecutionFailure } from "../results.ts";
import type {
	LandContext,
	LandingCleanupPolicy,
	LandingContinuationReport,
	LandingFailure,
	StackSnapshot,
} from "../types.ts";

export type UpstackContinuationSnapshot =
	| { readonly type: "available"; readonly report: LandingContinuationReport }
	| {
			readonly type: "unavailable";
			readonly report: LandingContinuationReport;
			readonly failure: LandingFailure;
	  };

/** Snapshot the immediate children before landing mutates Graphite metadata or local branches. */
export async function snapshotUpstackContinuation(options: {
	readonly context: LandContext;
	readonly repoRoot: string;
	readonly metadataDbPath: string;
	readonly stack: StackSnapshot;
}): Promise<UpstackContinuationSnapshot> {
	const { context, repoRoot, metadataDbPath, stack } = options;
	const children = await context.graphite.branchChildren({
		repoRoot,
		metadataDbPath,
		branch: stack.actualCurrentBranch,
	});
	if (children.type === "failure") {
		return {
			type: "unavailable",
			report: { type: "unavailable", reason: "lookup-failed", candidates: [] },
			failure: landingExecutionFailure(
				`Cannot land with --up because the upstack branch could not be resolved before mutation.\n${children.failure.message}`,
				{
					failedBranch: stack.actualCurrentBranch,
					suggestedAction: `Inspect the children of ${stack.actualCurrentBranch}, then rerun land --up.`,
				},
			),
		};
	}
	if (children.value.length === 0) {
		return {
			type: "unavailable",
			report: { type: "unavailable", reason: "no-child", candidates: [] },
			failure: landingExecutionFailure(
				`Cannot land with --up because ${stack.actualCurrentBranch} has no immediate upstack branch to continue onto.`,
				{ failedBranch: stack.actualCurrentBranch },
			),
		};
	}
	if (children.value.length > 1) {
		return {
			type: "unavailable",
			report: {
				type: "unavailable",
				reason: "multiple-children",
				candidates: [...children.value],
			},
			failure: landingExecutionFailure(
				`Cannot land with --up because ${stack.actualCurrentBranch} has multiple immediate upstack branches (${children.value.join(", ")}).`,
				{
					failedBranch: stack.actualCurrentBranch,
					suggestedAction:
						"Select the intended branch manually or make the continuation path unambiguous, then rerun land --up.",
				},
			),
		};
	}
	const branch = children.value[0];
	if (branch === undefined) throw new Error("A sole upstack child must exist.");
	return { type: "available", report: { type: "candidate", branch } };
}

export type ExecuteUpstackContinuationResult =
	| { readonly type: "completed"; readonly report: LandingContinuationReport }
	| {
			readonly type: "failed";
			readonly report: LandingContinuationReport;
			readonly failure: LandingFailure;
	  };

export async function executeUpstackContinuation(options: {
	readonly context: LandContext;
	readonly repoRoot: string;
	readonly originalBranch: string;
	readonly candidateBranch: string;
	readonly cleanup: LandingCleanupPolicy;
}): Promise<ExecuteUpstackContinuationResult> {
	const { context, repoRoot, originalBranch, candidateBranch, cleanup } = options;
	const checkedOut = await context.git.checkoutBranch({ repoRoot, branch: candidateBranch });
	if (checkedOut.type === "failure") {
		return {
			type: "failed",
			report: { type: "checkout-failed", branch: candidateBranch },
			failure: landingExecutionFailure(
				`Landing completed, but checking out continuation branch ${candidateBranch} failed.\n${checkedOut.failure.message}`,
				{
					failedBranch: candidateBranch,
					suggestedAction: `The invoking worktree and ${originalBranch} were preserved. Switch to ${candidateBranch} manually after inspecting the repository.`,
				},
			),
		};
	}

	const current = await context.git.currentBranch({ repoRoot });
	if (current.type === "failure") {
		return {
			type: "failed",
			report: {
				type: "verification-failed",
				branch: candidateBranch,
				actualBranch: originalBranch,
			},
			failure: landingExecutionFailure(
				`Landing completed and checkout was attempted, but the current branch could not be verified.\n${current.failure.message}`,
				{
					failedBranch: candidateBranch,
					suggestedAction: `Inspect the invoking worktree before deleting ${originalBranch}.`,
				},
			),
		};
	}
	if (current.value !== candidateBranch) {
		return {
			type: "failed",
			report: {
				type: "verification-failed",
				branch: candidateBranch,
				actualBranch: current.value,
			},
			failure: landingExecutionFailure(
				`Landing completed, but checkout verification found ${current.value} instead of ${candidateBranch}.`,
				{
					failedBranch: candidateBranch,
					suggestedAction: `The original branch ${originalBranch} was preserved. Inspect the invoking worktree before continuing.`,
				},
			),
		};
	}

	if (cleanup === "preserve") {
		return {
			type: "completed",
			report: { type: "continued", branch: candidateBranch, originalBranchDeleted: false },
		};
	}

	const deletion = await context.graphite.deleteLocalBranch({
		repoRoot,
		branch: originalBranch,
		checkedOutConflictHandling: "fail",
	});
	if (deletion.type !== "deleted") {
		return {
			type: "failed",
			report: { type: "cleanup-failed", branch: candidateBranch },
			failure: landingExecutionFailure(
				`Landing completed and continued onto ${candidateBranch}, but deleting original local branch ${originalBranch} did not complete.`,
				{
					failedBranch: originalBranch,
					...(deletion.type === "failed"
						? { displayCommand: deletion.commandDisplay, execResult: deletion.result }
						: {}),
					suggestedAction: `Inspect the stack and delete ${originalBranch} manually when safe.`,
				},
			),
		};
	}
	return {
		type: "completed",
		report: { type: "continued", branch: candidateBranch, originalBranchDeleted: true },
	};
}
