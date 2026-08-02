import { expect, test } from "vitest";
import { parseArtifactId } from "@nseng-ai/gitplane";
import {
	InMemoryArtifactGateway,
	InMemoryCorpusCheckGateway,
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
	const row = {
		sourceId: "s",
		artifactId,
		revisionId: "r",
		path: "p",
		table: "greetings",
		values: { message: "hello", is_gone: false, gone_at: null },
		deleted: false,
		deletedAtCommit: null,
	};
	const store = new InMemoryMaterializationStoreGateway({ targetRows: [row] });
	expect(
		await store.tombstoneTargetRow({
			sourceId: "s",
			artifactId,
			deletedAtCommit: "deadbeef",
			target: {
				table: "greetings",
				lineage: {
					sourceId: "source_id",
					artifactId: "artifact_id",
					revisionId: "revision_id",
					path: "artifact_path",
					deleted: "is_gone",
					deletedAtCommit: "gone_at",
				},
			},
		}),
	).toEqual({ ok: true });
	expect(store.snapshot().targetRows).toEqual([
		{
			...row,
			values: { message: "hello", is_gone: true, gone_at: "deadbeef" },
			deleted: true,
			deletedAtCommit: "deadbeef",
		},
	]);
});

test.each([
	{
		operation: "readCommitFacts",
		invoke: (gateway: InMemoryArtifactGateway) => gateway.readCommitFacts({ commit: "missing" }),
	},
	{
		operation: "readWorkingTreeSnapshot",
		invoke: (gateway: InMemoryArtifactGateway) =>
			gateway.readWorkingTreeSnapshot({ sourceId: "s", path: "missing" }),
	},
	{
		operation: "readCommitTreeSnapshot",
		invoke: (gateway: InMemoryArtifactGateway) =>
			gateway.readCommitTreeSnapshot({ sourceId: "s", commit: "c", path: "missing" }),
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

test("artifact discovery seeds distinguish roots and commit-root pairs", async () => {
	const gateway = new InMemoryArtifactGateway({
		workingBoundaries: [
			{ artifactRoot: "one", boundaries: [{ path: "one/a" }] },
			{ artifactRoot: "two", boundaries: [{ path: "two/b" }] },
		],
		commitBoundaries: [
			{ commit: "c1", artifactRoot: "one", boundaries: [{ path: "one/old" }] },
			{ commit: "c1", artifactRoot: "two", boundaries: [{ path: "two/old" }] },
			{ commit: "c2", artifactRoot: "one", boundaries: [{ path: "one/new" }] },
		],
	});
	expect(await gateway.discoverWorkingTree({ artifactRoot: "two" })).toMatchObject({
		ok: true,
		value: [{ path: "two/b" }],
	});
	expect(await gateway.discoverCommitTree({ commit: "c1", artifactRoot: "two" })).toMatchObject({
		ok: true,
		value: [{ path: "two/old" }],
	});
	expect(await gateway.discoverCommitTree({ commit: "c2", artifactRoot: "one" })).toMatchObject({
		ok: true,
		value: [{ path: "one/new" }],
	});
});

test("corpus check gateway inventories and reads only working-tree candidates", async () => {
	const gateway = new InMemoryCorpusCheckGateway({
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
