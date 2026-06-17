import { failure, ok } from "@asdl/clinkr";
import { z } from "zod";

import type { RepoSlotContext, SlotCliContext } from "../../context.ts";
import { buildSlotInventory, findByBranch, poolSize } from "../../inventory.ts";
import { executeFreePlan, planFreeSlots } from "../../lifecycle/free.ts";
import { collectStackBranches } from "./stack-walk.ts";

const freedSlotSchema = z.object({ slot_name: z.string(), branch_name: z.string(), worktree_path: z.string() });

export const gtFreeStackRequestSchema = z.object({
	downstack: z.boolean().default(false).describe("Free only ancestor/downstack slots."),
});

export const gtFreeStackResultSchema = z.object({
	current_branch: z.string(),
	trunk_branch: z.string(),
	freed: z.array(freedSlotSchema),
	noop_reason: z.union([z.literal("on_trunk"), z.literal("no_slots")]).nullable(),
	downstack: z.boolean(),
});

export type GtFreeStackRequest = z.infer<typeof gtFreeStackRequestSchema>;
export type GtFreeStackResult = z.infer<typeof gtFreeStackResultSchema>;

export async function runGtFreeStack(ctx: SlotCliContext, request: GtFreeStackRequest) {
	if (ctx.repo.type !== "repo") return failure(ctx.repo.errorType, ctx.repo.message);
	if (ctx.gt === undefined) return failure("gt_gateway_missing", "Graphite gateway is not available for slot gt commands.");
	const repoCtx: RepoSlotContext = { ...ctx, repo: ctx.repo };
	const currentResult = await repoCtx.git.getCurrentBranch(repoCtx.repo.root);
	if (currentResult.type === "failure") return failure("git_current_branch_failed", currentResult.failure.message);
	if (currentResult.type === "detached") return failure("detached_head", `HEAD at ${repoCtx.repo.root} is detached. Check out a branch first.`);
	const trunkResult = await ctx.gt.trunk(repoCtx.repo.root);
	if (trunkResult.type === "failure") return failure("gt_trunk_failed", trunkResult.failure.message);
	if (currentResult.branch === trunkResult.branch) return ok(buildResult({ current: currentResult.branch, trunk: trunkResult.branch, freed: [], noopReason: "on_trunk", downstack: request.downstack }));
	const inventory = await buildSlotInventory(repoCtx.git, { mainRepoRoot: repoCtx.repo.mainRepoRoot });
	if (poolSize(inventory) === 0) return failure("pool_empty", "No managed slots configured. Run `slot init --size N` first.");
	const stackResult = await ctx.gt.stack(repoCtx.repo.root);
	if (stackResult.type === "failure") return failure("gt_stack_failed", stackResult.failure.message);
	if (stackResult.type === "untracked_branch") return failure("gt_untracked_branch", "current branch is not tracked by Graphite — run `gt track` first");
	const branches = collectStackBranches(stackResult.stack, { current: currentResult.branch, trunk: trunkResult.branch, downstackOnly: request.downstack, includeCurrent: false });
	const targets: string[] = [];
	const seen = new Set<string>();
	for (const branch of branches) {
		if (branch === currentResult.branch || branch === trunkResult.branch) continue;
		const match = findByBranch(inventory, branch);
		if (match?.kind !== "slot") continue;
		if (seen.has(match.record.slotName)) continue;
		seen.add(match.record.slotName);
		targets.push(match.record.slotName);
	}
	if (targets.length === 0) return ok(buildResult({ current: currentResult.branch, trunk: trunkResult.branch, freed: [], noopReason: "no_slots", downstack: request.downstack }));
	const plan = await planFreeSlots(repoCtx, targets, { trunkBranch: trunkResult.branch });
	if (plan.type === "failure") return failure(plan.failure.error_type, plan.failure.message);
	const executed = await executeFreePlan(repoCtx, plan.outcome);
	if (executed.type === "failure") return failure(executed.failure.error_type, executed.failure.message);
	return ok(buildResult({ current: currentResult.branch, trunk: trunkResult.branch, freed: executed.outcome.freed, noopReason: null, downstack: request.downstack }));
}

export function renderGtFreeStack(result: GtFreeStackResult): string {
	if (result.noop_reason === "on_trunk") return `On trunk (${result.trunk_branch}); nothing to free.`;
	if (result.noop_reason === "no_slots") return `No slots in stack to free${result.downstack ? " (downstack only)" : ""}.`;
	return result.freed.map((entry) => `Freed ${entry.slot_name} (${entry.branch_name})\n  Worktree kept at ${entry.worktree_path}; detached HEAD at trunk`).join("\n");
}

function buildResult(options: { current: string; trunk: string; freed: readonly { slot_name: string; branch_name: string; worktree_path: string }[]; noopReason: "on_trunk" | "no_slots" | null; downstack: boolean }): GtFreeStackResult {
	return { current_branch: options.current, trunk_branch: options.trunk, freed: options.freed.map((entry) => ({ slot_name: entry.slot_name, branch_name: entry.branch_name, worktree_path: entry.worktree_path })), noop_reason: options.noopReason, downstack: options.downstack };
}
