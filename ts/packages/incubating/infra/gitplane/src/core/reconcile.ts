import { applyReconciliationPlan, type ApplyResult } from "./apply-reconciliation-plan.ts";
import type { ArtifactKindRegistration, Clock } from "./domain.ts";
import { gatherSourceFacts } from "./gather-source-facts.ts";
import type { ReconciliationMode } from "./gather-source-facts.ts";
import type {
	ArtifactGateway,
	CursorRecord,
	GatewayError,
	MaterializationStoreGateway,
	ReconciliationAttemptRecord,
} from "./gateways.ts";
import type { FrozenReconciliationPlan } from "./frozen-plan.ts";
import { deriveReconciliationPlan } from "./reconciliation-plan.ts";

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
	readonly mode?: ReconciliationMode;
}

export type ReconciliationResult =
	| {
			readonly type: "completed";
			readonly sourceId: string;
			readonly targetCommit: string;
			readonly mode: ReconciliationMode;
			readonly priorCursor: CursorRecord | null;
			readonly resultingCursor: CursorRecord;
			readonly cursorAdvanced: boolean;
			readonly replayedAttempt: boolean;
			readonly cleanupOnly: boolean;
			readonly counts: Readonly<Record<string, number>>;
	  }
	| {
			readonly type: "no-op";
			readonly sourceId: string;
			readonly targetCommit: string;
			readonly mode: ReconciliationMode;
			readonly cursor: CursorRecord;
	  }
	| {
			readonly type: "structural-failure";
			readonly code: string;
			readonly message: string;
	  }
	| {
			readonly type: "operational-failure";
			readonly operation: string;
			readonly error: GatewayError;
	  }
	| {
			readonly type: "completed-with-cleanup-pending";
			readonly sourceId: string;
			readonly targetCommit: string;
			readonly mode: ReconciliationMode;
			readonly resultingCursor: CursorRecord;
			readonly replayedAttempt: boolean;
			readonly cleanupOnly: boolean;
			readonly error: GatewayError;
	  };

function eventCounts(plan: FrozenReconciliationPlan): Readonly<Record<string, number>> {
	const counts: Record<string, number> = {};
	for (const work of plan.artifactWork) counts[work.outcome] = (counts[work.outcome] ?? 0) + 1;
	return counts;
}

function completed(
	plan: FrozenReconciliationPlan,
	replayedAttempt: boolean,
	priorCursor: CursorRecord | null,
): ReconciliationResult {
	return {
		type: "completed",
		sourceId: plan.sourceId,
		targetCommit: plan.targetCommit,
		mode: plan.mode,
		priorCursor,
		resultingCursor: plan.nextCursor,
		cursorAdvanced: true,
		replayedAttempt,
		cleanupOnly: false,
		counts: eventCounts(plan),
	};
}

function translateApply(
	plan: FrozenReconciliationPlan,
	result: ApplyResult,
	replayedAttempt: boolean,
): ReconciliationResult {
	if (result.type === "applied") return completed(plan, replayedAttempt, plan.expectedCursor);
	if (result.type === "completed-with-cleanup-pending")
		return {
			type: result.type,
			sourceId: plan.sourceId,
			targetCommit: plan.targetCommit,
			mode: plan.mode,
			resultingCursor: plan.nextCursor,
			replayedAttempt,
			cleanupOnly: false,
			error: result.error,
		};
	if (result.type === "structural-failure") return result;
	return { type: "operational-failure", operation: result.operation, error: result.error };
}

function isCompletedResidue(
	cursor: CursorRecord | null,
	attempt: ReconciliationAttemptRecord,
): boolean {
	return (
		cursor?.sourceId === attempt.plan.nextCursor.sourceId &&
		cursor.commit === attempt.plan.nextCursor.commit &&
		cursor.generation === attempt.plan.nextCursor.generation
	);
}

