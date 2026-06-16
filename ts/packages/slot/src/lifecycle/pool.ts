import { join } from "node:path";

import { buildSlotInventory, poolSize, type SlotInventory, type SlotRecord } from "../inventory.ts";
import { generateSlotName } from "../naming.ts";
import { ensureSlotsMetadataDir } from "../repo-context.ts";
import type { SlotCliContext } from "../context.ts";

export const MIN_POOL_SIZE = 1;
export const MAX_POOL_SIZE = 99;

export interface InitPlan {
	create: readonly number[];
}

export interface ResizePlan {
	create: readonly number[];
	remove: readonly SlotRecord[];
}

export interface SlotInitOutcome {
	created: string[];
	pool_size: number;
	worktrees_dir: string;
}

export interface SlotResizeOutcome {
	previous_pool_size: number;
	pool_size: number;
	created: string[];
	removed: string[];
	worktrees_dir: string;
}

export interface SlotLifecycleFailure {
	error_type: string;
	message: string;
}

export type SlotInitResult = { type: "ok"; outcome: SlotInitOutcome } | { type: "failure"; failure: SlotLifecycleFailure };
export type SlotResizeResult = { type: "ok"; outcome: SlotResizeOutcome } | { type: "failure"; failure: SlotLifecycleFailure };

export function buildInitPlan(targetSize: number): InitPlan {
	return { create: Array.from({ length: targetSize }, (_value, index) => index + 1) };
}

export function buildResizePlan(inventory: SlotInventory, targetSize: number): ResizePlan {
	const currentSize = poolSize(inventory);
	if (targetSize === currentSize) return { create: [], remove: [] };
	if (targetSize > currentSize) {
		const existing = new Set(inventory.records.map((record) => record.slotNumber));
		const needed = targetSize - currentSize;
		const create: number[] = [];
		let candidate = 1;
		while (create.length < needed) {
			if (!existing.has(candidate)) create.push(candidate);
			candidate += 1;
		}
		return { create, remove: [] };
	}
	const sortedRecords = [...inventory.records].sort((left, right) => left.slotNumber - right.slotNumber);
	return { create: [], remove: sortedRecords.slice(targetSize) };
}

export async function initializePool(ctx: SlotCliContext, targetSize: number): Promise<SlotInitResult> {
	if (ctx.repo.type !== "repo") return { type: "failure", failure: { error_type: ctx.repo.errorType, message: ctx.repo.message } };
	const sizeFailure = invalidSizeFailure(targetSize);
	if (sizeFailure !== null) return { type: "failure", failure: sizeFailure };
	const inventory = await buildSlotInventory(ctx.git, { mainRepoRoot: ctx.repo.mainRepoRoot });
	if (poolSize(inventory) > 0) {
		return {
			type: "failure",
			failure: {
				error_type: "pool_already_initialized",
				message: `Pool already has ${poolSize(inventory)} slot(s). Use \`slot resize --size N\` to change capacity.`,
			},
		};
	}
	await ensureSlotsMetadataDir(ctx.repo, ctx.storage);
	const trunk = await ctx.git.getTrunkBranch();
	const created: string[] = [];
	for (const slotNumber of buildInitPlan(targetSize).create) {
		const name = generateSlotName(slotNumber);
		await ctx.git.addDetachedWorktree(join(ctx.repo.worktreesDir, name), trunk);
		created.push(name);
	}
	return { type: "ok", outcome: { created, pool_size: created.length, worktrees_dir: ctx.repo.worktreesDir } };
}

export async function resizePool(ctx: SlotCliContext, targetSize: number): Promise<SlotResizeResult> {
	if (ctx.repo.type !== "repo") return { type: "failure", failure: { error_type: ctx.repo.errorType, message: ctx.repo.message } };
	const sizeFailure = invalidSizeFailure(targetSize);
	if (sizeFailure !== null) return { type: "failure", failure: sizeFailure };
	const inventory = await buildSlotInventory(ctx.git, { mainRepoRoot: ctx.repo.mainRepoRoot });
	const previousPoolSize = poolSize(inventory);
	const plan = buildResizePlan(inventory, targetSize);
	if (plan.create.length === 0 && plan.remove.length === 0) {
		return {
			type: "ok",
			outcome: { previous_pool_size: previousPoolSize, pool_size: previousPoolSize, created: [], removed: [], worktrees_dir: ctx.repo.worktreesDir },
		};
	}
	if (plan.remove.length > 0) {
		const errors = await validateRemovals(ctx, plan.remove);
		if (errors.length > 0) return { type: "failure", failure: { error_type: "resize_unsafe", message: errors.join("\n") } };
	}
	await ensureSlotsMetadataDir(ctx.repo, ctx.storage);
	const trunk = await ctx.git.getTrunkBranch();
	const created: string[] = [];
	for (const slotNumber of plan.create) {
		const name = generateSlotName(slotNumber);
		await ctx.git.addDetachedWorktree(join(ctx.repo.worktreesDir, name), trunk);
		created.push(name);
	}
	const removed: string[] = [];
	for (const record of plan.remove) {
		await ctx.git.removeWorktree(record.path);
		removed.push(record.slotName);
	}
	return {
		type: "ok",
		outcome: {
			previous_pool_size: previousPoolSize,
			pool_size: previousPoolSize + created.length - removed.length,
			created,
			removed,
			worktrees_dir: ctx.repo.worktreesDir,
		},
	};
}

async function validateRemovals(ctx: SlotCliContext, records: readonly SlotRecord[]): Promise<readonly string[]> {
	const errors: string[] = [];
	for (const record of records) {
		if (record.operation !== null) {
			errors.push(slotOperationInProgressMessage(record));
			continue;
		}
		if (record.branch !== null) {
			errors.push(`${record.slotName} is assigned to '${record.branch}'; free it before shrinking the pool.`);
			continue;
		}
		if (await ctx.git.hasUncommittedChanges(record.path)) {
			errors.push(`${record.slotName} at ${record.path} has uncommitted changes; commit or discard before shrinking the pool.`);
		}
	}
	return errors;
}

function slotOperationInProgressMessage(record: SlotRecord): string {
	const branchText = record.branch === null ? "unknown branch" : `'${record.branch}'`;
	return `${record.slotName} is assigned to ${branchText} at ${record.path} with ${record.operation} in progress; finish or abort it before shrinking the pool.`;
}

function invalidSizeFailure(targetSize: number): SlotLifecycleFailure | null {
	if (Number.isInteger(targetSize) && targetSize >= MIN_POOL_SIZE && targetSize <= MAX_POOL_SIZE) return null;
	return { error_type: "invalid_size", message: `--size must be between ${MIN_POOL_SIZE} and ${MAX_POOL_SIZE}.` };
}
