import type { SlotRepositoryGateway } from "../gateways/repository.ts";
import { findBySlot, type SlotInventory, type SlotRecord } from "../inventory.ts";

export interface FreedSlot {
	slotName: string;
	branchName: string;
	worktreePath: string;
}

export type ReleaseTargetFailureReason =
	| "slot-not-assigned"
	| "operation-in-progress"
	| "dirty-worktree"
	| "detach-failed";

export interface ReleaseTargetFailure {
	reason: ReleaseTargetFailureReason;
	slotName: string;
	branchName: string;
	worktreePath: string;
	operation: string | null;
	detachRef: string | null;
	detachError: string | null;
	errorType: string;
}

export function freedSlotFromRecord(record: SlotRecord): FreedSlot {
	if (record.branch === null) throw new Error(`slot ${record.slotName} is not assigned`);
	return { slotName: record.slotName, branchName: record.branch, worktreePath: record.path };
}

export interface ReleaseAssignedSlotTargetOptions {
	git: SlotRepositoryGateway;
	inventory: SlotInventory;
	target: FreedSlot;
	trunkBranch: string;
}

export async function releaseAssignedSlotTarget(
	options: ReleaseAssignedSlotTargetOptions,
): Promise<FreedSlot | ReleaseTargetFailure> {
	const record = findBySlot(options.inventory, options.target.slotName);
	if (record === null || record.branch === null || record.branch !== options.target.branchName)
		return failure(
			"slot-not-assigned",
			options.target,
			record === null ? {} : { worktreePath: record.path },
		);
	if (record.operation !== null)
		return failure("operation-in-progress", options.target, {
			worktreePath: record.path,
			operation: record.operation,
		});
	if (await options.git.hasUncommittedChanges(record.path))
		return failure("dirty-worktree", options.target, { worktreePath: record.path });
	const detachFailure = await options.git.detachHead(record.path, options.trunkBranch);
	if (detachFailure !== null)
		return failure("detach-failed", options.target, {
			worktreePath: record.path,
			detachRef: options.trunkBranch,
			detachError: detachFailure.message,
		});
	return freedSlotFromRecord(record);
}

function failure(
	reason: ReleaseTargetFailureReason,
	target: FreedSlot,
	options: {
		worktreePath?: string;
		operation?: string | null;
		detachRef?: string;
		detachError?: string;
	},
): ReleaseTargetFailure {
	return {
		reason,
		slotName: target.slotName,
		branchName: target.branchName,
		worktreePath: options.worktreePath ?? target.worktreePath,
		operation: options.operation ?? null,
		detachRef: options.detachRef ?? null,
		detachError: options.detachError ?? null,
		errorType: reason === "detach-failed" ? "slot-allocation-error" : reason,
	};
}
