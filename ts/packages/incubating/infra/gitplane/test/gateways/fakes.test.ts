import { expect, test } from "vitest";
import { parseArtifactId } from "@nseng-ai/gitplane";
import {
	exerciseMaterializationStoreConformance,
	InMemoryArtifactGateway,
	InMemoryMaterializationStoreGateway,
} from "@nseng-ai/gitplane/testing";
const parsed = parseArtifactId("01jxyz8y3jqazj7jrx53w9b3dn");
if (!parsed.ok) throw new Error();
const artifactId = parsed.artifactId;
const event = {
	eventId: "gpe_x",
	sourceId: "s",
	artifactId,
	reconciledCommit: "c",
	eventType: "artifact.created" as const,
	priorRevisionId: null,
	currentRevisionId: "r",
	priorPath: null,
	currentPath: "p",
};
test("in-memory store satisfies shared conformance", async () => {
	let store: InMemoryMaterializationStoreGateway | undefined;
	await exerciseMaterializationStoreConformance(
		() => {
			store = new InMemoryMaterializationStoreGateway();
			return store;
		},
		() => store?.snapshot().targetRows?.[0]?.values,
		() => store?.snapshot().errors,
	);
});

test("conformance failures name the clause and preserve strict Date assertion details", async () => {
	let store: InMemoryMaterializationStoreGateway | undefined;
	try {
		await exerciseMaterializationStoreConformance(
			() => {
				store = new InMemoryMaterializationStoreGateway();
				return store;
			},
			undefined,
			() =>
				store?.snapshot().errors?.map((error) => ({
					...error,
					firstObservedAt: new Date("2026-01-02T03:04:06.000Z"),
				})),
		);
		expect.unreachable("Expected conformance to reject the unequal Date.");
	} catch (error) {
		expect(error).toBeInstanceOf(Error);
		if (!(error instanceof Error)) throw error;
		expect(error.message).toContain("reconciliation error lifecycle");
		expect(error.cause).toBeInstanceOf(Error);
		if (!(error.cause instanceof Error)) throw error.cause;
		expect(error.cause.message).toContain("2026-01-02T03:04:06.000Z");
		expect(error.cause.message).toContain("2026-01-02T03:04:05.000Z");
	}
});

test("cursor CAS and event insertion are idempotent", async () => {
	const store = new InMemoryMaterializationStoreGateway();
	expect(
		await store.compareAndSetCursor({ sourceId: "s", expectedCommit: null, nextCommit: "a" }),
	).toEqual({ type: "updated" });
	expect(
		await store.compareAndSetCursor({ sourceId: "s", expectedCommit: null, nextCommit: "b" }),
	).toEqual({ type: "mismatch", actual: "a" });
	expect(await store.insertEvent(event)).toEqual({ type: "inserted", sequence: 1 });
	expect(
		await store.insertEvent({
			currentPath: "p",
			priorPath: null,
			currentRevisionId: "r",
			priorRevisionId: null,
			eventType: "artifact.created",
			reconciledCommit: "c",
			artifactId,
			sourceId: "s",
			eventId: "gpe_x",
		}),
	).toEqual({ type: "existing", sequence: 1 });
	expect(await store.insertEvent({ ...event, currentPath: "other" })).toEqual({
		type: "conflict",
		message: "Event ID already has different content.",
	});
});
test("revision retries ignore later first-observed locators", async () => {
	const original = {
		sourceId: "s",
		artifactId,
		revisionId: "r",
		digest: {
			text: "sha256:00" as const,
			bytes: new Uint8Array([0]),
			manifest: [],
		},
		envelope: { gpId: artifactId },
		firstObservedCommit: "first",
		firstObservedPath: "old/path",
	};
	const store = new InMemoryMaterializationStoreGateway({ revisions: [original] });
	expect(
		await store.insertRevision({
			...original,
			firstObservedCommit: "later",
			firstObservedPath: "new/path",
		}),
	).toEqual({ type: "existing" });
	expect(store.snapshot().revisions).toEqual([original]);
});

