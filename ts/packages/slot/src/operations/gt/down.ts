import { failure, negative, ok } from "@asdl/clinkr";
import { z } from "zod";

import type { SlotCliContext } from "../../context.ts";
import { buildGtNavigationResult, resolveOrCheckoutWorktreeForBranch } from "./navigation.ts";
import { resolveRepoAndCurrentBranch } from "./shared.ts";
import { gtNavigationResultSchema } from "./up.ts";

export const gtDownRequestSchema = z.object({
	clipboard: z.boolean().default(true).describe("Copy the cd command to the clipboard."),
});

export const gtDownResultSchema = gtNavigationResultSchema;
export type GtDownRequest = z.infer<typeof gtDownRequestSchema>;

export async function runGtDown(ctx: SlotCliContext, request: GtDownRequest) {
	const resolved = await resolveRepoAndCurrentBranch(ctx);
	if (resolved.type !== "ok") return resolved;
	const parent = await ctx.gt.parentOf(resolved.repoCtx.repo.root);
	if (parent.type === "untracked_branch")
		return failure(
			"untracked_branch",
			`Current branch '${resolved.currentBranch}' is not tracked by Graphite. ${parent.message}`,
		);
	if (parent.type === "failure") return failure("gt_parent_failed", parent.failure.message);
	if (parent.type === "no_parent")
		return negative(`No downstack branch for '${resolved.currentBranch}'.`);
	const resolution = await resolveOrCheckoutWorktreeForBranch(ctx, parent.branch);
	if (resolution.type === "failure") return resolution;
	return ok(
		await buildGtNavigationResult(ctx, resolution.resolution, {
			shouldSkipClipboard: !request.clipboard,
		}),
	);
}

export { renderGtNavigationResult as renderGtDownNavigation } from "./navigation.ts";
