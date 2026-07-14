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
	return collectOccupancyConflicts(options);
}

export function isRebaseOperation(operation: string): boolean {
	return operation.includes("rebase");
}

function collectOccupancyConflicts(options: {
	readonly occupancies: readonly WorktreeOccupancy[];
	readonly records: readonly SlotRecord[];
	readonly branches: readonly string[];
	readonly currentPath: string;
}): ScopedSlotConflict[] {
	const scopedBranches = new Set(options.branches);
	const recordsByPath = new Map(options.records.map((record) => [record.path, record]));
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
		if (!isRebaseOperation(occupancy.operation)) continue;
		const record = recordsByPath.get(occupancy.path);
		conflicts.push(
			record === undefined
				? {
						type: "rebase-in-progress",
						branch: occupancy.branch,
						worktreePath: occupancy.path,
						operation: occupancy.operation,
					}
				: {
						type: "slot-rebase-in-progress",
						branch: occupancy.branch,
						slotName: record.slotName,
						worktreePath: occupancy.path,
						operation: occupancy.operation,
					},
		);
	}
	return conflicts;
}
