import { failure, ok } from "@asdl/clinkr";
import { z } from "zod";

import type { SlotCliContext } from "../../context.ts";
import { getSlotGtGateway } from "../../gateways/gt.ts";
import { collectStackBranches } from "../../gt/stack-walk.ts";
import { buildSlotInventory } from "../../inventory.ts";
import { executeFreePlan, planFreeSlots } from "../../lifecycle/free.ts";
import { freedSlotSchema } from "../free.ts";

export const gtFreeStackRequestSchema = z.object({
	downstack: z.boolean().default(false).describe("Free only ancestor stack slots."),
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
	const current = await ctx.git.getCurrentBranch(ctx.repo.root);
	if (current.type === "failure") return failure("git_current_branch_failed", current.failure.message);
	if (current.type === "detached") return failure("detached_head", `HEAD at ${ctx.repo.root} is detached. Check out a branch first.`);
	const gt = getSlotGtGateway(ctx);
	const trunk = await gt.trunk(ctx.repo.root);
	if (trunk.type === "failure") return failure("gt_trunk_failed", trunk.failure.message);
	if (current.branch === trunk.branch) return ok({ current_branch: current.branch, trunk_branch: trunk.branch, freed: [], noop_reason: "on_trunk" as const, downstack: request.downstack });
	const inventory = await buildSlotInventory(ctx.git, { mainRepoRoot: ctx.repo.mainRepoRoot });
	if (inventory.records.length === 0) return failure("pool_empty", "No managed slots configured. Run `slot init --size N` first.");
	const stackResult = await gt.stack(ctx.repo.root);
	if (stackResult.type === "failure") return failure("gt_stack_failed", stackResult.failure.message);
	if (stackResult.type === "untracked_branch") return failure("gt_untracked_branch", "current branch is not tracked by Graphite — run `gt track` first");
	const branches = collectStackBranches(stackResult.stack, { current: current.branch, trunk: trunk.branch, downstackOnly: request.downstack, includeCurrent: false });
	const slotNames: string[] = [];
	for (const branch of branches) {
		const record = inventory.records.find((candidate) => candidate.branch === branch);
		if (record !== undefined && !slotNames.includes(record.slotName)) slotNames.push(record.slotName);
	}
	if (slotNames.length === 0) return ok({ current_branch: current.branch, trunk_branch: trunk.branch, freed: [], noop_reason: "no_slots" as const, downstack: request.downstack });
	const plan = await planFreeSlots(ctx, slotNames);
	if (plan.type === "failure") return failure(plan.failure.error_type, plan.failure.message);
	const executed = await executeFreePlan(ctx, { ...plan.outcome, trunkBranch: trunk.branch });
	if (executed.type === "failure") return failure(executed.failure.error_type, executed.failure.message);
	return ok({ current_branch: current.branch, trunk_branch: trunk.branch, freed: executed.outcome.freed, noop_reason: null, downstack: request.downstack });
}

export function renderGtFreeStack(result: GtFreeStackResult): string {
	if (result.noop_reason === "on_trunk") return `On trunk '${result.trunk_branch}'; no stack slots to free.`;
	if (result.noop_reason === "no_slots") return "No stack branches are assigned to managed slots.";
	return result.freed.map((slot) => `Freed ${slot.slot_name} (${slot.branch_name})`).join("\n");
}
