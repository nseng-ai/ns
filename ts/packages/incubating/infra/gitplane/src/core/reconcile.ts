/**
 * Reconciliation engine: a linear pipeline whose reentry point is selected only by
 * persisted store state, never by in-memory state or Git reads.
 *
 * ```text
 * 1. Read Materialization Snapshot
 * 2. Recover Pending Plan            <- reenter here when the store holds a Reconciliation
 *                                      Plan for the source and the cursor does NOT match
 *                                      that plan's Resulting Cursor (commit + generation;
 *                                      absent cursor is generation 0). Apply did not
 *                                      finish; resume it from the persisted plan.
 * 3. Clean up completed residue      <- reenter here when the store holds a Reconciliation
 *                                      Plan and the cursor equals its Resulting Cursor:
 *                                      materialization finished; only error resolution and
 *                                      plan deletion remain.
 * 4. Gather target snapshot          <- fresh start when no Pending Plan exists: the cursor
 *                                      (or generation 0) is the completed baseline. After
 *                                      recovering a plan for a different target, the engine
 *                                      rereads the snapshot and continues here.
 * 5. Derive Reconciliation Plan
 * 6. Persist Pending Plan            -- durability boundary: from here every retry resumes
 *                                      at 2 and never replans from source or configuration.
 * 7. Apply materializations          -- idempotent writes in canonical artifact-ID order;
 *                                      failure leaves plan + unadvanced cursor -> reenter at 2.
 * 8. Write Resulting Cursor          -- completion boundary: generation-guarded CAS.
 * 9. Clean up Pending Plan           -- failure leaves plan + advanced cursor -> reenter at 3.
 * ```
 *
 * Dispatch reads exactly two durable facts from one Materialization Snapshot: whether a
 * Pending Plan exists for the source, and whether the cursor matches that plan's Resulting
 * Cursor. The Pending Plan explains incomplete work; the Resulting Cursor proves complete
 * work. Recovery is bounded to the one inherited Pending Plan: a new plan appearing after
 * recovery is a conflict, and pending work is never replaced.
 */
import { applyReconciliationPlan, type ApplyResult } from "./apply-reconciliation-plan.ts";
import type { ArtifactKindRegistration, Clock } from "./domain.ts";
import { gatherSourceFacts } from "./gather-source-facts.ts";
import type {
	ArtifactGateway,
	CursorRecord,
	GatewayError,
	MaterializationSnapshot,
	MaterializationStoreGateway,
} from "./gateways.ts";
import {
	deriveReconciliationPlan,
	prepareResultingCursor,
	type ReconciliationPlan,
} from "./reconciliation-plan.ts";

export interface ReconciliationContext {
	readonly clock: Clock;
	readonly artifacts: ArtifactGateway;
	readonly store: MaterializationStoreGateway;
}

export interface ReconcileOptions {
	readonly sourceId: string;
	readonly artifactRoot: string;
	readonly targetCommitish: string;
	readonly kinds?: readonly ArtifactKindRegistration[];
}

export type ReconciliationResult =
	| {
			readonly type: "completed";
			readonly sourceId: string;
			readonly targetCommit: string;
			readonly priorCursor: CursorRecord | null;
			readonly resultingCursor: CursorRecord;
			readonly cursorAdvanced: boolean;
			readonly replayedPlan: boolean;
			readonly cleanupOnly: boolean;
			readonly recoveredPendingPlan: boolean;
			readonly counts: ReconciliationPlan["completion"];
	  }
	| {
			readonly type: "no-op";
			readonly sourceId: string;
			readonly targetCommit: string;
			readonly cursor: CursorRecord;
			readonly recoveredPendingPlan: boolean;
	  }
	| { readonly type: "structural-failure"; readonly code: string; readonly message: string }
	| {
			readonly type: "operational-failure";
			readonly operation: string;
			readonly error: GatewayError;
	  }
	| {
			readonly type: "completed-with-cleanup-pending";
			readonly sourceId: string;
			readonly targetCommit: string;
			readonly resultingCursor: CursorRecord;
			readonly replayedPlan: boolean;
			readonly cleanupOnly: boolean;
			readonly recoveredPendingPlan: boolean;
			readonly error: GatewayError;
	  };

function completed(
	plan: ReconciliationPlan,
	replayedPlan: boolean,
	priorCursor: CursorRecord | null,
	recoveredPendingPlan: boolean,
): ReconciliationResult {
	return {
		type: "completed",
		sourceId: plan.sourceId,
		targetCommit: plan.targetCommit,
		priorCursor,
		resultingCursor: prepareResultingCursor(plan),
		cursorAdvanced: true,
		replayedPlan,
		cleanupOnly: false,
		recoveredPendingPlan,
		counts: plan.completion,
	};
}

function translateApply(
	plan: ReconciliationPlan,
	result: ApplyResult,
	replayedPlan: boolean,
	recoveredPendingPlan: boolean,
): ReconciliationResult {
	if (result.type === "applied")
		return completed(
			plan,
			replayedPlan,
			plan.expectedCursor === null ? null : { sourceId: plan.sourceId, ...plan.expectedCursor },
			recoveredPendingPlan,
		);
	if (result.type === "completed-with-cleanup-pending")
		return {
			type: result.type,
			sourceId: plan.sourceId,
			targetCommit: plan.targetCommit,
			resultingCursor: prepareResultingCursor(plan),
			replayedPlan,
			cleanupOnly: false,
			recoveredPendingPlan,
			error: result.error,
		};
	if (result.type === "structural-failure") return result;
	return { type: "operational-failure", operation: result.operation, error: result.error };
}

