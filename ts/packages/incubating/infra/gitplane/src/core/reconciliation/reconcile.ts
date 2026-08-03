import type { ReconciliationPlanBaseline } from "../gateways.ts";
import {
	applyReconciliationPlan,
	cleanupReconciliation,
	recordOperationalFailure,
} from "./apply.ts";
import { buildReconciliationPlan, type ReconciliationPlan } from "./plan.ts";
import type {
	ReconcileContext,
	ReconcileOptions,
	ReconcileResult,
	ReconciliationTransitionCounts,
} from "./types.ts";

const ZERO_COUNTS: ReconciliationTransitionCounts = {
	created: 0,
	restored: 0,
	revised: 0,
	moved: 0,
	unchanged: 0,
	deleted: 0,
};

function readFailure(code: string, message: string, targetCommit?: string): ReconcileResult {
	return {
		ok: false,
		failure: {
			code,
			message,
			phase: "read",
			...(targetCommit === undefined ? {} : { targetCommit }),
			cursorAdvanced: false,
		},
	};
}
function cleanupPlan(
	baseline: ReconciliationPlanBaseline,
	previousCursor: string,
): ReconciliationPlan {
	return {
		sourceId: baseline.sourceId,
		targetCommit: baseline.targetCommit,
		previousCursor,
		mode: baseline.mode,
		eventReconstruction: baseline.eventReconstruction,
		transitions: [],
		counts: ZERO_COUNTS,
		baseline,
	};
}

export async function reconcile(
	context: ReconcileContext,
	options: ReconcileOptions,
): Promise<ReconcileResult> {
	const mode = options.full === true ? "full" : "incremental";
	const target = await context.artifacts.resolveCommit({ commitish: options.target });
	if (!target.ok) return readFailure(target.error.code, target.error.message);
	const facts = await context.artifacts.readCommitFacts({ commit: target.value });
	if (!facts.ok) return readFailure(facts.error.code, facts.error.message, target.value);
	if (facts.value.isMerge)
		return readFailure(
			"merge-commit-unsupported",
			"Merge commits are not supported.",
			target.value,
		);
	const cursor = await context.store.readCursor({ sourceId: options.sourceId });
	if (cursor.type === "error")
		return readFailure(cursor.error.code, cursor.error.message, target.value);
	const previousCursor = cursor.type === "found" ? cursor.value.commit : null;
	const baseline = await context.store.readReconciliationPlanBaseline({
		sourceId: options.sourceId,
	});
	if (baseline.type === "error")
		return readFailure(baseline.error.code, baseline.error.message, target.value);
	if (previousCursor === null && mode !== "full")
		return readFailure("full-required", "Initial reconciliation requires full mode.", target.value);
	if (previousCursor === target.value && mode === "incremental") {
		if (baseline.type === "found") {
			if (baseline.value.targetCommit !== target.value)
				return readFailure(
					"reconciliation-baseline-conflict",
					"An unfinished baseline targets another commit.",
					target.value,
				);
			return cleanupReconciliation({
				store: context.store,
				clock: context.clock,
				plan: cleanupPlan(baseline.value, previousCursor),
				status: "already-current",
				cursorAdvanced: false,
			});
		}
		const resolved = await context.store.resolveReconciliationErrors({
			sourceId: options.sourceId,
			targetCommit: target.value,
			resolvedAt: context.clock.now(),
		});
		if (!resolved.ok) {
			await recordOperationalFailure(
				context.store,
				context.clock,
				{
					sourceId: options.sourceId,
					targetCommit: target.value,
					previousCursor,
					mode,
					eventReconstruction: "not-applicable",
					transitions: [],
					counts: ZERO_COUNTS,
					baseline: {
						sourceId: options.sourceId,
						expectedCursor: previousCursor,
						targetCommit: target.value,
						mode,
						eventReconstruction: "not-applicable",
						planDigest: "cleanup-only",
						entries: [],
					},
				},
				"resolveReconciliationErrors",
				options.sourceId,
				resolved.error,
			);
			return {
				ok: false,
				failure: {
					code: resolved.error.code,
					message: resolved.error.message,
					phase: "cleanup",
					operation: "resolveReconciliationErrors",
					subject: options.sourceId,
					targetCommit: target.value,
					cursorAdvanced: false,
				},
			};
		}
		return {
			ok: true,
			data: {
				sourceId: options.sourceId,
				targetCommit: target.value,
				previousCursor,
				mode,
				status: "already-current",
				transitions: ZERO_COUNTS,
				eventReconstruction: "not-applicable",
				cursorAdvanced: false,
				errorsResolved: resolved.count,
			},
		};
	}
	let strictForward = false;
	if (previousCursor !== null && previousCursor !== target.value) {
		const ancestry = await context.artifacts.isAncestor({
			ancestor: previousCursor,
			descendant: target.value,
		});
		if (!ancestry.ok) {
			if (mode === "incremental")
				return readFailure(ancestry.error.code, ancestry.error.message, target.value);
		} else strictForward = ancestry.value;
		if (mode === "incremental" && !strictForward)
			return readFailure(
				"non-fast-forward",
				"Incremental reconciliation requires the cursor to be an ancestor of the target.",
				target.value,
			);
	}
	const planned = await buildReconciliationPlan({
		artifacts: context.artifacts,
		store: context.store,
		sourceId: options.sourceId,
		artifactRoot: options.artifactRoot,
		targetCommit: target.value,
		previousCursor,
		mode,
		strictForward,
		kinds: options.kinds ?? [],
	});
	if (!planned.ok) return planned;
	return applyReconciliationPlan({
		store: context.store,
		clock: context.clock,
		plan: planned.plan,
	});
}
