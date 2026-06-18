import type { SlotCliContext } from "../context.ts";
import { prFailureMessage } from "../gateways/pr.ts";
import { assignedSlotRecords, slotOperationMessage, type LifecycleResult } from "./common.ts";
import { buildSlotInventory } from "../inventory.ts";
import { ensureSlotsMetadataDir } from "../repo-context.ts";
import { cleanupErrorCount, executeReleaseCleanup, planReleaseCleanup, type SlotFreeCleanupAction, type SlotFreeCleanupResult } from "./release-cleanup.ts";
import { type FreedSlot, releaseAssignedSlotTarget } from "./release-target.ts";

export type SlotGcAction = "freed" | "would_free" | "kept_open_pr" | "kept_no_pr" | "skipped_dirty" | "skipped_operation" | "error";

export interface SlotGcEntry {
	slot_name: string;
	branch_name: string;
	worktree_path: string;
	action: SlotGcAction;
	pr_number: number | null;
	pr_state: string | null;
	pr_url: string | null;
	message: string | null;
	cleanup: SlotFreeCleanupResult[];
}

export interface SlotGcPlan {
	entries: SlotGcEntry[];
	trunkBranch: string;
}

export interface SlotGcOutcome {
	entries: SlotGcEntry[];
	freed_count: number;
	kept_count: number;
	skipped_count: number;
	error_count: number;
	cleanup_error_count: number;
	dry_run: boolean;
	cancelled: boolean;
}

export async function planGc(ctx: SlotCliContext): Promise<LifecycleResult<SlotGcPlan>> {
	if (ctx.repo.type !== "repo") return failure(ctx.repo.errorType, ctx.repo.message);
	await ensureSlotsMetadataDir(ctx.repo, ctx.storage);
	const inventory = await buildSlotInventory(ctx.git, { mainRepoRoot: ctx.repo.mainRepoRoot });
	if (inventory.records.length === 0) return failure("pool_empty", "No managed slots configured. Run `slot init --size N` first.");
	const entries: SlotGcEntry[] = [];
	for (const record of assignedSlotRecords(inventory.records)) {
		if (record.branch === null) continue;
		if (record.operation !== null) {
			entries.push(entryFromRecord(record, "skipped_operation", { message: slotOperationMessage(record, { action: "running slot gc" }) }));
			continue;
		}
		const lookup = await ctx.pr.getPrForBranch(record.branch);
		if (lookup.type === "missing") {
			entries.push(entryFromRecord(record, "kept_no_pr", { message: "no matching PR" }));
			continue;
		}
		if (lookup.type === "failure") {
			entries.push(entryFromRecord(record, "error", { message: prFailureMessage(lookup.failure, "gh pr view") }));
			continue;
		}
		if (lookup.pr.state === "OPEN") {
			entries.push(entryFromRecord(record, "kept_open_pr", { prNumber: lookup.pr.number, prState: lookup.pr.state, prUrl: lookup.pr.url, message: "PR is open" }));
			continue;
		}
		entries.push(entryFromRecord(record, "would_free", { prNumber: lookup.pr.number, prState: lookup.pr.state, prUrl: lookup.pr.url, message: `PR is ${lookup.pr.state.toLowerCase()}` }));
	}
	return ok({ entries, trunkBranch: await ctx.git.getTrunkBranch() });
}

export async function planGcCleanup(ctx: SlotCliContext, plan: SlotGcPlan, cleanupActions: readonly SlotFreeCleanupAction[]): Promise<SlotGcPlan> {
	if (cleanupActions.length === 0) return plan;
	const cleanupBySlot = await cleanupBySlotName(ctx, plan.entries.filter((entry) => entry.action === "would_free"), cleanupActions, false);
	return { ...plan, entries: plan.entries.map((entry) => ({ ...entry, cleanup: cleanupBySlot.get(entry.slot_name) ?? [] })) };
}