function isCompletedResidue(cursor: CursorRecord | null, plan: ReconciliationPlan): boolean {
	const resultingCursor = prepareResultingCursor(plan);
	return (
		cursor?.sourceId === resultingCursor.sourceId &&
		cursor.commit === resultingCursor.commit &&
		cursor.generation === resultingCursor.generation
	);
}

async function cleanupResidue(
	context: ReconciliationContext,
	plan: ReconciliationPlan,
): Promise<ReconciliationResult> {
	const resultingCursor = prepareResultingCursor(plan);
	const resolved = await context.store.resolveReconciliationErrors({
		sourceId: plan.sourceId,
		targetCommit: plan.targetCommit,
		resolvedAt: context.clock.now(),
	});
	if (!resolved.ok)
		return {
			type: "completed-with-cleanup-pending",
			sourceId: plan.sourceId,
			targetCommit: plan.targetCommit,
			resultingCursor,
			replayedPlan: false,
			cleanupOnly: true,
			recoveredPendingPlan: true,
			error: resolved.error,
		};
	const deleted = await context.store.deleteReconciliationPlan({
		sourceId: plan.sourceId,
		attemptId: plan.attemptId,
	});
	if (!deleted.ok)
		return {
			type: "completed-with-cleanup-pending",
			sourceId: plan.sourceId,
			targetCommit: plan.targetCommit,
			resultingCursor,
			replayedPlan: false,
			cleanupOnly: true,
			recoveredPendingPlan: true,
			error: deleted.error,
		};
	return {
		type: "completed",
		sourceId: plan.sourceId,
		targetCommit: plan.targetCommit,
		priorCursor: resultingCursor,
		resultingCursor,
		cursorAdvanced: false,
		replayedPlan: false,
		cleanupOnly: true,
		recoveredPendingPlan: true,
		counts: { created: 0, restored: 0, revised: 0, unchanged: 0, deleted: 0 },
	};
}

async function reconcileFromSnapshot(
	context: ReconciliationContext,
	options: ReconcileOptions,
	materialization: MaterializationSnapshot,
	recoveredPendingPlan: boolean,
): Promise<ReconciliationResult> {
	const gathered = await gatherSourceFacts({
		gateway: context.artifacts,
		sourceId: options.sourceId,
		artifactRoot: options.artifactRoot,
		targetCommitish: options.targetCommitish,
		kinds: options.kinds ?? [],
	});
	if (!gathered.ok)
		return {
			type: "operational-failure",
			operation: "gather-target-snapshot",
			error: gathered.error,
		};
	if (gathered.facts.type === "target-unavailable")
		return {
			type: "structural-failure",
			code: "target-unavailable",
			message: "The requested target commit or an object in its artifact tree is unavailable.",
		};
	const planned = deriveReconciliationPlan({
		sourceId: options.sourceId,
		targetCommitish: options.targetCommitish,
		targetSnapshot: gathered.facts.targetSnapshot,
		materialization,
		kinds: gathered.facts.kinds,
	});
	if (planned.type === "invalid")
		return { type: "structural-failure", code: planned.code, message: planned.message };
	if (planned.type === "noop")
		return {
			type: "no-op",
			sourceId: planned.sourceId,
			targetCommit: planned.targetCommit,
			cursor: planned.cursor,
			recoveredPendingPlan,
		};
	const inserted = await context.store.insertReconciliationPlan(planned.plan);
	if (inserted.type === "conflict")
		return { type: "structural-failure", code: "plan-conflict", message: inserted.message };
	if (inserted.type === "error")
		return {
			type: "operational-failure",
			operation: "persist-reconciliation-plan",
			error: inserted.error,
		};
	return translateApply(
		planned.plan,
		await applyReconciliationPlan(context, planned.plan),
		inserted.type === "existing",
		recoveredPendingPlan,
	);
}

/** Gather, decide, and apply one level-triggered complete-snapshot reconciliation. */
export async function reconcile(
	context: ReconciliationContext,
	options: ReconcileOptions,
): Promise<ReconciliationResult> {
	const snapshot = await context.store.readMaterializationSnapshot({ sourceId: options.sourceId });
	if (!snapshot.ok)
		return {
			type: "operational-failure",
			operation: "read-materialization-snapshot",
			error: snapshot.error,
		};
	const pending = snapshot.value.pendingPlan;
	if (pending === null) return reconcileFromSnapshot(context, options, snapshot.value, false);

	const recovered = isCompletedResidue(snapshot.value.cursor, pending)
		? await cleanupResidue(context, pending)
		: translateApply(pending, await applyReconciliationPlan(context, pending), true, true);
	if (recovered.type !== "completed") return recovered;
	if (pending.targetCommitish === options.targetCommitish) return recovered;

	const refreshed = await context.store.readMaterializationSnapshot({ sourceId: options.sourceId });
	if (!refreshed.ok)
		return {
			type: "operational-failure",
			operation: "read-materialization-snapshot-after-recovery",
			error: refreshed.error,
		};
	if (refreshed.value.pendingPlan !== null)
		return {
			type: "structural-failure",
			code: "plan-conflict",
			message: "A new Reconciliation Plan appeared while recovering pending work.",
		};
	return reconcileFromSnapshot(context, options, refreshed.value, true);
}
