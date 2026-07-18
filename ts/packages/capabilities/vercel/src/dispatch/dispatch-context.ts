// Shared locator-only instruction contract for every dispatch. This module stays
// dependency-free because the type crosses the HTTP trigger, Workflow replay,
// and later sandbox supervision boundaries.
export const DISPATCH_CONTEXT_NAMESPACE = "dispatch-context";
export const DISPATCH_INSTRUCTIONS_FILE = "instructions.md";

export function buildDispatchInstructionKey(dispatchId: string): string {
	return `${dispatchId}/${DISPATCH_INSTRUCTIONS_FILE}`;
}

/**
 * Maximum ns-generated Dispatch ID length accepted by dispatch surfaces.
 * The trigger wire contract and the recovery lookup both bound against this.
 */
export const DISPATCH_ID_MAX_CHARS = 200;

export interface DispatchInstructionLocator {
	readonly namespace: typeof DISPATCH_CONTEXT_NAMESPACE;
	readonly dispatchId: string;
	readonly key: string;
	readonly sourceBranch: string;
	readonly snapshotRef: string;
	readonly snapshotCommitSha: string;
	readonly entryLocator: string;
}
