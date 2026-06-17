import type { SlotGitGateway } from "../gateways/git.ts";
import { findBySlot, type SlotInventory, type SlotRecord } from "../inventory.ts";

export interface FreedSlot {
	slot_name: string;
	branch_name: string;
	worktree_path: string;
}

export type ReleaseTargetFailureReason = "slot_not_assigned" | "operation_in_progress" | "dirty_worktree" | "detach_failed";

export interface ReleaseTargetFailure {
	reason: ReleaseTargetFailureReason;
	slot_name: string;
	branch_name: string;
	worktree_path: string;
	operation: string | null;
	detach_ref: string | null;
	detach_error: string | null;
	error_type: string;
}

export function freedSlotFromRecord(record: SlotRecord): FreedSlot {
	if (record.branch === null) throw new Error(`slot ${record.slotName} is not assigned`);
	return { slot_name: record.slotName, branch_name: record.branch, worktree_path: record.path };
}

export async function releaseAssignedSlotTarget(git: SlotGitGateway, inventory: SlotInventory, target: FreedSlot, trunkBranch: string): Promise<FreedSlot | ReleaseTargetFailure> {
	const record = findBySlot(inventory, target.slot_name);
	if (record === null || record.branch === null || record.branch !== target.branch_name) return failure("slot_not_assigned", target, { worktreePath: record?.path });
	if (record.operation !== null) return failure("operation_in_progress", target, { worktreePath: record.path, operation: record.operation });
	if (await git.hasUncommittedChanges(record.path)) return failure("dirty_worktree", target, { worktreePath: record.path });
	const detachFailure = await git.detachHead(record.path, trunkBranch);
	if (detachFailure !== null) return failure("detach_failed", target, { worktreePath: record.path, detachRef: trunkBranch, detachError: detachFailure.message });
	return freedSlotFromRecord(record);
}

function failure(reason: ReleaseTargetFailureReason, target: FreedSlot, options: { worktreePath?: string | undefined; operation?: string | null | undefined; detachRef?: string | undefined; detachError?: string | undefined }): ReleaseTargetFailure {
	return {
		reason,
		slot_name: target.slot_name,
		branch_name: target.branch_name,
		worktree_path: options.worktreePath ?? target.worktree_path,
		operation: options.operation ?? null,
		detach_ref: options.detachRef ?? null,
		detach_error: options.detachError ?? null,
		error_type: reason === "detach_failed" ? "slot_allocation_error" : reason,
	};
}
