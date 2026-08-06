import type { Clock } from "./domain.ts";
import type {
	GatewayError,
	MaterializationStoreGateway,
	ReconciliationErrorRecord,
} from "./gateways.ts";
import {
	prepareArtifactMaterialization,
	prepareResultingCursor,
	type PlannedArtifactMaterialization,
	type ReconciliationPlan,
} from "./reconciliation-plan.ts";

export interface ApplyContext {
	readonly clock: Clock;
	readonly store: MaterializationStoreGateway;
}

export type ApplyResult =
	| { readonly type: "applied" }
	| { readonly type: "completed-with-cleanup-pending"; readonly error: GatewayError }
	| {
			readonly type: "structural-failure";
			readonly code: "cursor-mismatch" | "plan-conflict";
			readonly message: string;
	  }
	| {
			readonly type: "operational-failure";
			readonly operation: string;
			readonly subject: string;
			readonly error: GatewayError;
	  };

type OperationalFailure = Extract<ApplyResult, { readonly type: "operational-failure" }>;

function operational(operation: string, subject: string, error: GatewayError): OperationalFailure {
	return { type: "operational-failure", operation, subject, error };
}

async function recordFailureBestEffort(
	context: ApplyContext,
	plan: ReconciliationPlan,
	result: OperationalFailure,
): Promise<void> {
	const record: ReconciliationErrorRecord = {
		sourceId: plan.sourceId,
		targetCommit: plan.targetCommit,
		subject: result.subject,
		operation: result.operation,
		category: result.error.code,
		diagnostic: `Reconciliation operation failed (${result.error.code}).`,
		observedAt: context.clock.now(),
	};
	await context.store.recordReconciliationError(record);
}

async function applyArtifact(
	store: MaterializationStoreGateway,
	plan: ReconciliationPlan,
	planned: PlannedArtifactMaterialization,
): Promise<ApplyResult | null> {
	const prepared = prepareArtifactMaterialization(plan, planned);
	if (prepared.revision !== null) {
		const result = await store.insertRevision(prepared.revision);
		if (result.type === "error")
			return operational("insert-revision", planned.artifactId, result.error);
		if (result.type === "conflict")
			return { type: "structural-failure", code: "plan-conflict", message: result.message };
	}
	const lineage = await store.upsertLineage(prepared.lineage);
	if (!lineage.ok) return operational("upsert-lineage", planned.artifactId, lineage.error);
	const current = await store.upsertCurrentArtifact(prepared.current);
	if (!current.ok) return operational("upsert-current", planned.artifactId, current.error);
	if (prepared.target?.type === "upsert") {
		const target = await store.upsertTargetRow(prepared.target.record);
		if (!target.ok) return operational("upsert-target", planned.artifactId, target.error);
	} else if (prepared.target?.type === "tombstone") {
		const target = await store.tombstoneTargetRow({
			sourceId: prepared.target.sourceId,
			artifactId: prepared.target.artifactId,
			target: prepared.target.target,
			deletedAtCommit: prepared.target.deletedAtCommit,
		});
		if (!target.ok) return operational("tombstone-target", planned.artifactId, target.error);
	}
	const event = await store.insertEvent(prepared.event);
	if (event.type === "error") return operational("insert-event", planned.artifactId, event.error);
	if (event.type === "conflict")
		return { type: "structural-failure", code: "plan-conflict", message: event.message };
	return null;
}

/** Apply one already-persisted Reconciliation Plan. Callers own insertion and residue precedence. */
export async function applyReconciliationPlan(
	context: ApplyContext,
	plan: ReconciliationPlan,
): Promise<ApplyResult> {
	for (const planned of plan.artifactMaterialization) {
		const failure = await applyArtifact(context.store, plan, planned);
		if (failure === null) continue;
		if (failure.type === "operational-failure")
			await recordFailureBestEffort(context, plan, failure);
		return failure;
	}
	const resultingCursor = prepareResultingCursor(plan);
	const cursor = await context.store.compareAndSetCursor({
		sourceId: plan.sourceId,
		expectedGeneration: plan.expectedCursor?.generation ?? 0,
		next: resultingCursor,
	});
	if (cursor.type === "error") {
		const failure = operational("compare-and-set-cursor", plan.sourceId, cursor.error);
		await recordFailureBestEffort(context, plan, failure);
		return failure;
	}
	if (cursor.type === "mismatch")
		return {
			type: "structural-failure",
			code: "cursor-mismatch",
			message: "The completed cursor generation no longer matches the Reconciliation Plan.",
		};
	const resolved = await context.store.resolveReconciliationErrors({
		sourceId: plan.sourceId,
		targetCommit: plan.targetCommit,
		resolvedAt: context.clock.now(),
	});
	if (!resolved.ok) return { type: "completed-with-cleanup-pending", error: resolved.error };
	const deleted = await context.store.deleteReconciliationPlan({
		sourceId: plan.sourceId,
		attemptId: plan.attemptId,
	});
	if (!deleted.ok) return { type: "completed-with-cleanup-pending", error: deleted.error };
	return { type: "applied" };
}
