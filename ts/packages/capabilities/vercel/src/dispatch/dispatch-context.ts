// Shared locator-only contract for a Saved Plan dispatch. This module stays
// dependency-free because the type crosses the HTTP trigger, Workflow replay,
// and later sandbox supervision boundaries.
export const DISPATCH_CONTEXT_NAMESPACE = "dispatch-context";

/**
 * Maximum ns-generated Dispatch ID length accepted by dispatch surfaces.
 * The trigger wire contract and the recovery lookup both bound against this.
 */
export const DISPATCH_ID_MAX_CHARS = 200;

export interface DispatchPlanContextLocator {
	readonly namespace: typeof DISPATCH_CONTEXT_NAMESPACE;
	readonly dispatchId: string;
	readonly contextPrefix: string;
	readonly planKey: string;
	readonly sourceBranch: string;
	readonly snapshotRef: string;
	readonly snapshotCommitSha: string;
	readonly entryLocator: string;
}
