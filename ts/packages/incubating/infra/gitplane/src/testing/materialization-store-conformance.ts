import { parseArtifactId } from "../core/artifact.ts";
import type { TargetMapping } from "../core/domain.ts";
import type {
	ArtifactLineageRecord,
	EventRecord,
	MaterializationStoreGateway,
	ReconciliationPlanBaseline,
	RevisionRecord,
} from "../core/gateways.ts";

export async function exerciseMaterializationStoreConformance(
	createStore: () => MaterializationStoreGateway,
	inspectTarget?: () => unknown,
): Promise<void> {
	const parsed = parseArtifactId("01jxyz8y3jqazj7jrx53w9b3dn");
	if (!parsed.ok) throw new Error("Invalid conformance artifact ID.");
	const store = createStore();
	const artifactId = parsed.artifactId;
	const sourceId = "conformance";

	assertEqual(await store.readCursor({ sourceId }), { type: "missing" });
	assertEqual(
		await store.compareAndSetCursor({ sourceId, expectedCommit: null, nextCommit: "a" }),
		{ type: "updated" },
	);
	assertEqual(await store.readCursor({ sourceId }), {
		type: "found",
		value: { sourceId, commit: "a" },
	});
	assertEqual(
		await store.compareAndSetCursor({ sourceId, expectedCommit: null, nextCommit: "b" }),
		{ type: "mismatch", actual: "a" },
	);
	assertEqual(await store.compareAndSetCursor({ sourceId, expectedCommit: "a", nextCommit: "b" }), {
		type: "updated",
	});
	assertEqual(await store.compareAndSetCursor({ sourceId, expectedCommit: "b", nextCommit: "b" }), {
		type: "updated",
	});

	const baseline: ReconciliationPlanBaseline = {
		sourceId,
		expectedCursor: "b",
		targetCommit: "c",
		mode: "incremental",
		eventReconstruction: "complete",
		planDigest: "sha256:baseline",
		entries: [
			{
				artifactId,
				transition: "revised",
				priorRevisionId: "revision-old",
				currentRevisionId: "revision",
				priorPath: "old/artifact",
				currentPath: "artifact",
				priorClassification: { state: "generic" },
				currentClassification: { state: "generic" },
				priorSchemaVersion: null,
				currentSchemaVersion: null,
				target: null,
			},
		],
	};
	assertEqual(await store.readReconciliationPlanBaseline({ sourceId }), { type: "missing" });
	assertEqual(await store.insertReconciliationPlanBaseline(baseline), { type: "inserted" });
	assertEqual(await store.insertReconciliationPlanBaseline(baseline), { type: "existing" });
	assertEqual(
		await store.insertReconciliationPlanBaseline({ ...baseline, targetCommit: "competing" }),
		{ type: "conflict", message: "Source already has a different reconciliation plan baseline." },
	);
	assertEqual(await store.readReconciliationPlanBaseline({ sourceId }), {
		type: "found",
		value: baseline,
	});
	assertEqual(
		await store.deleteReconciliationPlanBaseline({ sourceId, planDigest: "sha256:other" }),
		{ type: "mismatch", actualDigest: baseline.planDigest },
	);
	assertEqual(
		await store.deleteReconciliationPlanBaseline({ sourceId, planDigest: baseline.planDigest }),
		{ type: "deleted" },
	);
	assertEqual(
		await store.deleteReconciliationPlanBaseline({ sourceId, planDigest: baseline.planDigest }),
		{ type: "missing" },
	);

	const lineage: ArtifactLineageRecord = {
		sourceId,
		artifactId,
		establishedClassification: null,
		lastSchemaVersion: null,
	};
	assertEqual(await store.readLineage({ sourceId, artifactId }), { type: "missing" });
	assertEqual(await store.upsertLineage(lineage), { ok: true });
	assertEqual(await store.upsertLineage(lineage), { ok: true });
	assertEqual(await store.readLineage({ sourceId, artifactId }), {
		type: "found",
		value: lineage,
	});

	const revision: RevisionRecord = {
		sourceId,
		artifactId,
		revisionId: "revision",
		digest: {
			text: "sha256:0102",
			bytes: new Uint8Array([1, 2]),
			manifest: [{ path: "artifact.txt", sha256: "sha256:file" }],
		},
		envelope: { gpId: artifactId, enabled: true },
		firstObservedCommit: "first",
		firstObservedPath: "old/artifact",
	};
	assertEqual(await store.insertRevision(revision), { type: "inserted" });
	assertEqual(
		await store.insertRevision({
			...revision,
			firstObservedCommit: "later",
			firstObservedPath: "new/artifact",
		}),
		{ type: "existing" },
	);
	assertEqual(
		await store.insertRevision({
			...revision,
			digest: { ...revision.digest, bytes: new Uint8Array([1, 3]) },
		}),
		{ type: "conflict", message: "Revision ID already has different content." },
	);
	assertEqual(
		await store.insertRevision({
			...revision,
			digest: {
				...revision.digest,
				manifest: [{ path: "changed.txt", sha256: "sha256:file" }],
			},
		}),
		{ type: "conflict", message: "Revision ID already has different content." },
	);

	const current = {
		sourceId,
		artifactId,
		revisionId: revision.revisionId,
		path: "artifact",
		classification: { state: "generic" as const },
		observedCommit: "b",
		tombstoned: false,
	};
	assertEqual(await store.readCurrentArtifact({ sourceId, artifactId }), { type: "missing" });
	assertEqual(await store.upsertCurrentArtifact(current), { ok: true });
	assertEqual(await store.upsertCurrentArtifact(current), { ok: true });
	assertEqual(await store.readCurrentArtifact({ sourceId, artifactId }), {
		type: "found",
		value: current,
	});
	assertEqual(await store.listCurrentArtifacts({ sourceId }), { ok: true, value: [current] });
	assertEqual(await store.listCurrentArtifacts({ sourceId: "other" }), { ok: true, value: [] });

	const target = conformanceTarget();
	assertEqual(
		await store.tombstoneTargetRow({
			sourceId,
			artifactId,
			target,
			deletedAtCommit: "missing-row",
		}),
		{ ok: true },
	);
	const targetRow = {
		sourceId,
		artifactId,
		revisionId: revision.revisionId,
		path: current.path,
		target,
		fields: [
			{ column: "title", mode: "scalar" as const, value: "first" },
			{ column: "payload", mode: "json" as const, value: { b: 2, a: 1 } },
		],
		clearFields: ["retired"],
	};
	assertEqual(await store.upsertTargetRow(targetRow), { ok: true });
	assertEqual(await store.upsertTargetRow({ ...targetRow, path: "restored" }), { ok: true });
	if (inspectTarget !== undefined)
		assertEqual(inspectTarget(), {
			source_id: sourceId,
			artifact_id: artifactId,
			revision_id: revision.revisionId,
			artifact_path: "restored",
			deleted: false,
			deleted_at_commit: null,
			title: "first",
			payload: { b: 2, a: 1 },
			retired: null,
		});
	assertEqual(
		await store.tombstoneTargetRow({ sourceId, artifactId, target, deletedAtCommit: "deleted" }),
		{ ok: true },
	);
	if (inspectTarget !== undefined)
		assertEqual(inspectTarget(), {
			source_id: sourceId,
			artifact_id: artifactId,
			revision_id: revision.revisionId,
			artifact_path: "restored",
			deleted: true,
			deleted_at_commit: "deleted",
			title: "first",
			payload: { b: 2, a: 1 },
			retired: null,
		});

	const event: EventRecord = {
		eventId: "gpe_conformance",
		sourceId,
		artifactId,
		reconciledCommit: "b",
		eventType: "artifact.created",
		priorRevisionId: null,
		currentRevisionId: revision.revisionId,
		priorPath: null,
		currentPath: current.path,
	};
	assertEqual(await store.insertEvent(event), { type: "inserted", sequence: 1 });
	assertEqual(await store.insertEvent(event), { type: "existing", sequence: 1 });
	assertEqual(await store.insertEvent({ ...event, currentPath: "conflict" }), {
		type: "conflict",
		message: "Event ID already has different content.",
	});

	const observedAt = new Date("2026-01-02T03:04:05.000Z");
	const reconciliationError = {
		sourceId,
		targetCommit: "b",
		subject: artifactId,
		operation: "upsert-target",
		category: "constraint",
		diagnostic: "sanitized",
		observedAt,
	};
	assertEqual(await store.recordReconciliationError(reconciliationError), { ok: true });
	assertEqual(
		await store.recordReconciliationError({
			...reconciliationError,
			diagnostic: "updated",
			observedAt: new Date("2026-01-02T03:05:05.000Z"),
		}),
		{ ok: true },
	);
	assertEqual(
		await store.resolveReconciliationErrors({
			sourceId,
			targetCommit: "b",
			resolvedAt: new Date("2026-01-02T03:06:05.000Z"),
		}),
		{ ok: true, count: 1 },
	);
	assertEqual(
		await store.resolveReconciliationErrors({
			sourceId,
			targetCommit: "b",
			resolvedAt: new Date("2026-01-02T03:07:05.000Z"),
		}),
		{ ok: true, count: 0 },
	);

	const doctor = await store.inspectDoctor({ sourceId, targets: [target] });
	if (!doctor.ok) throw new Error(`Conformance doctor inspection failed: ${doctor.error.message}`);
	assertEqual(doctor.value.controlSchema, { state: "compatible", version: 1 });
	assertEqual(doctor.value.jsonProjection.status, "pass");

	assertEqual(await store.close(), { ok: true });
	assertEqual(await store.close(), { ok: true });
}

