import type { RepoSlotContext } from "../context.ts";
import type { PrState, PrSummary } from "../gateways/pr.ts";
import { prFailureMessage } from "../gateways/pr.ts";
import { buildSlotInventory, type SlotRecord } from "../inventory.ts";
import { slotOperationMessage, type LifecycleResult } from "./common.ts";
import { executeReleaseCleanup, planReleaseCleanup, type SlotFreeCleanupAction, type SlotFreeCleanupResult } from "./release-cleanup.ts";
import { detachFailureMessage } from "./free.ts";
import { releaseAssignedSlotTarget, type FreedSlot, type ReleaseTargetFailure } from "./release-target.ts";

export type SlotGcAction = "freed" | "would_free" | "kept_open_pr" | "kept_no_pr" | "skipped_dirty" | "skipped_operation" | "error";

export interface SlotGcEntry {
	slot_name: string;
	branch_name: string;
	worktree_path: string;
	action: SlotGcAction;
	pr_number: number | null;
	pr_state: PrState | null;
	pr_url: string | null;
	message: string | null;
	cleanup: readonly SlotFreeCleanupResult[];
}

export interface SlotGcPlan {
	entries: readonly SlotGcEntry[];
	would_free_count: number;
}

export interface SlotGcOutcome {
	entries: readonly SlotGcEntry[];
	freed_count: number;
	kept_count: number;
	skipped_count: number;
	error_count: number;
	dry_run: boolean;
	cleanup_error_count: number;
}

export async function planGc(ctx: RepoSlotContext): Promise<LifecycleResult<SlotGcPlan>> {
	const inventory = await buildSlotInventory(ctx.git, { mainRepoRoot: ctx.repo.mainRepoRoot });
	if (inventory.records.length === 0) return { type: "failure", failure: { error_type: "pool_empty", message: "No managed slots configured. Run `slot init --size N` first." } };
	const entries: SlotGcEntry[] = [];
	let wouldFreeCount = 0;
	for (const record of inventory.records) {
		if (record.branch === null) continue;
		if (record.operation !== null) {
			entries.push(entryFromRecord(record, "skipped_operation", { message: slotOperationMessage(record, { action: "running slot gc" }) }));
			continue;
		}
		const lookup = await ctx.pr.getPrForBranch(record.branch);
		if (lookup.type === "miss") {
			entries.push(entryFromRecord(record, "kept_no_pr"));
			continue;
		}
		if (lookup.type === "failure") {
			entries.push(entryFromRecord(record, "error", { message: prFailureMessage(lookup.failure, "gh pr view exited") }));
			continue;
		}
		if (lookup.pr.state === "OPEN") {
			entries.push(entryFromRecord(record, "kept_open_pr", { pr: lookup.pr }));
			continue;
		}
		entries.push(entryFromRecord(record, "would_free", { pr: lookup.pr }));
		wouldFreeCount += 1;
	}
	return { type: "ok", outcome: { entries, would_free_count: wouldFreeCount } };
}

export async function planGcCleanup(ctx: RepoSlotContext, plan: SlotGcPlan, cleanupActions: readonly SlotFreeCleanupAction[]): Promise<readonly SlotFreeCleanupResult[]> {
	const targets = gcFreeTargets(plan.entries);
	if (targets.length === 0 || cleanupActions.length === 0) return [];
	return await planReleaseCleanup(ctx, targets, cleanupActions, { trunkBranch: await ctx.git.getTrunkBranch() });
}

export async function executeGcPlan(ctx: RepoSlotContext, plan: SlotGcPlan, options: { cleanupActions?: readonly SlotFreeCleanupAction[] | undefined } = {}): Promise<SlotGcOutcome> {
	const inventory = await buildSlotInventory(ctx.git, { mainRepoRoot: ctx.repo.mainRepoRoot });
	const trunk = await ctx.git.getTrunkBranch();
	let entries: SlotGcEntry[] = [];
	const freedEntries: SlotGcEntry[] = [];
	for (const entry of plan.entries) {
		if (entry.action !== "would_free") {
			entries.push(entry);
			continue;
		}
		const result = await releaseAssignedSlotTarget(ctx.git, inventory, freedSlotFromGcEntry(entry), trunk);
		if ("reason" in result) {
			entries.push(entryFromReleaseFailure(entry, result));
			continue;
		}
		const freed = withAction(entry, "freed");
		entries.push(freed);
		freedEntries.push(freed);
	}
	const cleanupActions = options.cleanupActions ?? [];
	if (cleanupActions.length > 0 && freedEntries.length > 0) {
		const cleanup = await executeReleaseCleanup(ctx, gcFreeTargets(freedEntries), cleanupActions, { trunkBranch: trunk });
		entries = withCleanupBySlot(entries, cleanup);
	}
	return outcomeFromEntries(entries, false);
}