test("target tombstones preserve projected values and apply custom lineage columns", async () => {
	const target = {
		table: "greetings",
		lineage: {
			sourceId: "source_id",
			artifactId: "artifact_id",
			revisionId: "revision_id",
			path: "artifact_path",
			deleted: "is_gone",
			deletedAtCommit: "gone_at",
		},
	};
	const row = {
		table: target.table,
		sourceId: "s",
		artifactId,
		values: {
			source_id: "s",
			artifact_id: artifactId,
			revision_id: "r",
			artifact_path: "p",
			message: "hello",
			is_gone: false,
			gone_at: null,
		},
	};
	const store = new InMemoryMaterializationStoreGateway({ targetRows: [row] });
	expect(
		await store.tombstoneTargetRow({
			sourceId: "s",
			artifactId,
			deletedAtCommit: "deadbeef",
			target,
		}),
	).toEqual({ ok: true });
	expect(store.snapshot().targetRows).toEqual([
		{
			...row,
			values: { ...row.values, is_gone: true, gone_at: "deadbeef" },
		},
	]);
});

test.each([
	{
		operation: "readCommitFacts",
		invoke: (gateway: InMemoryArtifactGateway) => gateway.readCommitFacts({ commit: "missing" }),
	},
	{
		operation: "readCommitTreeCandidate",
		invoke: (gateway: InMemoryArtifactGateway) =>
			gateway.readCommitTreeCandidate({ commit: "c", path: "missing" }),
	},
	{
		operation: "diffCommits",
		invoke: (gateway: InMemoryArtifactGateway) =>
			gateway.diffCommits({ fromCommit: "a", toCommit: "b" }),
	},
] as const)(
	"$operation injected failure takes precedence over missing seeds",
	async ({ operation, invoke }) => {
		const failure = { code: "injected", message: operation };
		const gateway = new InMemoryArtifactGateway({ failures: { [operation]: failure } });
		expect(await invoke(gateway)).toEqual({ ok: false, error: failure });
	},
);

test("commit inventories distinguish commit-root pairs and preserve unavailability", async () => {
	const gateway = new InMemoryArtifactGateway({
		commitInventories: [
			{
				commit: "c1",
				artifactRoot: "two",
				observation: { type: "found", value: [{ path: "two/old", kind: "directory" }] },
			},
			{
				commit: "c2",
				artifactRoot: "one",
				observation: { type: "unavailable", reason: "incomplete-history" },
			},
		],
	});
	expect(await gateway.inventoryCommitTree({ commit: "c1", artifactRoot: "two" })).toEqual({
		ok: true,
		value: { type: "found", value: [{ path: "two/old", kind: "directory" }] },
	});
	expect(await gateway.inventoryCommitTree({ commit: "c2", artifactRoot: "one" })).toEqual({
		ok: true,
		value: { type: "unavailable", reason: "incomplete-history" },
	});
});

test("artifact gateway inventories and reads working-tree candidates", async () => {
	const gateway = new InMemoryArtifactGateway({
		workingInventories: [
			{ artifactRoot: "one", entries: [{ path: "one/a", kind: "directory" }] },
			{ artifactRoot: "two", entries: [{ path: "two/b", kind: "directory" }] },
		],
		workingCandidates: [{ path: "two/b", entries: [] }],
	});
	expect(await gateway.inventoryWorkingTree({ artifactRoot: "two" })).toEqual({
		ok: true,
		value: [{ path: "two/b", kind: "directory" }],
	});
	expect(await gateway.readWorkingTreeCandidate({ path: "two/b" })).toEqual({
		ok: true,
		value: { path: "two/b", entries: [] },
	});
	expect(gateway.operationLog()).toEqual([
		"inventoryWorkingTree",
		"readWorkingTreeCandidate:two/b",
	]);
});

test("snapshots defensively copy generic state without target rows", () => {
	const current = {
		sourceId: "s",
		artifactId,
		revisionId: "r",
		path: "p",
		classification: { state: "generic" as const },
		observedCommit: "c",
		tombstoned: false,
	};
	const store = new InMemoryMaterializationStoreGateway({ currentArtifacts: [current] });
	const snapshot = store.snapshot();
	expect(snapshot.targetRows).toEqual([]);
	expect(snapshot.currentArtifacts).toEqual([current]);
});
