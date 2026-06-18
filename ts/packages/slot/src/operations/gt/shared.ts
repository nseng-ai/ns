import { failure, type ClinkrFailureExit } from "@asdl/clinkr";

import type { RepoSlotContext, SlotCliContext } from "../../context.ts";

export type ResolvedRepoAndCurrentBranch =
	| { readonly type: "ok"; readonly repoCtx: RepoSlotContext; readonly currentBranch: string }
	| ClinkrFailureExit;

export async function resolveRepoAndCurrentBranch(
	ctx: SlotCliContext,
): Promise<ResolvedRepoAndCurrentBranch> {
	if (ctx.repo.type !== "repo") return failure(ctx.repo.errorType, ctx.repo.message);
	const repoCtx: RepoSlotContext = { ...ctx, repo: ctx.repo };
	const currentResult = await repoCtx.git.getCurrentBranch(repoCtx.repo.root);
	if (currentResult.type === "failure")
		return failure("git_current_branch_failed", currentResult.failure.message);
	if (currentResult.type === "detached")
		return failure(
			"detached_head",
			`HEAD at ${repoCtx.repo.root} is detached. Check out a branch first.`,
		);
	return { type: "ok", repoCtx, currentBranch: currentResult.branch };
}
