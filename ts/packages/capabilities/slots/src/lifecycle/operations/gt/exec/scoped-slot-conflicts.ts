import type { WorktreeOccupancy } from "../../../../core/gateways/repository.ts";
import type { SlotRecord } from "../../../../core/inventory.ts";

export type ScopedSlotConflict =
	| {
			type: "checked-out-elsewhere";
			branch: string;
			worktreePath: string;
	  }
	| {
			type: "rebase-in-progress";
			branch: string;
			worktreePath: string;
			operation: string;
	  }
	| {
			type: "slot-rebase-in-progress";
			branch: string;
			worktreePath: string;
			operation: string;
			slotName: string;
	  };

export function collectScopedSlotConflicts(options: {
	readonly occupancies: readonly WorktreeOccupancy[];
	readonly records: readonly SlotRecord[];
	readonly branches: readonly string[];
	readonly currentPath: string;
}): ScopedSlotConflict[] {
	return [...collectOccupancyConflicts(options), ...collectSlotRebaseConflicts(options)];
}

export function isRebaseOperation(operation: string): boolean {
	return operation.includes("rebase");
}

function collectOccupancyConflicts(options: {
	readonly occupancies: readonly WorktreeOccupancy[];
	readonly branches: readonly string[];
	readonly currentPath: string;
}): ScopedSlotConflict[] {
	const scopedBranches = new Set(options.branches);
	const conflicts: ScopedSlotConflict[] = [];
	for (const occupancy of options.occupancies) {
		if (occupancy.branch === null || !scopedBranches.has(occupancy.branch)) continue;
		if (occupancy.operation === "checked-out") {
			if (occupancy.path !== options.currentPath) {
				conflicts.push({
					type: "checked-out-elsewhere",
					branch: occupancy.branch,
					worktreePath: occupancy.path,
				});
			}
			continue;
		}
		if (isRebaseOperation(occupancy.operation)) {
			conflicts.push({
				type: "rebase-in-progress",
				branch: occupancy.branch,
				worktreePath: occupancy.path,
				operation: occupancy.operation,
			});
		}
	}
	return conflicts;
}

function collectSlotRebaseConflicts(options: {
	readonly records: readonly SlotRecord[];
	readonly branches: readonly string[];
}): ScopedSlotConflict[] {
	const scopedBranches = new Set(options.branches);
	return options.records.flatMap((record) => {
		if (record.branch === null || record.operation === null) return [];
		if (!scopedBranches.has(record.branch) || !isRebaseOperation(record.operation)) return [];
		return [
			{
				type: "slot-rebase-in-progress" as const,
				branch: record.branch,
				slotName: record.slotName,
				worktreePath: record.path,
				operation: record.operation,
			},
		];
	});
}
