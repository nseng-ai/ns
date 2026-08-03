import { deepStrictEqual } from "node:assert/strict";
import { parseArtifactId } from "../core/artifact.ts";
import type { TargetMapping } from "../core/domain.ts";
import type {
	ArtifactLineageRecord,
	EventRecord,
	MaterializationStoreGateway,
	RevisionRecord,
} from "../core/gateways.ts";

export async function exerciseMaterializationStoreConformance(
	createStore: () => MaterializationStoreGateway,
	inspectTarget?: () => unknown,
	inspectReconciliationErrors?: () => unknown,
): Promise<void> {
	const parsed = parseArtifactId("01jxyz8y3jqazj7jrx53w9b3dn");
	if (!parsed.ok) throw new Error("Invalid conformance artifact ID.");
	const store = createStore();
	const artifactId = parsed.artifactId;
	const sourceId = "conformance";

	await step("cursor compare-and-set", async () => {
		deepStrictEqual(await store.readCursor({ sourceId }), { type: "missing" });
		deepStrictEqual(
			await store.compareAndSetCursor({ sourceId, expectedCommit: null, nextCommit: "a" }),
			{ type: "updated" },
		);
		deepStrictEqual(await store.readCursor({ sourceId }), {
			type: "found",
			value: { sourceId, commit: "a" },
		});
		deepStrictEqual(
			await store.compareAndSetCursor({ sourceId, expectedCommit: null, nextCommit: "b" }),
			{ type: "mismatch", actual: "a" },
		);
		deepStrictEqual(
			await store.compareAndSetCursor({ sourceId, expectedCommit: "a", nextCommit: "b" }),
			{ type: "updated" },
		);
	});

	const lineage: ArtifactLineageRecord = {
		sourceId,
		artifactId,
		establishedClassification: null,
		lastSchemaVersion: null,
	};
	await step("artifact lineage", async () => {
		deepStrictEqual(await store.readLineage({ sourceId, artifactId }), { type: "missing" });
		deepStrictEqual(await store.upsertLineage(lineage), { ok: true });
		deepStrictEqual(await store.upsertLineage(lineage), { ok: true });
		deepStrictEqual(await store.readLineage({ sourceId, artifactId }), {
			type: "found",
			value: lineage,
		});
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
	await step("revision idempotency and conflicts", async () => {
		deepStrictEqual(await store.insertRevision(revision), { type: "inserted" });
		deepStrictEqual(
			await store.insertRevision({
				...revision,
				firstObservedCommit: "later",
				firstObservedPath: "new/artifact",
			}),
			{ type: "existing" },
		);
		deepStrictEqual(
			await store.insertRevision({
				...revision,
				digest: { ...revision.digest, bytes: new Uint8Array([1, 3]) },
			}),
			{ type: "conflict", message: "Revision ID already has different content." },
		);
		deepStrictEqual(
			await store.insertRevision({
				...revision,
				digest: {
					...revision.digest,
					manifest: [{ path: "changed.txt", sha256: "sha256:file" }],
				},
			}),
			{ type: "conflict", message: "Revision ID already has different content." },
		);
	});

	const current = {
		sourceId,
		artifactId,
		revisionId: revision.revisionId,
		path: "artifact",
		classification: { state: "generic" as const },
		observedCommit: "b",
		tombstoned: false,
	};
	await step("current artifact state", async () => {
		deepStrictEqual(await store.readCurrentArtifact({ sourceId, artifactId }), {
			type: "missing",
		});
		deepStrictEqual(await store.upsertCurrentArtifact(current), { ok: true });
		deepStrictEqual(await store.upsertCurrentArtifact(current), { ok: true });
		deepStrictEqual(await store.readCurrentArtifact({ sourceId, artifactId }), {
			type: "found",
			value: current,
		});
		deepStrictEqual(await store.listCurrentArtifacts({ sourceId }), {
			ok: true,
			value: [current],
		});
		deepStrictEqual(await store.listCurrentArtifacts({ sourceId: "other" }), {
			ok: true,
			value: [],
		});
	});

	const target = conformanceTarget();
	await step("missing target tombstone", async () => {
		deepStrictEqual(
			await store.tombstoneTargetRow({
				sourceId,
				artifactId,
				target,
				deletedAtCommit: "missing-row",
			}),
			{ ok: true },
		);
	});

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
	await step("target upsert and restore", async () => {
		deepStrictEqual(await store.upsertTargetRow(targetRow), { ok: true });
		deepStrictEqual(await store.upsertTargetRow({ ...targetRow, path: "restored" }), {
			ok: true,
		});
		if (inspectTarget !== undefined)
			deepStrictEqual(inspectTarget(), {
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
	});

	await step("target tombstone preservation", async () => {
		deepStrictEqual(
			await store.tombstoneTargetRow({
				sourceId,
				artifactId,
				target,
				deletedAtCommit: "deleted",
			}),
			{ ok: true },
		);
		if (inspectTarget !== undefined)
			deepStrictEqual(inspectTarget(), {
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
	await step("event idempotency and conflicts", async () => {
		deepStrictEqual(await store.insertEvent(event), { type: "inserted", sequence: 1 });
		deepStrictEqual(await store.insertEvent(event), { type: "existing", sequence: 1 });
		deepStrictEqual(await store.insertEvent({ ...event, currentPath: "conflict" }), {
			type: "conflict",
			message: "Event ID already has different content.",
		});
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
	await step("reconciliation error lifecycle", async () => {
		deepStrictEqual(await store.recordReconciliationError(reconciliationError), { ok: true });
		deepStrictEqual(
			await store.recordReconciliationError({
				...reconciliationError,
				diagnostic: "updated",
				observedAt: new Date("2026-01-02T03:05:05.000Z"),
			}),
			{ ok: true },
		);
		const resolvedAt = new Date("2026-01-02T03:06:05.000Z");
		deepStrictEqual(
			await store.resolveReconciliationErrors({ sourceId, targetCommit: "b", resolvedAt }),
			{ ok: true },
		);
		if (inspectReconciliationErrors !== undefined)
			deepStrictEqual(inspectReconciliationErrors(), [
				{
					...reconciliationError,
					diagnostic: "updated",
					firstObservedAt: observedAt,
					lastObservedAt: resolvedAt,
					attemptCount: 2,
					resolved: true,
				},
			]);
	});

	await step("doctor introspection", async () => {
		const doctor = await store.inspectDoctor({ targets: [target] });
		if (!doctor.ok)
			throw new Error(`Conformance doctor inspection failed: ${doctor.error.message}`);
		deepStrictEqual(doctor.value.controlSchema, { state: "compatible", version: 1 });
		deepStrictEqual(doctor.value.jsonProjection.status, "pass");
	});

	await step("idempotent close", async () => {
		deepStrictEqual(await store.close(), { ok: true });
		deepStrictEqual(await store.close(), { ok: true });
	});
}

async function step(name: string, run: () => Promise<void>): Promise<void> {
	try {
		await run();
	} catch (cause) {
		throw new Error(`Materialization store conformance step failed: ${name}`, { cause });
	}
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
