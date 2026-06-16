import { basename } from "node:path";

import type { SlotGitGateway, WorktreeOccupancy } from "./gateways/git.ts";
import { buildSlotInventory, findByBranch, findOccupancyByBranch, lowestAvailable, type SlotInventory, type SlotRecord } from "./inventory.ts";
import { extractSlotNumber } from "./naming.ts";

export type CheckoutPlan =
	| { type: "reuse_assignment"; record: SlotRecord }
	| { type: "branch_in_main_worktree"; mainPath: string }
	| { type: "assign_to_slot"; record: SlotRecord }
	| { type: "branch_in_use"; occupancy: WorktreeOccupancy }
	| { type: "pool_full"; assigned: readonly SlotRecord[] };

export type CurrentWorktreeRedirectAction =
	| { type: "checkout_branch"; branch: string; role: "previous" | "trunk" }
	| { type: "detach_head"; ref: string };

export interface CurrentWorktreeRedirect {
	action: CurrentWorktreeRedirectAction;
	note: string | null;
}

export type CurrentCheckoutPlan =
	| { type: "ok"; plan: CheckoutPlan; branchName: string; redirect: CurrentWorktreeRedirect | null; currentWtNote: string | null }
	| { type: "detached_head"; cwd: string }
	| { type: "dirty_worktree"; cwd: string }
	| { type: "allocation_failure"; message: string };

export async function planCheckout(inventory: SlotInventory, git: SlotGitGateway, branchName: string): Promise<CheckoutPlan> {
	const match = findByBranch(inventory, branchName);
	if (match?.kind === "slot") {
		const occupancy = operationOccupancy(match.record);
		if (occupancy !== null) return { type: "branch_in_use", occupancy };
		return { type: "reuse_assignment", record: match.record };
	}
	if (match?.kind === "main") return { type: "branch_in_main_worktree", mainPath: match.worktree.path };

	const occupancy = findOccupancyByBranch(inventory, branchName);
	if (occupancy !== null) return { type: "branch_in_use", occupancy };

	const target = await lowestAvailable(inventory, git);
	if (target === null) return { type: "pool_full", assigned: inventory.records.filter((record) => record.branch !== null) };
	return { type: "assign_to_slot", record: target };
}

export async function planCurrentWtRedirect(git: SlotGitGateway, options: { cwd: string; movingBranch: string }): Promise<CurrentWorktreeRedirect> {
	const previous = await git.getPreviousBranch(options.cwd);
	const worktrees = await git.listWorktrees();
	if (previous !== null && previous !== options.movingBranch && await git.branchExists(previous)) {
		const conflict = worktrees.find((worktree) => worktree.branch === previous && worktree.path !== options.cwd);
		if (conflict === undefined) return { action: { type: "checkout_branch", branch: previous, role: "previous" }, note: null };
	}

	const trunk = await git.getTrunkBranch();
	if (extractSlotNumber(basename(options.cwd)) !== null) return { action: { type: "detach_head", ref: trunk }, note: null };
	if (trunk === options.movingBranch) return { action: { type: "detach_head", ref: options.movingBranch }, note: null };

	const busyWorktree = worktrees.find((worktree) => worktree.branch === trunk && worktree.path !== options.cwd);
	if (busyWorktree === undefined) return { action: { type: "checkout_branch", branch: trunk, role: "trunk" }, note: null };
	return {
		action: { type: "detach_head", ref: options.movingBranch },
		note: `Trunk branch '${trunk}' is checked out in ${busyWorktree.path}; left ${options.cwd} on a detached HEAD at ${options.movingBranch}.`,
	};
}

export function inventoryWithoutCallerBranchOccupancy(inventory: SlotInventory, options: { cwd: string; movingBranch: string }): SlotInventory {
	return {
		records: inventory.records.map((record) => record.path === options.cwd && record.branch === options.movingBranch ? { ...record, branch: null, operation: null } : record),
		mainWorktree: inventory.mainWorktree?.path === options.cwd && inventory.mainWorktree.branch === options.movingBranch ? { ...inventory.mainWorktree, branch: null } : inventory.mainWorktree,
		branchOccupancies: inventory.branchOccupancies.filter((occupancy) => !(occupancy.path === options.cwd && occupancy.branch === options.movingBranch)),
	};
}

export async function planCurrentCheckout(git: SlotGitGateway, options: { cwd: string; mainRepoRoot?: string | undefined }): Promise<CurrentCheckoutPlan> {
	const currentBranch = await git.getCurrentBranch(options.cwd);
	if (currentBranch.type === "failure") return { type: "allocation_failure", message: `Failed to determine current branch at ${options.cwd}: ${currentBranch.failure.message}` };
	if (currentBranch.type === "detached") return { type: "detached_head", cwd: options.cwd };

	const inventory = await buildSlotInventory(git, { mainRepoRoot: options.mainRepoRoot });
	const alreadyMatch = findByBranch(inventory, currentBranch.branch);
	if (alreadyMatch?.kind === "slot") {
		const plan: CheckoutPlan = { type: "reuse_assignment", record: alreadyMatch.record };
		return { type: "ok", plan, branchName: currentBranch.branch, redirect: null, currentWtNote: null };
	}

	if (await git.hasUncommittedChanges(options.cwd)) return { type: "dirty_worktree", cwd: options.cwd };
	const redirect = await planCurrentWtRedirect(git, { cwd: options.cwd, movingBranch: currentBranch.branch });
	const adjustedInventory = inventoryWithoutCallerBranchOccupancy(inventory, { cwd: options.cwd, movingBranch: currentBranch.branch });
	return {
		type: "ok",
		plan: await planCheckout(adjustedInventory, git, currentBranch.branch),
		branchName: currentBranch.branch,
		redirect,
		currentWtNote: redirect.note,
	};
}

function operationOccupancy(record: SlotRecord): WorktreeOccupancy | null {
	if (record.branch === null || record.operation === null) return null;
	return { path: record.path, branch: record.branch, operation: record.operation };
}
