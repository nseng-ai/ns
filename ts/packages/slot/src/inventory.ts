import { basename } from "node:path";

import type { SlotGitGateway, WorktreeInfo, WorktreeOccupancy } from "./gateways/git.ts";
import { extractSlotNumber } from "./naming.ts";

export type SlotStatus = "assigned" | "available";

export interface SlotRecord {
	slotName: string;
	slotNumber: number;
	path: string;
	branch: string | null;
	operation: string | null;
}

export interface SlotInventory {
	records: readonly SlotRecord[];
	mainWorktree: WorktreeInfo | null;
	branchOccupancies: readonly WorktreeOccupancy[];
}

export type SlotMatch =
	| { kind: "slot"; record: SlotRecord }
	| { kind: "main"; worktree: WorktreeInfo };

export function slotStatus(record: SlotRecord): SlotStatus {
	return record.branch === null && record.operation === null ? "available" : "assigned";
}

export function isSlotAvailable(record: SlotRecord): boolean {
	return record.branch === null && record.operation === null;
}

export function poolSize(inventory: SlotInventory): number {
	return inventory.records.length;
}

export function findByBranch(inventory: SlotInventory, branch: string): SlotMatch | null {
	const record = inventory.records.find((candidate) => candidate.branch === branch);
	if (record !== undefined) return { kind: "slot", record };
	if (inventory.mainWorktree?.branch === branch)
		return { kind: "main", worktree: inventory.mainWorktree };
	return null;
}

export function findOccupancyByBranch(
	inventory: SlotInventory,
	branch: string,
): WorktreeOccupancy | null {
	return inventory.branchOccupancies.find((occupancy) => occupancy.branch === branch) ?? null;
}

export function findBySlot(inventory: SlotInventory, slotName: string): SlotRecord | null {
	return inventory.records.find((record) => record.slotName === slotName) ?? null;
}

export async function lowestAvailable(
	inventory: SlotInventory,
	git: SlotGitGateway,
): Promise<SlotRecord | null> {
	for (const record of inventory.records) {
		if (isSlotAvailable(record) && !(await git.hasUncommittedChanges(record.path))) return record;
	}
	return null;
}

export async function buildSlotInventory(
	git: SlotGitGateway,
	options: { mainRepoRoot?: string | undefined } = {},
): Promise<SlotInventory> {
	const branchOccupancies = await git.listBranchOccupancies();
	const occupancyByPath = new Map(
		branchOccupancies.map((occupancy) => [occupancy.path, occupancy]),
	);
	let mainWorktree: WorktreeInfo | null = null;
	const records: SlotRecord[] = [];
	for (const worktree of await git.listWorktrees()) {
		if (options.mainRepoRoot !== undefined && worktree.path === options.mainRepoRoot) {
			mainWorktree = worktree;
			continue;
		}
		const slotNumberText = extractSlotNumber(basename(worktree.path));
		if (slotNumberText === null) continue;
		const occupancy = occupancyByPath.get(worktree.path);
		const isOperation = occupancy !== undefined && occupancy.operation !== "checked-out";
		records.push({
			slotName: basename(worktree.path),
			slotNumber: Number(slotNumberText),
			path: worktree.path,
			branch: isOperation ? occupancy.branch : worktree.branch,
			operation: isOperation ? occupancy.operation : null,
		});
	}
	records.sort((left, right) => left.slotNumber - right.slotNumber);
	return { records, mainWorktree, branchOccupancies };
}