function conformanceTarget(): TargetMapping {
	return {
		table: "conformance_target",
		lineage: {
			sourceId: "source_id",
			artifactId: "artifact_id",
			revisionId: "revision_id",
			path: "artifact_path",
			deleted: "deleted",
			deletedAtCommit: "deleted_at_commit",
		},
	};
}

function assertEqual(actual: unknown, expected: unknown): void {
	if (!deepEqual(actual, expected))
		throw new Error(
			`Conformance mismatch: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`,
		);
}

function deepEqual(actual: unknown, expected: unknown): boolean {
	if (actual instanceof Uint8Array && expected instanceof Uint8Array)
		return (
			actual.length === expected.length && actual.every((value, index) => value === expected[index])
		);
	if (Array.isArray(actual) && Array.isArray(expected))
		return (
			actual.length === expected.length &&
			actual.every((value, index) => deepEqual(value, expected[index]))
		);
	if (
		typeof actual === "object" &&
		actual !== null &&
		typeof expected === "object" &&
		expected !== null
	) {
		const actualRecord = actual as Readonly<Record<string, unknown>>;
		const expectedRecord = expected as Readonly<Record<string, unknown>>;
		const keys = Object.keys(actualRecord);
		return (
			keys.length === Object.keys(expectedRecord).length &&
			keys.every((key) => deepEqual(actualRecord[key], expectedRecord[key]))
		);
	}
	return Object.is(actual, expected);
}