async function cleanupResidue(
	context: ReconciliationContext,
	attempt: ReconciliationAttemptRecord,
): Promise<ReconciliationResult> {
	const resolved = await context.store.resolveReconciliationErrors({
		sourceId: attempt.sourceId,
		targetCommit: attempt.plan.targetCommit,
		resolvedAt: context.clock.now(),
	});
	if (!resolved.ok)
		return {
			type: "completed-with-cleanup-pending",
			sourceId: attempt.sourceId,
			targetCommit: attempt.plan.targetCommit,
			mode: attempt.plan.mode,
			resultingCursor: attempt.plan.nextCursor,
			replayedAttempt: false,
			cleanupOnly: true,
			error: resolved.error,
		};
	const deleted = await context.store.deleteReconciliationAttempt({
		sourceId: attempt.sourceId,
		attemptId: attempt.attemptId,
	});
	if (!deleted.ok)
		return {
			type: "completed-with-cleanup-pending",
			sourceId: attempt.sourceId,
			targetCommit: attempt.plan.targetCommit,
			mode: attempt.plan.mode,
			resultingCursor: attempt.plan.nextCursor,
			replayedAttempt: false,
			cleanupOnly: true,
			error: deleted.error,
		};
	return {
		type: "completed",
		sourceId: attempt.sourceId,
		targetCommit: attempt.plan.targetCommit,
		mode: attempt.plan.mode,
		priorCursor: attempt.plan.nextCursor,
		resultingCursor: attempt.plan.nextCursor,
		cursorAdvanced: false,
		replayedAttempt: false,
		cleanupOnly: true,
		counts: {},
	};
}

/** Gather, decide, and apply one level-triggered complete-snapshot reconciliation. */
export async function reconcile(
	context: ReconciliationContext,
	options: ReconcileOptions,
): Promise<ReconciliationResult> {
	const mode = options.mode ?? "normal";
	const snapshot = await context.store.readMaterializationSnapshot({ sourceId: options.sourceId });
	if (!snapshot.ok)
		return {
			type: "operational-failure",
			operation: "read-materialization-snapshot",
			error: snapshot.error,
		};
	const pending = snapshot.value.pendingAttempt;
	if (pending !== null) {
		if (isCompletedResidue(snapshot.value.cursor, pending)) return cleanupResidue(context, pending);
		if (
			pending.plan.mode !== mode ||
			pending.plan.targetCommitish !== options.targetCommitish ||
			pending.sourceId !== options.sourceId
		)
			return {
				type: "structural-failure",
				code: "attempt-conflict",
				message: "A different reconciliation attempt is already pending for this source.",
			};
		return translateApply(pending.plan, await applyReconciliationPlan(context, pending.plan), true);
	}

	const gathered = await gatherSourceFacts({
		gateway: context.artifacts,
		sourceId: options.sourceId,
		artifactRoot: options.artifactRoot,
		targetCommitish: options.targetCommitish,
		kinds: options.kinds ?? [],
		mode,
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
		materialization: snapshot.value,
		kinds: gathered.facts.kinds,
		mode,
	});
	if (planned.type === "invalid")
		return { type: "structural-failure", code: planned.code, message: planned.message };
	if (planned.type === "noop")
		return {
			type: "no-op",
			sourceId: planned.sourceId,
			targetCommit: planned.targetCommit,
			mode,
			cursor: planned.cursor,
		};
	const attempt = await context.store.insertReconciliationAttempt({
		sourceId: planned.plan.sourceId,
		attemptId: planned.plan.attemptId,
		plan: planned.plan,
	});
	if (attempt.type === "conflict")
		return { type: "structural-failure", code: "attempt-conflict", message: attempt.message };
	if (attempt.type === "error")
		return {
			type: "operational-failure",
			operation: "persist-reconciliation-attempt",
			error: attempt.error,
		};
	return translateApply(
		planned.plan,
		await applyReconciliationPlan(context, planned.plan),
		attempt.type === "existing",
	);
}