export function outcomeFromGcPlan(plan: SlotGcPlan, options: { dryRun: boolean; cleanup?: readonly SlotFreeCleanupResult[] | undefined }): SlotGcOutcome {
	const entries = options.cleanup === undefined || options.cleanup.length === 0 ? plan.entries : withCleanupBySlot(plan.entries, options.cleanup);
	return outcomeFromEntries(entries, options.dryRun);
}

function entryFromRecord(record: SlotRecord, action: SlotGcAction, options: { pr?: PrSummary | undefined; message?: string | undefined } = {}): SlotGcEntry {
	if (record.branch === null) throw new Error(`gc record ${record.slotName} is not assigned`);
	return {
		slot_name: record.slotName,
		branch_name: record.branch,
		worktree_path: record.path,
		action,
		pr_number: options.pr?.number ?? null,
		pr_state: options.pr?.state ?? null,
		pr_url: options.pr?.url ?? null,
		message: options.message ?? null,
		cleanup: [],
	};
}

function entryFromReleaseFailure(entry: SlotGcEntry, failure: ReleaseTargetFailure): SlotGcEntry {
	if (failure.reason === "slot_not_assigned") return withAction(entry, "error", `slot ${entry.slot_name} was not assigned to ${entry.branch_name} during free (state changed between plan and execute).`);
	if (failure.reason === "operation_in_progress") return withAction(entry, "skipped_operation", `${failure.slot_name} holds '${failure.branch_name}' with a ${failure.operation ?? "operation"} in progress at ${failure.worktree_path}; cannot continue running slot gc.`);
	if (failure.reason === "dirty_worktree") return withAction(entry, "skipped_dirty", `worktree has uncommitted changes at ${failure.worktree_path}`);
	return withAction(entry, "error", detachFailureMessage(failure));
}

function withAction(entry: SlotGcEntry, action: SlotGcAction, message: string | null = null): SlotGcEntry {
	return { ...entry, action, message };
}

function freedSlotFromGcEntry(entry: SlotGcEntry): FreedSlot {
	return { slot_name: entry.slot_name, branch_name: entry.branch_name, worktree_path: entry.worktree_path };
}

function gcFreeTargets(entries: readonly SlotGcEntry[]): readonly FreedSlot[] {
	return entries.filter((entry) => entry.action === "would_free" || entry.action === "freed").map(freedSlotFromGcEntry);
}

function withCleanupBySlot(entries: readonly SlotGcEntry[], cleanup: readonly SlotFreeCleanupResult[]): SlotGcEntry[] {
	return entries.map((entry) => ({ ...entry, cleanup: cleanup.filter((result) => result.slot_name === entry.slot_name && result.branch_name === entry.branch_name) }));
}

function outcomeFromEntries(entries: readonly SlotGcEntry[], dryRun: boolean): SlotGcOutcome {
	const counts = countGcActions(entries);
	return { entries, ...counts, dry_run: dryRun, cleanup_error_count: entries.flatMap((entry) => entry.cleanup).filter((result) => result.status === "error").length };
}

function countGcActions(entries: readonly SlotGcEntry[]): { freed_count: number; kept_count: number; skipped_count: number; error_count: number } {
	let freedCount = 0;
	let keptCount = 0;
	let skippedCount = 0;
	let errorCount = 0;
	for (const entry of entries) {
		if (entry.action === "freed" || entry.action === "would_free") freedCount += 1;
		if (entry.action === "kept_open_pr" || entry.action === "kept_no_pr") keptCount += 1;
		if (entry.action === "skipped_dirty" || entry.action === "skipped_operation") skippedCount += 1;
		if (entry.action === "error") errorCount += 1;
	}
	return { freed_count: freedCount, kept_count: keptCount, skipped_count: skippedCount, error_count: errorCount };
}
