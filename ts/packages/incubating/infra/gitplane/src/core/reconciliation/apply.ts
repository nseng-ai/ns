import type { ArtifactClassification } from "../artifact.ts";
import type { Clock } from "../domain.ts";
import type {
	EventRecord,
	GatewayError,
	MaterializationStoreGateway,
	ReconciliationErrorRecord,
	RevisionRecord,
} from "../gateways.ts";
import { deriveEventId, deriveRevisionId, type ArtifactEventType } from "../identity.ts";
import type { PlannedTransition, ReconciliationPlan } from "./plan.ts";
import type { ReconcileFailure, ReconcileResult } from "./types.ts";

function failure(options: {
	readonly code: string;
	readonly message: string;
	readonly phase: "apply" | "cleanup";
	readonly operation: string;
	readonly subject: string;
	readonly plan: ReconciliationPlan;
	readonly cursorAdvanced: boolean;
}): ReconcileFailure {
	return {
		code: options.code,
		message: options.message,
		phase: options.phase,
		operation: options.operation,
		subject: options.subject,
		targetCommit: options.plan.targetCommit,
		cursorAdvanced: options.cursorAdvanced,
	};
}
export async function recordOperationalFailure(
	store: MaterializationStoreGateway,
	clock: Clock,
	plan: ReconciliationPlan,
	operation: string,
	subject: string,
	error: GatewayError,
): Promise<void> {
	const record: ReconciliationErrorRecord = {
		sourceId: plan.sourceId,
		targetCommit: plan.targetCommit,
		subject,
		operation,
		category: error.code,
		diagnostic: error.message,
		observedAt: clock.now(),
	};
	try {
		await store.recordReconciliationError(record);
	} catch {
		// Error persistence is best effort and must never replace the operational failure.
	}
}
function eventType(transition: PlannedTransition): ArtifactEventType | null {
	switch (transition.kind) {
		case "created":
			return "artifact.created";
		case "restored":
			return "artifact.restored";
		case "revised":
			return "artifact.revised";
		case "moved":
			return "artifact.moved";
		case "deleted":
			return "artifact.deleted";
		case "unchanged":
			return null;
	}
}
function revisionId(transition: PlannedTransition, sourceId: string): string | null {
	return transition.current === null
		? null
		: deriveRevisionId({
				sourceId,
				artifactId: transition.artifactId,
				contentDigest: transition.current.digest.bytes,
			});
}
function classification(transition: PlannedTransition): ArtifactClassification {
	return (
		transition.current?.snapshot.classification ??
		transition.priorCurrent?.classification ??
		transition.prior?.snapshot.classification ?? { state: "generic" }
	);
}