export async function executeGcPlan(ctx: SlotCliContext, plan: SlotGcPlan, options: { cleanupActions?: readonly SlotFreeCleanupAction[] | undefined } = {}): Promise<LifecycleResult<SlotGcOutcome>> {
	if (ctx.repo.type !== "repo") return failure(ctx.repo.errorType, ctx.repo.message);
	const entries: SlotGcEntry[] = [];
	for (const entry of plan.entries) {
		if (entry.action !== "would_free") {
			entries.push(entry);
			continue;
		}
		const inventory = await buildSlotInventory(ctx.git, { mainRepoRoot: ctx.repo.mainRepoRoot });
		const released = await releaseAssignedSlotTarget(ctx.git, inventory, { slotName: entry.slot_name, branchName: entry.branch_name }, plan.trunkBranch);
		if (released.type === "released") {
			const cleanup = await executeReleaseCleanup(ctx, [released.freed], options.cleanupActions ?? []);
			entries.push({ ...entry, action: "freed", message: "freed", cleanup: [...cleanup] });
			continue;
		}
		if (released.reason === "dirty_worktree") entries.push({ ...entry, action: "skipped_dirty", message: released.message });
		else if (released.reason === "operation_in_progress") entries.push({ ...entry, action: "skipped_operation", message: released.message });
		else entries.push({ ...entry, action: "error", message: released.message });
	}
	return ok(outcomeFromGcEntries(entries, { dryRun: false, cancelled: false }));
}

export function outcomeFromGcPlan(plan: SlotGcPlan, options: { dryRun: boolean; cancelled: boolean }): SlotGcOutcome {
	return outcomeFromGcEntries(plan.entries, options);
}

function outcomeFromGcEntries(entries: readonly SlotGcEntry[], options: { dryRun: boolean; cancelled: boolean }): SlotGcOutcome {
	return {
		entries: entries.map((entry) => ({ ...entry, cleanup: [...entry.cleanup] })),
		freed_count: entries.filter((entry) => entry.action === "freed" || entry.action === "would_free").length,
		kept_count: entries.filter((entry) => entry.action === "kept_open_pr" || entry.action === "kept_no_pr").length,
		skipped_count: entries.filter((entry) => entry.action === "skipped_dirty" || entry.action === "skipped_operation").length,
		error_count: entries.filter((entry) => entry.action === "error").length,
		cleanup_error_count: entries.reduce((count, entry) => count + cleanupErrorCount(entry.cleanup), 0),
		dry_run: options.dryRun,
		cancelled: options.cancelled,
	};
}

async function cleanupBySlotName(ctx: SlotCliContext, entries: readonly SlotGcEntry[], cleanupActions: readonly SlotFreeCleanupAction[], shouldExecute: boolean): Promise<Map<string, SlotFreeCleanupResult[]>> {
	const result = new Map<string, SlotFreeCleanupResult[]>();
	for (const entry of entries) {
		const target: FreedSlot = { slot_name: entry.slot_name, branch_name: entry.branch_name, worktree_path: entry.worktree_path };
		const cleanup = shouldExecute ? await executeReleaseCleanup(ctx, [target], cleanupActions) : await planReleaseCleanup(ctx, [target], cleanupActions);
		result.set(entry.slot_name, [...cleanup]);
	}
	return result;
}

function entryFromRecord(record: { slotName: string; branch: string | null; path: string }, action: SlotGcAction, options: { prNumber?: number | undefined; prState?: string | undefined; prUrl?: string | undefined; message?: string | undefined } = {}): SlotGcEntry {
	if (record.branch === null) throw new Error(`slot ${record.slotName} is not assigned`);
	return {
		slot_name: record.slotName,
		branch_name: record.branch,
		worktree_path: record.path,
		action,
		pr_number: options.prNumber ?? null,
		pr_state: options.prState ?? null,
		pr_url: options.prUrl ?? null,
		message: options.message ?? null,
		cleanup: [],
	};
}

function ok<T>(outcome: T): LifecycleResult<T> {
	return { type: "ok", outcome };
}

function failure<T>(errorType: string, message: string): LifecycleResult<T> {
	return { type: "failure", failure: { error_type: errorType, message } };
}
