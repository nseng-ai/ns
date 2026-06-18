import type { SlotGitGateway, GitCommandFailure } from "../gateways/git.ts";
import { findBySlot, type SlotInventory, type SlotRecord } from "../inventory.ts";

export interface FreedSlot {
	slot_name: string;
	branch_name: string;
	worktree_path: string;
}

export type ReleaseTargetFailureReason = "slot_not_assigned" | "operation_in_progress" | "dirty_worktree" | "detach_failed";

export type ReleaseTargetResult =
	| { type: "released"; freed: FreedSlot }
	| { type: "failure"; reason: "slot_not_assigned"; message: string }
	| { type: "failure"; reason: "operation_in_progress"; operation: string; message: string }
	| { type: "failure"; reason: "dirty_worktree"; message: string }
	| { type: "failure"; reason: "detach_failed"; failure: GitCommandFailure; message: string };

export interface ReleaseTarget {
	slotName: string;
	branchName: string;
}

export function freedSlotFromRecord(record: SlotRecord): FreedSlot {
	if (record.branch === null) throw new Error(`slot ${record.slotName} is not assigned`);
	return { slot_name: record.slotName, branch_name: record.branch, worktree_path: record.path };
}

export async function releaseAssignedSlotTarget(git: SlotGitGateway, inventory: SlotInventory, target: ReleaseTarget, trunkBranch: string): Promise<ReleaseTargetResult> {
	const record = findBySlot(inventory, target.slotName);
	if (record === null || record.branch !== target.branchName) {
		return { type: "failure", reason: "slot_not_assigned", message: `${target.slotName} is not currently assigned. Run \`slot list\` to see the pool.` };
	}
	if (record.operation !== null) {
		return { type: "failure", reason: "operation_in_progress", operation: record.operation, message: `${record.slotName} holds '${record.branch}' with a ${record.operation} in progress at ${record.path}; cannot continue freeing. Finish or abort it there, then retry.` };
	}
	if (await git.hasUncommittedChanges(record.path)) {
		return { type: "failure", reason: "dirty_worktree", message: `${record.slotName} has uncommitted changes at ${record.path}. Commit or stash before freeing.` };
	}
	const detachFailure = await git.detachHead(record.path, trunkBranch);
	if (detachFailure !== null) {
		return { type: "failure", reason: "detach_failed", failure: detachFailure, message: `Failed to detach ${record.slotName} at ${record.path} to ${trunkBranch}: ${detachFailure.message}` };
	}
	return { type: "released", freed: freedSlotFromRecord(record) };
}