export async function applyReconciliationPlan(options: {
	readonly store: MaterializationStoreGateway;
	readonly clock: Clock;
	readonly plan: ReconciliationPlan;
}): Promise<ReconcileResult> {
	const { store, clock, plan } = options;
	const baseline = await store.insertReconciliationPlanBaseline(plan.baseline);
	if (baseline.type === "error") {
		await recordOperationalFailure(
			store,
			clock,
			plan,
			"insertReconciliationPlanBaseline",
			plan.sourceId,
			baseline.error,
		);
		return {
			ok: false,
			failure: failure({
				code: baseline.error.code,
				message: baseline.error.message,
				phase: "apply",
				operation: "insertReconciliationPlanBaseline",
				subject: plan.sourceId,
				plan,
				cursorAdvanced: false,
			}),
		};
	}
	if (baseline.type === "conflict")
		return {
			ok: false,
			failure: failure({
				code: "reconciliation-baseline-conflict",
				message: baseline.message,
				phase: "apply",
				operation: "insertReconciliationPlanBaseline",
				subject: plan.sourceId,
				plan,
				cursorAdvanced: false,
			}),
		};

	// Planning is complete before this loop. The durable baseline freezes cursor-derived facts across
	// partial attempts; artifact-ID and revision→lineage→current→target→event order stabilize retries
	// and keep events behind visible state. Partial state is intentional but cannot redefine planning.
	// Cursor CAS is the completion boundary; error resolution and baseline deletion are recoverable cleanup.
	for (const transition of plan.transitions) {
		const currentRevisionId = revisionId(transition, plan.sourceId);
		if (transition.current !== null && currentRevisionId !== null) {
			const revision: RevisionRecord = {
				sourceId: plan.sourceId,
				artifactId: transition.artifactId,
				revisionId: currentRevisionId,
				digest: transition.current.digest,
				envelope: transition.current.snapshot.envelope,
				firstObservedCommit: plan.targetCommit,
				firstObservedPath: transition.current.snapshot.path,
			};
			const result = await store.insertRevision(revision);
			if (result.type === "error")
				return operational(
					store,
					clock,
					plan,
					"insertRevision",
					transition.artifactId,
					result.error,
				);
			if (result.type === "conflict")
				return operational(store, clock, plan, "insertRevision", transition.artifactId, {
					code: "revision-conflict",
					message: result.message,
				});
		}
		const lineage = await store.upsertLineage(transition.lineage);
		if (!lineage.ok)
			return operational(store, clock, plan, "upsertLineage", transition.artifactId, lineage.error);
		const priorRevisionId = transition.baselinePriorRevisionId;
		const path =
			transition.current?.snapshot.path ??
			transition.baselinePriorPath ??
			transition.priorCurrent?.path;
		const materializedRevisionId = currentRevisionId ?? priorRevisionId;
		if (path === undefined || materializedRevisionId === null)
			throw new Error("Transition lacks materialized identity.");
		const current = await store.upsertCurrentArtifact({
			sourceId: plan.sourceId,
			artifactId: transition.artifactId,
			revisionId: materializedRevisionId,
			path,
			classification: classification(transition),
			observedCommit: plan.targetCommit,
			tombstoned: transition.current === null,
		});
		if (!current.ok)
			return operational(
				store,
				clock,
				plan,
				"upsertCurrentArtifact",
				transition.artifactId,
				current.error,
			);
		if (transition.target !== null) {
			const target =
				transition.current === null
					? await store.tombstoneTargetRow({
							sourceId: plan.sourceId,
							artifactId: transition.artifactId,
							target: transition.target,
							deletedAtCommit: plan.targetCommit,
						})
					: await store.upsertTargetRow({
							sourceId: plan.sourceId,
							artifactId: transition.artifactId,
							revisionId: currentRevisionId!,
							path: transition.current.snapshot.path,
							target: transition.target,
							fields: transition.fields,
							clearFields: transition.clearFields,
						});
			if (!target.ok)
				return operational(
					store,
					clock,
					plan,
					transition.current === null ? "tombstoneTargetRow" : "upsertTargetRow",
					transition.artifactId,
					target.error,
				);
		}
		const type = plan.eventReconstruction === "complete" ? eventType(transition) : null;
		if (type !== null) {
			const event: EventRecord = {
				eventId: deriveEventId({
					sourceId: plan.sourceId,
					artifactId: transition.artifactId,
					reconciledCommit: plan.targetCommit,
					eventType: type,
				}),
				sourceId: plan.sourceId,
				artifactId: transition.artifactId,
				reconciledCommit: plan.targetCommit,
				eventType: type,
				priorRevisionId,
				currentRevisionId,
				priorPath: transition.baselinePriorPath,
				currentPath: transition.current?.snapshot.path ?? null,
			};
			const inserted = await store.insertEvent(event);
			if (inserted.type === "error")
				return operational(
					store,
					clock,
					plan,
					"insertEvent",
					transition.artifactId,
					inserted.error,
				);
			if (inserted.type === "conflict")
				return operational(store, clock, plan, "insertEvent", transition.artifactId, {
					code: "event-conflict",
					message: inserted.message,
				});
		}
	}
	const cursor = await store.compareAndSetCursor({
		sourceId: plan.sourceId,
		expectedCommit: plan.previousCursor,
		nextCommit: plan.targetCommit,
	});
	if (cursor.type === "mismatch")
		return {
			ok: false,
			failure: failure({
				code: "cursor-mismatch",
				message: `Cursor changed to ${cursor.actual ?? "missing"}.`,
				phase: "apply",
				operation: "compareAndSetCursor",
				subject: plan.sourceId,
				plan,
				cursorAdvanced: false,
			}),
		};
	if (cursor.type === "error")
		return operational(store, clock, plan, "compareAndSetCursor", plan.sourceId, cursor.error);
	return cleanupReconciliation({ store, clock, plan, status: "reconciled", cursorAdvanced: true });
}

