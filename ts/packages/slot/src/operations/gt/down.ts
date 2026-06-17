import { failure, negative, ok } from "@asdl/clinkr";
import { z } from "zod";

import type { SlotCliContext } from "../../context.ts";
import { buildGtNavigationResult, renderGtNavigation, resolveOrCheckoutWorktreeForBranch } from "./navigation.ts";
import { gtNavigationResultSchema } from "./up.ts";

export const gtDownRequestSchema = z.object({
	clipboard: z.boolean().default(true).describe("Copy the cd command to the clipboard."),
});

export const gtDownResultSchema = gtNavigationResultSchema;
export type GtDownRequest = z.infer<typeof gtDownRequestSchema>;

export async function runGtDown(ctx: SlotCliContext, request: GtDownRequest) {
	if (ctx.repo.type !== "repo") return failure(ctx.repo.errorType, ctx.repo.message);
	const currentResult = await ctx.git.getCurrentBranch(ctx.repo.root);
	if (currentResult.type === "failure") return failure("git_current_branch_failed", currentResult.failure.message);
	if (currentResult.type === "detached") return failure("detached_head", `HEAD at ${ctx.repo.root} is detached. Check out a branch first.`);
	const parent = await ctx.gt.parentOf(ctx.repo.root);
	if (parent.type === "untracked_branch") return failure("untracked_branch", `Current branch '${currentResult.branch}' is not tracked by Graphite. ${parent.message}`);
	if (parent.type === "failure") return failure("gt_parent_failed", parent.failure.message);
	if (parent.type === "no_parent") return negative(`No downstack branch for '${currentResult.branch}'.`);
	const resolution = await resolveOrCheckoutWorktreeForBranch(ctx, parent.branch);
	if (resolution.type === "failure") return resolution;
	return ok(await buildGtNavigationResult(ctx, resolution.resolution, { shouldSkipClipboard: !request.clipboard }));
}

export { renderGtNavigation };
