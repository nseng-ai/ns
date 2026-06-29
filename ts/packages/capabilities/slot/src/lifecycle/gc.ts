import type { RepoSlotContext } from "../context.ts";
import type { PrState, PrSummary } from "../gateways/pr.ts";
import { prFailureMessage } from "../gateways/pr.ts";
import { buildSlotInventory, type SlotRecord } from "../inventory.ts";
import { slotOperationMessage, type LifecycleResult } from "./common.ts";
import {
	executeReleaseCleanup,
	planReleaseCleanup,
	type SlotFreeCleanupAction,
	type SlotFreeCleanupResult,
} from "./release-cleanup.ts";
import { detachFailureMessage } from "./free.ts";
import {
	releaseAssignedSlotTarget,
	type FreedSlot,
	type ReleaseTargetFailure,
} from "./release-target.ts";

export type SlotGcAction =
	| "freed"
	| "would-free"
	| "kept-open-pr"
	| "kept-no-pr"
	| "skipped-dirty"
	| "skipped-operation"
	| "error";

export interface SlotGcEntry {
	slotName: string;
	branchName: string;
	worktreePath: string;
	action: SlotGcAction;
	prNumber: number | null;
	prState: PrState | null;
	prUrl: string | null;
	message: string | null;
	cleanup: readonly SlotFreeCleanupResult[];
}

export interface SlotGcPlan {
	entries: readonly SlotGcEntry[];
	wouldFreeCount: number;
}

export interface SlotGcOutcome {
	entries: readonly SlotGcEntry[];
	freedCount: number;
	keptCount: number;
	skippedCount: number;
	errorCount: number;
	dryRun: boolean;
	cleanupErrorCount: number;
}

export async function planGc(ctx: RepoSlotContext): Promise<LifecycleResult<SlotGcPlan>> {
	const inventory = await buildSlotInventory(ctx.git, { mainRepoRoot: ctx.repo.mainRepoRoot });
	if (inventory.records.length === 0)
		return {
			type: "failure",
			failure: {
				errorType: "pool-empty",
				message: "No managed slots configured. Run `slot init --size N` first.",
			},
		};
	const prRecords = inventory.records.filter(
		(record) => record.branch !== null && record.operation === null,
	);
	const prBranches = prRecords.flatMap((record) => (record.branch === null ? [] : [record.branch]));
	const prLookup = await ctx.pr.getPrsForBranches(prBranches);
	if (prLookup.type === "failure")
		return {
			type: "failure",
			failure: {
				errorType: "pr-lookup-failed",
				message: prFailureMessage(prLookup.failure, "gh api graphql exited"),
			},
		};
	const entries: SlotGcEntry[] = [];
	let wouldFreeCount = 0;
	for (const record of inventory.records) {
		if (record.branch === null) continue;
		if (record.operation !== null) {
			entries.push(
				entryFromRecord(record, "skipped-operation", {
					message: slotOperationMessage(record, { action: "running slot gc" }),
				}),
			);
			continue;
		}
		const lookup = prLookup.resultsByBranch.get(record.branch);
		if (lookup === undefined)
			return {
				type: "failure",
				failure: {
					errorType: "pr-lookup-failed",
					message: `PR lookup did not return a result for ${record.branch}`,
				},
			};
		if (lookup.type === "miss") {
			entries.push(entryFromRecord(record, "kept-no-pr"));
			continue;
		}
		if (lookup.type === "failure")
			return {
				type: "failure",
				failure: {
					errorType: "pr-lookup-failed",
					message: prFailureMessage(lookup.failure, "gh api graphql exited"),
				},
			};
		if (lookup.pr.state === "OPEN") {
			entries.push(entryFromRecord(record, "kept-open-pr", { pr: lookup.pr }));
			continue;
		}
		entries.push(entryFromRecord(record, "would-free", { pr: lookup.pr }));
		wouldFreeCount += 1;
	}
	return { type: "ok", outcome: { entries, wouldFreeCount: wouldFreeCount } };
}

export async function planGcCleanup(
	ctx: RepoSlotContext,
	plan: SlotGcPlan,
	cleanupActions: readonly SlotFreeCleanupAction[],
): Promise<readonly SlotFreeCleanupResult[]> {
	const targets = gcFreeTargets(plan.entries);
	if (targets.length === 0 || cleanupActions.length === 0) return [];
	return await planReleaseCleanup({
		ctx,
		targets,
		cleanupActions,
		trunkBranch: await ctx.git.getTrunkBranch(),
	});
}

