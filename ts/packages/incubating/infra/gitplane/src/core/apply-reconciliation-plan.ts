import type { Clock } from "./domain.ts";
import type { FrozenArtifactWork, FrozenReconciliationPlan } from "./frozen-plan.ts";
import type {
	GatewayError,
	MaterializationStoreGateway,
	ReconciliationErrorRecord,
	RevisionRecord,
} from "./gateways.ts";

export interface ApplyContext {
	readonly clock: Clock;
	readonly store: MaterializationStoreGateway;
}

export type ApplyResult =
	| { readonly type: "applied" }
	| { readonly type: "completed-with-cleanup-pending"; readonly error: GatewayError }
	| {
			readonly type: "structural-failure";
			readonly code: "cursor-mismatch" | "frozen-plan-conflict";
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
	plan: FrozenReconciliationPlan,
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

function isContentDigestText(value: string): value is `sha256:${string}` {
	return value.startsWith("sha256:");
}

function thawRevision(work: FrozenArtifactWork): RevisionRecord | null {
	if (work.revision === null) return null;
	if (!isContentDigestText(work.revision.digest.text))
		throw new Error("Frozen revision digest text is invalid.");
	return {
		...work.revision,
		digest: {
			...work.revision.digest,
			text: work.revision.digest.text,
			bytes: new Uint8Array(work.revision.digest.bytes),
			manifest: work.revision.digest.manifest.map((item) => ({ ...item })),
		},
		envelope: structuredClone(work.revision.envelope),
	};
}

async function applyArtifact(
	store: MaterializationStoreGateway,
	work: FrozenArtifactWork,
): Promise<ApplyResult | null> {
	const revision = thawRevision(work);
	if (revision !== null) {
		const result = await store.insertRevision(revision);
		if (result.type === "error")
			return operational("insert-revision", work.artifactId, result.error);
		if (result.type === "conflict")
			return {
				type: "structural-failure",
				code: "frozen-plan-conflict",
				message: result.message,
			};
	}
	const lineage = await store.upsertLineage(work.lineage);
	if (!lineage.ok) return operational("upsert-lineage", work.artifactId, lineage.error);
	const current = await store.upsertCurrentArtifact(work.current);
	if (!current.ok) return operational("upsert-current", work.artifactId, current.error);
	if (work.target?.type === "upsert") {
		const target = await store.upsertTargetRow(work.target.record);
		if (!target.ok) return operational("upsert-target", work.artifactId, target.error);
	} else if (work.target?.type === "tombstone") {
		const target = await store.tombstoneTargetRow({
			sourceId: work.current.sourceId,
			artifactId: work.artifactId,
			target: work.target.target,
			deletedAtCommit: work.target.deletedAtCommit,
		});
		if (!target.ok) return operational("tombstone-target", work.artifactId, target.error);
	}
	const event = await store.insertEvent(work.event);
	if (event.type === "error") return operational("insert-event", work.artifactId, event.error);
	if (event.type === "conflict")
		return {
			type: "structural-failure",
			code: "frozen-plan-conflict",
			message: event.message,
		};
	return null;
}

/** Apply one already-persisted frozen plan. Callers own attempt insertion and residue precedence. */
export async function applyReconciliationPlan(
	context: ApplyContext,
	plan: FrozenReconciliationPlan,
): Promise<ApplyResult> {
	for (const work of plan.artifactWork) {
		const failure = await applyArtifact(context.store, work);
		if (failure === null) continue;
		if (failure.type === "operational-failure")
			await recordFailureBestEffort(context, plan, failure);
		return failure;
	}
	const cursor = await context.store.compareAndSetCursor({
		sourceId: plan.sourceId,
		expectedGeneration: plan.expectedCursor?.generation ?? 0,
		next: plan.nextCursor,
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
			message: "The completed cursor generation no longer matches the frozen plan.",
		};
	const resolved = await context.store.resolveReconciliationErrors({
		sourceId: plan.sourceId,
		targetCommit: plan.targetCommit,
		resolvedAt: context.clock.now(),
	});
	if (!resolved.ok) return { type: "completed-with-cleanup-pending", error: resolved.error };
	const deleted = await context.store.deleteReconciliationAttempt({
		sourceId: plan.sourceId,
		attemptId: plan.attemptId,
	});
	if (!deleted.ok) return { type: "completed-with-cleanup-pending", error: deleted.error };
	return { type: "applied" };
}
