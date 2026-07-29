import { landingWarning } from "../types.ts";
import type {
	LandContext,
	LandingCleanupPolicy,
	LandingContinuationReport,
	LandingWarning,
	StackSnapshot,
} from "../types.ts";

export interface UpstackContinuationSnapshot {
	readonly report: LandingContinuationReport;
	readonly warnings: readonly LandingWarning[];
}

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
			report: { type: "unavailable", reason: "lookup-failed", candidates: [] },
			warnings: [
				landingWarning({
					message: `Landing can continue, but the upstack branch could not be resolved before mutation.\n${children.failure.message}`,
					suggestedAction: `After landing, inspect the children of ${stack.actualCurrentBranch} and switch branches manually.`,
				}),
			],
		};
	}
	if (children.value.length === 0) {
		return {
			report: { type: "unavailable", reason: "no-child", candidates: [] },
			warnings: [
				landingWarning({
					message: `Landing can continue, but ${stack.actualCurrentBranch} has no immediate upstack branch to continue onto.`,
				}),
			],
		};
	}
	if (children.value.length > 1) {
		return {
			report: {
				type: "unavailable",
				reason: "multiple-children",
				candidates: [...children.value],
			},
			warnings: [
				landingWarning({
					message: `Landing can continue, but ${stack.actualCurrentBranch} has multiple immediate upstack branches (${children.value.join(", ")}); no continuation branch was selected.`,
					suggestedAction:
						"After landing, inspect the stack and switch to the intended branch manually.",
				}),
			],
		};
	}
	const branch = children.value[0];
	if (branch === undefined) throw new Error("A sole upstack child must exist.");
	return { report: { type: "candidate", branch }, warnings: [] };
}

export interface ExecuteUpstackContinuationResult {
	readonly report: LandingContinuationReport;
	readonly warnings: readonly LandingWarning[];
}

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
			report: { type: "checkout-failed", branch: candidateBranch },
			warnings: [
				landingWarning({
					message: `Landing completed, but checking out continuation branch ${candidateBranch} failed.\n${checkedOut.failure.message}`,
					suggestedAction: `The invoking worktree and ${originalBranch} were preserved. Switch to ${candidateBranch} manually after inspecting the repository.`,
				}),
			],
		};
	}

	const current = await context.git.currentBranch({ repoRoot });
	if (current.type === "failure") {
		return {
			report: {
				type: "verification-failed",
				branch: candidateBranch,
				actualBranch: originalBranch,
			},
			warnings: [
				landingWarning({
					message: `Landing completed and checkout was attempted, but the current branch could not be verified.\n${current.failure.message}`,
					suggestedAction: `Inspect the invoking worktree before deleting ${originalBranch}.`,
				}),
			],
		};
	}
	if (current.value !== candidateBranch) {
		return {
			report: {
				type: "verification-failed",
				branch: candidateBranch,
				actualBranch: current.value,
			},
			warnings: [
				landingWarning({
					message: `Landing completed, but checkout verification found ${current.value} instead of ${candidateBranch}.`,
					suggestedAction: `The original branch ${originalBranch} was preserved. Inspect the invoking worktree before continuing.`,
				}),
			],
		};
	}

	if (cleanup === "preserve") {
		return {
			report: { type: "continued", branch: candidateBranch, originalBranchDeleted: false },
			warnings: [],
		};
	}

	const deletion = await context.graphite.deleteLocalBranch({
		repoRoot,
		branch: originalBranch,
		checkedOutConflictHandling: "fail",
	});
	if (deletion.type !== "deleted") {
		return {
			report: { type: "cleanup-failed", branch: candidateBranch },
			warnings: [
				landingWarning({
					message: `Landing completed and continued onto ${candidateBranch}, but deleting original local branch ${originalBranch} did not complete.`,
					...(deletion.type === "failed"
						? { commandDisplay: deletion.commandDisplay, result: deletion.result }
						: {}),
					suggestedAction: `Inspect the stack and delete ${originalBranch} manually when safe.`,
				}),
			],
		};
	}
	return {
		report: { type: "continued", branch: candidateBranch, originalBranchDeleted: true },
		warnings: [],
	};
}
