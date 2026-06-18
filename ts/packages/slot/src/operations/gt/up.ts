import { failure, negative, ok } from "@asdl/clinkr";
import { z } from "zod";

import type { SlotCliContext } from "../../context.ts";
import { buildGtNavigationResult, renderGtNavigation, resolveOrCheckoutWorktreeForBranch } from "./navigation.ts";
import { resolveRepoAndCurrentBranch } from "./shared.ts";

export const gtUpRequestSchema = z.object({
	clipboard: z.boolean().default(true).describe("Copy the cd command to the clipboard."),
});

export const gtNavigationResultSchema = z.object({
	slot_name: z.string().nullable(),
	branch_name: z.string(),
	worktree_path: z.string(),
	cd_command: z.string(),
	is_already_assigned: z.boolean(),
	is_clipboard_copied: z.boolean(),
	is_clipboard_skipped: z.boolean(),
	clipboard_failure_reason: z.union([z.literal("backend_missing"), z.literal("subprocess_error")]).nullable(),
	clipboard_failure_detail: z.string().nullable(),
});

export type GtUpRequest = z.infer<typeof gtUpRequestSchema>;

export async function runGtUp(ctx: SlotCliContext, request: GtUpRequest) {
	const resolved = await resolveRepoAndCurrentBranch(ctx);
	if (resolved.type !== "ok") return resolved;
	const children = await ctx.gt.childrenOf(resolved.repoCtx.repo.root);
	if (children.type === "untracked_branch") return failure("untracked_branch", `Current branch '${resolved.currentBranch}' is not tracked by Graphite. ${children.message}`);
	if (children.type === "failure") return failure("gt_children_failed", children.failure.message);
	if (children.branches.length === 0) return negative(`No upstack branch for '${resolved.currentBranch}'.`);
	if (children.branches.length > 1) return negative(`Multiple upstack branches for '${resolved.currentBranch}': ${children.branches.join(", ")}. Run \`slot checkout <branch>\` for the branch you want.`);
	const branch = children.branches[0] ?? "";
	const resolution = await resolveOrCheckoutWorktreeForBranch(ctx, branch);
	if (resolution.type === "failure") return resolution;
	return ok(await buildGtNavigationResult(ctx, resolution.resolution, { shouldSkipClipboard: !request.clipboard }));
}

export { renderGtNavigation };
