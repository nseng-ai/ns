import { failure, type FailureOutcome } from "@nseng-ai/sdk";

import type { RepoSlotContext, SlotCliContext } from "../../../core/context.ts";

export type ResolvedRepoAndCurrentBranch =
	| {
			readonly status: "success";
			readonly repoCtx: RepoSlotContext;
			readonly repoRoot: string;
			readonly mainRepoRoot: string;
			readonly currentBranch: string;
	  }
	| FailureOutcome;

export async function resolveRepoAndCurrentBranch(
	ctx: SlotCliContext,
): Promise<ResolvedRepoAndCurrentBranch> {
	if (ctx.repo.type !== "repo") return failure(ctx.repo.errorType, ctx.repo.message);
	const repoCtx: RepoSlotContext = { ...ctx, repo: ctx.repo };
	const currentResult = await repoCtx.git.getCurrentBranch(repoCtx.repo.root);
	if (currentResult.type === "failure")
		return failure("git-current-branch-failed", currentResult.failure.message);
	if (currentResult.type === "detached")
		return failure(
			"detached-head",
			`HEAD at ${repoCtx.repo.root} is detached. Check out a branch first.`,
		);
	return {
		status: "success",
		repoCtx,
		repoRoot: repoCtx.repo.root,
		mainRepoRoot: repoCtx.repo.mainRepoRoot,
		currentBranch: currentResult.branch,
	};
}
