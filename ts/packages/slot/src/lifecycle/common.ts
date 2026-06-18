import type { WorktreeOccupancy } from "../gateways/git.ts";
import type { SlotRecord } from "../inventory.ts";

export interface SlotLifecycleFailure {
	error_type: string;
	message: string;
}

export type LifecycleResult<T> =
	| { type: "ok"; outcome: T }
	| { type: "failure"; failure: SlotLifecycleFailure };

export function assignedSlotRecords(records: readonly SlotRecord[]): readonly SlotRecord[] {
	return records.filter((record) => record.branch !== null);
}

export function poolFullFailure(
	assigned: readonly SlotRecord[],
	options: { action: string },
): SlotLifecycleFailure {
	if (assigned.length === 0) {
		return {
			error_type: "pool_full",
			message: `Pool is full (no slots available). Run \`slot init\` or \`slot resize\` before ${options.action}.`,
		};
	}
	const details = assigned.map(assignedSlotDetail).join("\n");
	return {
		error_type: "pool_full",
		message: `Pool is full. Currently assigned:\n${details}\nFree a slot before ${options.action}.`,
	};
}

export function assignedSlotDetail(record: SlotRecord): string {
	const suffix = record.operation === null ? "" : ` (${record.operation} in progress)`;
	return `  ${record.slotName} -> ${record.branch}${suffix}`;
}

export function operationRecoveryInstruction(operation: string): string {
	if (operation === "rebase") return "run `git rebase --continue`/`--abort` there";
	if (operation === "bisect") return "run `git bisect reset` there";
	return "finish or abort it there";
}

export function recoverySentence(operation: string): string {
	const instruction = operationRecoveryInstruction(operation);
	return `${instruction[0]?.toUpperCase() ?? ""}${instruction.slice(1)}, then retry.`;
}

export function branchOccupancyMessage(occupancy: WorktreeOccupancy): string {
	if (occupancy.operation === "checked-out")
		return `Branch '${occupancy.branch}' is already checked out at ${occupancy.path}.`;
	return `Branch '${occupancy.branch}' has a ${occupancy.operation} in progress at ${occupancy.path}. ${recoverySentence(occupancy.operation)}`;
}

export function branchInUseFailure(occupancy: WorktreeOccupancy): SlotLifecycleFailure {
	return { error_type: "branch_in_use", message: branchOccupancyMessage(occupancy) };
}

export function slotOperationMessage(record: SlotRecord, options: { action: string }): string {
	const branch = record.branch ?? "unknown branch";
	const operation = record.operation ?? "operation";
	return `${record.slotName} holds '${branch}' with a ${operation} in progress at ${record.path}; cannot continue ${options.action}. ${recoverySentence(operation)}`;
}
