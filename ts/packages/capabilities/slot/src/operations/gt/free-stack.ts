import { failure, ok, type RenderCapabilities } from "@sdl/clinkr";
import { z } from "zod";
import { optionalEntry } from "@sdl/core/primitives";

import type { SlotCliContext } from "../../core/context.ts";
import { buildSlotInventory, findByBranch, poolSize } from "../../core/inventory.ts";
import { executeFreePlan, planFreeSlots } from "../../lifecycle/free.ts";
import {
	buildSlotDestructiveResultBlock,
	renderSlotDestructiveResultBlock,
} from "../destructive-presentation.ts";
import { freedSlotSchema } from "../result-schemas.ts";
import { resolveRepoAndCurrentBranch } from "./shared.ts";
import { collectStackBranches } from "./stack-walk.ts";

export const gtFreeStackRequestSchema = z.object({
	downstack: z.boolean().default(false).describe("Free only ancestor/downstack slots."),
});

export const gtFreeStackResultSchema = z.object({
	currentBranch: z.string(),
	trunkBranch: z.string(),
	freed: z.array(freedSlotSchema),
	noopReason: z.union([z.literal("on-trunk"), z.literal("no-slots")]).nullable(),
	downstack: z.boolean(),
});

export type GtFreeStackRequest = z.infer<typeof gtFreeStackRequestSchema>;
export type GtFreeStackResult = z.infer<typeof gtFreeStackResultSchema>;

export async function runGtFreeStack(ctx: SlotCliContext, request: GtFreeStackRequest) {
	const resolved = await resolveRepoAndCurrentBranch(ctx);
	if (resolved.type !== "ok") return resolved;
	const { repoCtx, repoRoot, mainRepoRoot, currentBranch } = resolved;
	const trunkResult = await ctx.gt.trunk(repoRoot);
	if (trunkResult.type === "failure")
		return failure("gt-trunk-failed", trunkResult.failure.message);
	if (currentBranch === trunkResult.branch)
		return ok(
			buildResult({
				current: currentBranch,
				trunk: trunkResult.branch,
				freed: [],
				noopReason: "on-trunk",
				downstack: request.downstack,
			}),
		);
	const inventory = await buildSlotInventory(repoCtx.git, {
		mainRepoRoot,
	});
	if (poolSize(inventory) === 0)
		return failure("pool-empty", "No managed slots configured. Run `slot init --size N` first.");
	const stackResult = await ctx.gt.stack(repoRoot);
	if (stackResult.type === "failure")
		return failure("gt-stack-failed", stackResult.failure.message);
	if (stackResult.type === "untracked_branch")
		return failure(
			"gt-untracked-branch",
			"current branch is not tracked by Graphite — run `gt track` first",
		);
	const branches = collectStackBranches(stackResult.stack, {
		current: currentBranch,
		trunk: trunkResult.branch,
		isDownstackOnly: request.downstack,
		shouldIncludeCurrent: false,
	});
	const targets: string[] = [];
	const seenSlotNames = new Set<string>();
	for (const branch of branches) {
		if (branch === currentBranch || branch === trunkResult.branch) continue;
		const match = findByBranch(inventory, branch);
		if (match?.kind !== "slot") continue;
		if (seenSlotNames.has(match.record.slotName)) continue;
		seenSlotNames.add(match.record.slotName);
		targets.push(match.record.slotName);
	}
	if (targets.length === 0)
		return ok(
			buildResult({
				current: currentBranch,
				trunk: trunkResult.branch,
				freed: [],
				noopReason: "no-slots",
				downstack: request.downstack,
			}),
		);
	const plan = await planFreeSlots(repoCtx, targets, { trunkBranch: trunkResult.branch });
	if (plan.type === "failure") return failure(plan.failure.errorType, plan.failure.message);
	const executed = await executeFreePlan(repoCtx, plan.outcome);
	if (executed.type === "failure")
		return failure(executed.failure.errorType, executed.failure.message);
	return ok(
		buildResult({
			current: currentBranch,
			trunk: trunkResult.branch,
			freed: executed.outcome.freed,
			noopReason: null,
			downstack: request.downstack,
		}),
	);
}

export function renderGtFreeStack(
	result: GtFreeStackResult,
	caps: RenderCapabilities = { canEmitAnsi: false },
): string {
	const body = renderGtFreeStackDetails(result);
	return renderSlotDestructiveResultBlock(
		caps,
		buildSlotDestructiveResultBlock({
			kind: "success",
			headline: gtFreeStackHeadline(result),
			...optionalEntry("body", body),
		}),
	);
}

function gtFreeStackHeadline(result: GtFreeStackResult): string {
	if (result.noopReason === "on-trunk") return "On trunk; no stack slots freed.";
	if (result.noopReason === "no-slots") return "No stack slots freed.";
	return `Freed ${result.freed.length} stack slot(s).`;
}

function renderGtFreeStackDetails(result: GtFreeStackResult): string | undefined {
	if (result.noopReason === "on-trunk")
		return `Current branch ${result.currentBranch} is trunk ${result.trunkBranch}.`;
	if (result.noopReason === "no-slots")
		return `No assigned ${scopeText(result.downstack)} slots were found.`;
	return result.freed
		.map(
			(entry) =>
				`Freed ${entry.slotName} -> ${entry.branchName}\nWorktree kept at ${entry.worktreePath}; detached HEAD at ${result.trunkBranch}`,
		)
		.join("\n");
}

function scopeText(isDownstack: boolean): string {
	return isDownstack ? "downstack" : "stack";
}

function buildResult(options: {
	current: string;
	trunk: string;
	freed: readonly { slotName: string; branchName: string; worktreePath: string }[];
	noopReason: "on-trunk" | "no-slots" | null;
	downstack: boolean;
}): GtFreeStackResult {
	return {
		currentBranch: options.current,
		trunkBranch: options.trunk,
		freed: options.freed.map((entry) => ({
			slotName: entry.slotName,
			branchName: entry.branchName,
			worktreePath: entry.worktreePath,
		})),
		noopReason: options.noopReason,
		downstack: options.downstack,
	};
}
