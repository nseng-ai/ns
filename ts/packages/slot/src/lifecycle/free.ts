import type { SlotCliContext } from "../context.ts";
import { buildSlotInventory, findBySlot, type SlotRecord } from "../inventory.ts";
import { ensureSlotsMetadataDir } from "../repo-context.ts";
import { slotOperationMessage, type LifecycleResult } from "./common.ts";
import { cleanupErrorCount, executeReleaseCleanup, planReleaseCleanup, type SlotFreeCleanupAction, type SlotFreeCleanupResult } from "./release-cleanup.ts";
import { type FreedSlot, releaseAssignedSlotTarget, type ReleaseTarget } from "./release-target.ts";

export interface SlotFreePlan {
	targets: FreedSlot[];
	skipped: string[];
	cleanup: SlotFreeCleanupResult[];
	trunkBranch: string;
}

export interface SlotFreeOutcome {
	freed: FreedSlot[];
	would_free: FreedSlot[];
	cleanup: SlotFreeCleanupResult[];
	skipped: string[];
	dry_run: boolean;
	cancelled: boolean;
	cleanup_error_count: number;
}

export async function planFreeSlots(ctx: SlotCliContext, slotNames: readonly string[], options: { preflightErrors?: readonly string[] | undefined; skipped?: readonly string[] | undefined; cleanupActions?: readonly SlotFreeCleanupAction[] | undefined } = {}): Promise<LifecycleResult<SlotFreePlan>> {
	if (ctx.repo.type !== "repo") return failure(ctx.repo.errorType, ctx.repo.message);
	await ensureSlotsMetadataDir(ctx.repo, ctx.storage);
	const inventory = await buildSlotInventory(ctx.git, { mainRepoRoot: ctx.repo.mainRepoRoot });
	if (inventory.records.length === 0) return failure("pool_empty", "No managed slots configured. Run `slot init --size N` first.");
	const errors = [...options.preflightErrors ?? []];
	const targets: FreedSlot[] = [];
	for (const slotName of slotNames) {
		const record = findBySlot(inventory, slotName);
		const validation = await validateFreeTarget(ctx, record, slotName);
		if (validation.type === "error") errors.push(validation.message);
		else targets.push(validation.freed);
	}
	if (errors.length > 0) return failure("invalid_slot_args", errors.join("\n"));
	const trunkBranch = await ctx.git.getTrunkBranch();
	const cleanup = await planReleaseCleanup(ctx, targets, options.cleanupActions ?? []);
	return ok({ targets, skipped: [...options.skipped ?? []], cleanup: [...cleanup], trunkBranch });
}

export async function executeFreePlan(ctx: SlotCliContext, plan: SlotFreePlan, options: { cleanupActions?: readonly SlotFreeCleanupAction[] | undefined } = {}): Promise<LifecycleResult<SlotFreeOutcome>> {
	if (ctx.repo.type !== "repo") return failure(ctx.repo.errorType, ctx.repo.message);
	const freed: FreedSlot[] = [];
	for (const target of plan.targets) {
		const inventory = await buildSlotInventory(ctx.git, { mainRepoRoot: ctx.repo.mainRepoRoot });
		const result = await releaseAssignedSlotTarget(ctx.git, inventory, { slotName: target.slot_name, branchName: target.branch_name }, plan.trunkBranch);
		if (result.type === "released") {
			freed.push(result.freed);
			continue;
		}
		const suffix = freed.length === 0 ? "" : ` Already freed: ${freed.map((slot) => slot.slot_name).join(", ")}.`;
		return failure(result.reason === "detach_failed" ? "slot_allocation_error" : result.reason, `${result.message}${suffix}`);
	}
	const cleanup = await executeReleaseCleanup(ctx, freed, options.cleanupActions ?? []);
	return ok({ freed, would_free: [], cleanup: [...cleanup], skipped: [...plan.skipped], dry_run: false, cancelled: false, cleanup_error_count: cleanupErrorCount(cleanup) });
}

export function dryRunFreeOutcome(plan: SlotFreePlan): SlotFreeOutcome {
	return { freed: [], would_free: [...plan.targets], cleanup: [...plan.cleanup], skipped: [...plan.skipped], dry_run: true, cancelled: false, cleanup_error_count: cleanupErrorCount(plan.cleanup) };
}

export function cancelledFreeOutcome(plan: SlotFreePlan): SlotFreeOutcome {
	return { freed: [], would_free: [...plan.targets], cleanup: [...plan.cleanup], skipped: [...plan.skipped], dry_run: false, cancelled: true, cleanup_error_count: 0 };
}

async function validateFreeTarget(ctx: SlotCliContext, record: SlotRecord | null, slotName: string): Promise<{ type: "ok"; freed: FreedSlot } | { type: "error"; message: string }> {
	if (record === null || record.branch === null) return { type: "error", message: `${slotName} is not currently assigned. Run \`slot list\` to see the pool.` };
	if (record.operation !== null) return { type: "error", message: slotOperationMessage(record, { action: "freeing" }) };
	if (await ctx.git.hasUncommittedChanges(record.path)) return { type: "error", message: `${record.slotName} has uncommitted changes at ${record.path}. Commit or stash before freeing.` };
	return { type: "ok", freed: { slot_name: record.slotName, branch_name: record.branch, worktree_path: record.path } };
}

function ok<T>(outcome: T): LifecycleResult<T> {
	return { type: "ok", outcome };
}

function failure<T>(errorType: string, message: string): LifecycleResult<T> {
	return { type: "failure", failure: { error_type: errorType, message } };
}