async function operational(
	store: MaterializationStoreGateway,
	clock: Clock,
	plan: ReconciliationPlan,
	operation: string,
	subject: string,
	error: GatewayError,
): Promise<ReconcileResult> {
	await recordOperationalFailure(store, clock, plan, operation, subject, error);
	return {
		ok: false,
		failure: failure({
			code: error.code,
			message: error.message,
			phase: "apply",
			operation,
			subject,
			plan,
			cursorAdvanced: false,
		}),
	};
}

export async function cleanupReconciliation(options: {
	readonly store: MaterializationStoreGateway;
	readonly clock: Clock;
	readonly plan: ReconciliationPlan;
	readonly status: "reconciled" | "already-current";
	readonly cursorAdvanced: boolean;
}): Promise<ReconcileResult> {
	const resolved = await options.store.resolveReconciliationErrors({
		sourceId: options.plan.sourceId,
		targetCommit: options.plan.targetCommit,
		resolvedAt: options.clock.now(),
	});
	if (!resolved.ok) {
		await recordOperationalFailure(
			options.store,
			options.clock,
			options.plan,
			"resolveReconciliationErrors",
			options.plan.sourceId,
			resolved.error,
		);
		return {
			ok: false,
			failure: failure({
				code: resolved.error.code,
				message: resolved.error.message,
				phase: "cleanup",
				operation: "resolveReconciliationErrors",
				subject: options.plan.sourceId,
				plan: options.plan,
				cursorAdvanced: options.cursorAdvanced,
			}),
		};
	}
	const deleted = await options.store.deleteReconciliationPlanBaseline({
		sourceId: options.plan.sourceId,
		planDigest: options.plan.baseline.planDigest,
	});
	if (deleted.type === "error") {
		await recordOperationalFailure(
			options.store,
			options.clock,
			options.plan,
			"deleteReconciliationPlanBaseline",
			options.plan.sourceId,
			deleted.error,
		);
		return {
			ok: false,
			failure: failure({
				code: deleted.error.code,
				message: deleted.error.message,
				phase: "cleanup",
				operation: "deleteReconciliationPlanBaseline",
				subject: options.plan.sourceId,
				plan: options.plan,
				cursorAdvanced: options.cursorAdvanced,
			}),
		};
	}
	if (deleted.type === "mismatch")
		return {
			ok: false,
			failure: failure({
				code: "reconciliation-baseline-conflict",
				message: "Reconciliation baseline changed during cleanup.",
				phase: "cleanup",
				operation: "deleteReconciliationPlanBaseline",
				subject: options.plan.sourceId,
				plan: options.plan,
				cursorAdvanced: options.cursorAdvanced,
			}),
		};
	return {
		ok: true,
		data: {
			sourceId: options.plan.sourceId,
			targetCommit: options.plan.targetCommit,
			previousCursor: options.plan.previousCursor,
			mode: options.plan.mode,
			status: options.status,
			transitions: options.plan.counts,
			eventReconstruction: options.plan.eventReconstruction,
			cursorAdvanced: options.cursorAdvanced,
			errorsResolved: resolved.count,
		},
	};
}
