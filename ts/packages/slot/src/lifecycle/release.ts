import type { RepoSlotContext } from "../context.ts";
import { executeFreePlan, planFreeSlots, type SlotFreeOutcome, type SlotFreePlan } from "./free.ts";
import { executeGcPlan, outcomeFromGcPlan, planGc, planGcCleanup, type SlotGcOutcome, type SlotGcPlan } from "./gc.ts";
import { executeReleaseCleanup, planReleaseCleanup, type SlotFreeCleanupAction, type SlotFreeCleanupResult } from "./release-cleanup.ts";

export interface SlotFreeReleasePreview {
	plan: SlotFreePlan;
	cleanup: readonly SlotFreeCleanupResult[];
}

export interface SlotFreeReleaseOutcome {
	outcome: SlotFreeOutcome;
	cleanup: readonly SlotFreeCleanupResult[];
}

export interface SlotGcReleasePreview {
	plan: SlotGcPlan;
	cleanup: readonly SlotFreeCleanupResult[];
	outcome: SlotGcOutcome;
}

export async function planFreeRelease(ctx: RepoSlotContext, slotNames: readonly string[], options: { preflightErrors?: readonly string[] | undefined; cleanupActions?: readonly SlotFreeCleanupAction[] | undefined } = {}) {
	const plan = await planFreeSlots(ctx, slotNames, { preflightErrors: options.preflightErrors });
	if (plan.type === "failure") return plan;
	const cleanup = await planReleaseCleanup(ctx, plan.outcome.targets, options.cleanupActions ?? [], { trunkBranch: plan.outcome.trunk_branch });
	return { type: "ok" as const, outcome: { plan: plan.outcome, cleanup } };
}

export async function executeFreeRelease(ctx: RepoSlotContext, plan: SlotFreePlan, cleanupActions: readonly SlotFreeCleanupAction[] = []) {
	const freed = await executeFreePlan(ctx, plan);
	if (freed.type === "failure") return freed;
	const cleanup = await executeReleaseCleanup(ctx, freed.outcome.freed, cleanupActions, { trunkBranch: plan.trunk_branch });
	return { type: "ok" as const, outcome: { outcome: freed.outcome, cleanup } };
}

export async function planGcRelease(ctx: RepoSlotContext, cleanupActions: readonly SlotFreeCleanupAction[] = []) {
	const plan = await planGc(ctx);
	if (plan.type === "failure") return plan;
	const cleanup = await planGcCleanup(ctx, plan.outcome, cleanupActions);
	return { type: "ok" as const, outcome: { plan: plan.outcome, cleanup, outcome: outcomeFromGcPlan(plan.outcome, { isDryRun: true, cleanup }) } };
}

export async function executeGcRelease(ctx: RepoSlotContext, plan: SlotGcPlan, cleanupActions: readonly SlotFreeCleanupAction[] = []) {
	return await executeGcPlan(ctx, plan, { cleanupActions });
}
