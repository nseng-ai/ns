import { failure, negative, ok } from "@asdl/clinkr";
import { z } from "zod";

import type { SlotCliContext } from "../../context.ts";
import { getSlotGtGateway } from "../../gateways/gt.ts";
import { checkoutBranch } from "../../lifecycle/checkout.ts";
import { buildNavigationResultFields } from "../../navigation-result.ts";

export const gtNavigationRequestSchema = z.object({
	clipboard: z.boolean().default(true).describe("Copy the cd command to the clipboard."),
});

export const gtNavigationResultSchema = z.object({
	slot_name: z.string().nullable(),
	branch_name: z.string(),
	worktree_path: z.string(),
	cd_command: z.string(),
	already_assigned: z.boolean(),
	clipboard_copied: z.boolean(),
	clipboard_skipped: z.boolean(),
	clipboard_failure_reason: z.union([z.literal("backend_missing"), z.literal("subprocess_error")]).nullable(),
	clipboard_failure_detail: z.string().nullable(),
});

export type GtNavigationRequest = z.infer<typeof gtNavigationRequestSchema>;
export type GtNavigationResult = z.infer<typeof gtNavigationResultSchema>;

export async function runGtUp(ctx: SlotCliContext, request: GtNavigationRequest) {
	return runGtNavigation(ctx, request, "up");
}

export async function runGtDown(ctx: SlotCliContext, request: GtNavigationRequest) {
	return runGtNavigation(ctx, request, "down");
}

export function renderGtNavigation(result: GtNavigationResult): string {
	const slot = result.slot_name === null ? "main worktree" : result.slot_name;
	const lines = [`${slot} -> ${result.branch_name}`, result.cd_command];
	if (!result.clipboard_skipped) lines.push(result.clipboard_copied ? "Copied cd command to clipboard." : `Clipboard unavailable (${result.clipboard_failure_detail ?? "pbcopy failed"})`);
	return lines.join("\n");
}

async function runGtNavigation(ctx: SlotCliContext, request: GtNavigationRequest, direction: "up" | "down") {
	if (ctx.repo.type !== "repo") return failure(ctx.repo.errorType, ctx.repo.message);
	const current = await ctx.git.getCurrentBranch(ctx.repo.root);
	if (current.type === "failure") return failure("git_current_branch_failed", current.failure.message);
	if (current.type === "detached") return failure("detached_head", `HEAD at ${ctx.repo.root} is detached. Check out a branch first.`);
	const target = direction === "up" ? await resolveUpTarget(ctx, current.branch) : await resolveDownTarget(ctx, current.branch);
	if (target.type === "exit") return target.exit;
	const targetBranch = target.branch;
	const existing = (await ctx.git.listWorktrees()).find((worktree) => worktree.branch === targetBranch);
	if (existing !== undefined) {
		const navigation = await buildNavigationResultFields(ctx, { worktreePath: existing.path, shouldSkipClipboard: !request.clipboard });
		return ok({ slot_name: slotNameFromPath(existing.path), branch_name: targetBranch, already_assigned: true, ...navigation });
	}
	const checkout = await checkoutBranch(ctx, targetBranch, { shouldCreateBranch: false, base: null });
	if (checkout.type === "failure") return failure(checkout.failure.error_type, checkout.failure.message);
	const navigation = await buildNavigationResultFields(ctx, { worktreePath: checkout.outcome.worktree_path, shouldSkipClipboard: !request.clipboard });
	return ok({ slot_name: checkout.outcome.slot_name.length === 0 ? null : checkout.outcome.slot_name, branch_name: targetBranch, already_assigned: checkout.outcome.already_assigned, ...navigation });
}

async function resolveUpTarget(ctx: SlotCliContext, currentBranch: string) {
	const result = await getSlotGtGateway(ctx).childrenOf(ctx.repo.type === "repo" ? ctx.repo.root : ctx.cwd);
	if (result.type === "untracked_branch") return { type: "exit" as const, exit: failure("untracked_branch", result.message) };
	if (result.type === "failure") return { type: "exit" as const, exit: failure("gt_children_failed", result.failure.message) };
	const children = result.children;
	if (children.length === 0) return { type: "exit" as const, exit: negative(`No upstack branch for '${currentBranch}'.`) };
	if (children.length > 1) return { type: "exit" as const, exit: negative(`Multiple upstack branches for '${currentBranch}': ${children.join(", ")}. Run \`slot checkout <branch>\` for the branch you want.`) };
	return { type: "branch" as const, branch: children[0] ?? "" };
}

async function resolveDownTarget(ctx: SlotCliContext, currentBranch: string) {
	const result = await getSlotGtGateway(ctx).parentOf(ctx.repo.type === "repo" ? ctx.repo.root : ctx.cwd);
	if (result.type === "untracked_branch") return { type: "exit" as const, exit: failure("untracked_branch", result.message) };
	if (result.type === "failure") return { type: "exit" as const, exit: failure("gt_parent_failed", result.failure.message) };
	if (result.type === "no_parent") return { type: "exit" as const, exit: negative(`No downstack branch for '${currentBranch}'.`) };
	return { type: "branch" as const, branch: result.branch };
}

function slotNameFromPath(path: string): string | null {
	const name = path.split("/").at(-1) ?? "";
	return /^slot-\d+$/.test(name) ? name : null;
}