export async function executeGcPlan(
	ctx: RepoSlotContext,
	plan: SlotGcPlan,
	options: { cleanupActions?: readonly SlotFreeCleanupAction[] | undefined } = {},
): Promise<SlotGcOutcome> {
	const inventory = await buildSlotInventory(ctx.git, { mainRepoRoot: ctx.repo.mainRepoRoot });
	const trunk = await ctx.git.getTrunkBranch();
	let entries: SlotGcEntry[] = [];
	const freedEntries: SlotGcEntry[] = [];
	for (const entry of plan.entries) {
		if (entry.action !== "would-free") {
			entries.push(entry);
			continue;
		}
		const result = await releaseAssignedSlotTarget({
			git: ctx.git,
			inventory,
			target: freedSlotFromGcEntry(entry),
			trunkBranch: trunk,
		});
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
		const cleanup = await executeReleaseCleanup({
			ctx,
			targets: gcFreeTargets(freedEntries),
			cleanupActions,
			trunkBranch: trunk,
		});
		entries = withCleanupBySlot(entries, cleanup);
	}
	return outcomeFromEntries(entries, false);
}

export function outcomeFromGcPlan(
	plan: SlotGcPlan,
	options: { isDryRun: boolean; cleanup?: readonly SlotFreeCleanupResult[] | undefined },
): SlotGcOutcome {
	const entries =
		options.cleanup === undefined || options.cleanup.length === 0
			? plan.entries
			: withCleanupBySlot(plan.entries, options.cleanup);
	return outcomeFromEntries(entries, options.isDryRun);
}

function entryFromRecord(
	record: SlotRecord,
	action: SlotGcAction,
	options: { pr?: PrSummary | undefined; message?: string | undefined } = {},
): SlotGcEntry {
	if (record.branch === null) throw new Error(`gc record ${record.slotName} is not assigned`);
	return {
		slotName: record.slotName,
		branchName: record.branch,
		worktreePath: record.path,
		action,
		prNumber: options.pr?.number ?? null,
		prState: options.pr?.state ?? null,
		prUrl: options.pr?.url ?? null,
		message: options.message ?? null,
		cleanup: [],
	};
}

function entryFromReleaseFailure(entry: SlotGcEntry, failure: ReleaseTargetFailure): SlotGcEntry {
	if (failure.reason === "slot-not-assigned")
		return withAction(
			entry,
			"error",
			`slot ${entry.slotName} was not assigned to ${entry.branchName} during free (state changed between plan and execute).`,
		);
	if (failure.reason === "operation-in-progress")
		return withAction(
			entry,
			"skipped-operation",
			`${failure.slotName} holds '${failure.branchName}' with a ${failure.operation ?? "operation"} in progress at ${failure.worktreePath}; cannot continue running slot gc.`,
		);
	if (failure.reason === "dirty-worktree")
		return withAction(
			entry,
			"skipped-dirty",
			`worktree has uncommitted changes at ${failure.worktreePath}`,
		);
	return withAction(entry, "error", detachFailureMessage(failure));
}

function withAction(
	entry: SlotGcEntry,
	action: SlotGcAction,
	message: string | null = null,
): SlotGcEntry {
	return { ...entry, action, message };
}

function freedSlotFromGcEntry(entry: SlotGcEntry): FreedSlot {
	return {
		slotName: entry.slotName,
		branchName: entry.branchName,
		worktreePath: entry.worktreePath,
	};
}

function gcFreeTargets(entries: readonly SlotGcEntry[]): readonly FreedSlot[] {
	return entries
		.filter((entry) => entry.action === "would-free" || entry.action === "freed")
		.map(freedSlotFromGcEntry);
}

function withCleanupBySlot(
	entries: readonly SlotGcEntry[],
	cleanup: readonly SlotFreeCleanupResult[],
): SlotGcEntry[] {
	return entries.map((entry) => ({
		...entry,
		cleanup: cleanup.filter(
			(result) => result.slotName === entry.slotName && result.branchName === entry.branchName,
		),
	}));
}

function outcomeFromEntries(entries: readonly SlotGcEntry[], isDryRun: boolean): SlotGcOutcome {
	const counts = countGcActions(entries);
	return {
		entries,
		...counts,
		dryRun: isDryRun,
		cleanupErrorCount: entries
			.flatMap((entry) => entry.cleanup)
			.filter((result) => result.status === "error").length,
	};
}

function countGcActions(entries: readonly SlotGcEntry[]): {
	freedCount: number;
	keptCount: number;
	skippedCount: number;
	errorCount: number;
} {
	let freedCount = 0;
	let keptCount = 0;
	let skippedCount = 0;
	let errorCount = 0;
	for (const entry of entries) {
		if (entry.action === "freed" || entry.action === "would-free") freedCount += 1;
		if (entry.action === "kept-open-pr" || entry.action === "kept-no-pr") keptCount += 1;
		if (entry.action === "skipped-dirty" || entry.action === "skipped-operation") skippedCount += 1;
		if (entry.action === "error") errorCount += 1;
	}
	return {
		freedCount: freedCount,
		keptCount: keptCount,
		skippedCount: skippedCount,
		errorCount: errorCount,
	};
}
