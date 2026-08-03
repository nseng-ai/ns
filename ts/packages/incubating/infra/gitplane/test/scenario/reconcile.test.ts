import { expect, test } from "vitest";
import {
	reconcile,
	type ArtifactCandidate,
	type ArtifactId,
	type ArtifactKindRegistration,
	type ArtifactSnapshot,
} from "@nseng-ai/gitplane";
import {
	InMemoryArtifactGateway,
	InMemoryMaterializationStoreGateway,
} from "@nseng-ai/gitplane/testing";

const A = "01jxyz8y3jqazj7jrx53w9b3dn" as ArtifactId;
const B = "01jxyz8y3jqazj7jrx53w9b3dp" as ArtifactId;
const clock = { now: () => new Date("2026-01-01T00:00:00.000Z") };
const target = {
	table: "greetings",
	lineage: {
		sourceId: "source_id",
		artifactId: "artifact_id",
		revisionId: "revision_id",
		path: "path",
		deleted: "deleted",
		deletedAtCommit: "deleted_at_commit",
	},
};
const kind: ArtifactKindRegistration = {
	apiVersion: "example.dev/v1",
	kind: "Greeting",
	schemaVersions: {
		1: { fields: { "/message": { target: "message" } } },
		2: { fields: { "/message": { target: "message" } } },
	},
	transitions: [{ from: 1, to: 2 }],
	target,
};

function candidate(
	path: string,
	id: ArtifactId,
	message: string,
	classified = false,
	version = 1,
): ArtifactCandidate {
	const marker = classified
		? {
				gpId: id,
				gpApiVersion: "example.dev/v1",
				gpKind: "Greeting",
				gpSchemaVersion: version,
				message,
			}
		: { gpId: id, message };
	return {
		path,
		entries: [
			{
				path: "gitplane-artifact.json",
				kind: "regular-file",
				bytes: Buffer.from(JSON.stringify(marker)),
			},
			{ path: "body.txt", kind: "regular-file", bytes: Buffer.from(message) },
		],
	};
}
function snapshot(commitCandidate: ArtifactCandidate): ArtifactSnapshot {
	const marker = commitCandidate.entries[0];
	if (marker?.kind !== "regular-file") throw new Error("Expected artifact marker.");
	const envelope = JSON.parse(Buffer.from(marker.bytes).toString("utf8")) as Record<
		string,
		unknown
	>;
	const classified = typeof envelope.gpApiVersion === "string";
	return {
		sourceId: "source",
		artifactId: envelope.gpId as ArtifactId,
		path: commitCandidate.path,
		entries: commitCandidate.entries.filter(
			(entry): entry is Extract<typeof entry, { readonly kind: "regular-file" }> =>
				entry.kind === "regular-file",
		),
		envelope,
		classification: classified
			? {
					state: "classified",
					apiVersion: String(envelope.gpApiVersion),
					kind: String(envelope.gpKind),
					schemaVersion: Number(envelope.gpSchemaVersion),
				}
			: { state: "generic" },
	};
}
function gateway(
	commits: Record<string, readonly ArtifactCandidate[]>,
	options: {
		ancestry?: readonly { ancestor: string; descendant: string }[];
		changed?: readonly string[];
		fromCommit?: string;
		toCommit?: string;
	} = {},
) {
	return new InMemoryArtifactGateway({
		commitFacts: Object.keys(commits).map((commit) => ({ commit, parents: [], isMerge: false })),
		...(options.ancestry === undefined ? {} : { ancestry: options.ancestry }),
		commitSnapshots: Object.fromEntries(
			Object.entries(commits).map(([commit, candidates]) => [commit, candidates.map(snapshot)]),
		),
		commitBoundaries: Object.entries(commits).map(([commit, candidates]) => ({
			commit,
			artifactRoot: "artifacts",
			boundaries: candidates.map((item) => ({ path: item.path })),
		})),
		diffs:
			options.changed === undefined
				? []
				: [
						{
							fromCommit: options.fromCommit ?? "old",
							toCommit: options.toCommit ?? "new",
							changedPaths: options.changed,
						},
					],
	});
}

async function run(
	artifacts: InMemoryArtifactGateway,
	store: InMemoryMaterializationStoreGateway,
	targetCommit: string,
	full = false,
) {
	return reconcile(
		{ artifacts, store, clock },
		{ sourceId: "source", artifactRoot: "artifacts", target: targetCommit, full, kinds: [kind] },
	);
}

test("initial full repair materializes all live artifacts without synthetic events", async () => {
	const artifacts = gateway({
		target: [
			candidate("artifacts/b", B, "classified", true),
			candidate("artifacts/a", A, "generic"),
		],
	});
	const store = new InMemoryMaterializationStoreGateway();
	const result = await run(artifacts, store, "target", true);
	expect(result).toMatchObject({
		ok: true,
		data: {
			mode: "full",
			eventReconstruction: "not-applicable",
			transitions: { created: 2 },
			cursorAdvanced: true,
		},
	});
	const snapshot = store.snapshot();
	expect(snapshot.currentArtifacts?.map((item) => item.artifactId)).toEqual([A, B]);
	expect(snapshot.targetRows).toHaveLength(1);
	expect(snapshot.events).toEqual([]);
	expect(snapshot.baselines).toEqual([]);
});

test.each([
	{
		name: "pure outer move",
		oldPath: "artifacts/a",
		newPath: "artifacts/moved/a",
		oldMessage: "same",
		newMessage: "same",
		transition: "moved",
		event: "artifact.moved",
	},
	{
		name: "simultaneous revise and move",
		oldPath: "artifacts/a",
		newPath: "artifacts/moved/a",
		oldMessage: "old",
		newMessage: "new",
		transition: "revised",
		event: "artifact.revised",
	},
] as const)("incremental $name follows event precedence", async (scenario) => {
	const artifacts = gateway(
		{
			old: [candidate(scenario.oldPath, A, scenario.oldMessage)],
			new: [candidate(scenario.newPath, A, scenario.newMessage)],
		},
		{
			ancestry: [{ ancestor: "old", descendant: "new" }],
			changed: [`${scenario.oldPath}/body.txt`, `${scenario.newPath}/body.txt`],
		},
	);
	const store = new InMemoryMaterializationStoreGateway({
		cursors: [{ sourceId: "source", commit: "old" }],
	});
	const result = await run(artifacts, store, "new");
	expect(result).toMatchObject({
		ok: true,
		data: { transitions: { [scenario.transition]: 1 } },
	});
	expect(store.snapshot().events?.[0]?.event.eventType).toBe(scenario.event);
});

test("incremental deletion and restoration preserve identity and emit distinct events", async () => {
	const backing = InMemoryMaterializationStoreGateway.createBackingState();
	const initial = gateway({ old: [candidate("artifacts/a", A, "hello", true)] });
	expect(
		(await run(initial, new InMemoryMaterializationStoreGateway(backing), "old", true)).ok,
	).toBe(true);
	const deletion = gateway(
		{ old: [candidate("artifacts/a", A, "hello", true)], deleted: [] },
		{
			ancestry: [{ ancestor: "old", descendant: "deleted" }],
			changed: ["artifacts/a/body.txt"],
			toCommit: "deleted",
		},
	);
	const deleted = await run(deletion, new InMemoryMaterializationStoreGateway(backing), "deleted");
	if (!deleted.ok) throw new Error(JSON.stringify(deleted.failure));
	expect(deleted).toMatchObject({ ok: true, data: { transitions: { deleted: 1 } } });
	const restoration = gateway(
		{ deleted: [], restored: [candidate("artifacts/restored", A, "hello", true)] },
		{
			ancestry: [{ ancestor: "deleted", descendant: "restored" }],
			changed: ["artifacts/restored/body.txt"],
			fromCommit: "deleted",
			toCommit: "restored",
		},
	);
	expect(
		await run(restoration, new InMemoryMaterializationStoreGateway(backing), "restored"),
	).toMatchObject({ ok: true, data: { transitions: { restored: 1 } } });
	const snapshot = new InMemoryMaterializationStoreGateway(backing).snapshot();
	expect(snapshot.events?.map((item) => item.event.eventType)).toEqual([
		"artifact.deleted",
		"artifact.restored",
	]);
	expect(snapshot.revisions).toHaveLength(1);
});

test("generic to classified creates its first target row as a revision", async () => {
	const artifacts = gateway(
		{
			old: [candidate("artifacts/a", A, "hello")],
			new: [candidate("artifacts/a", A, "hello", true)],
		},
		{
			ancestry: [{ ancestor: "old", descendant: "new" }],
			changed: ["artifacts/a/gitplane-artifact.json"],
		},
	);
	const store = new InMemoryMaterializationStoreGateway({
		cursors: [{ sourceId: "source", commit: "old" }],
	});
	expect(await run(artifacts, store, "new")).toMatchObject({
		ok: true,
		data: { transitions: { revised: 1 } },
	});
	expect(store.snapshot().targetRows).toHaveLength(1);
	expect(store.snapshot().events?.[0]?.event.eventType).toBe("artifact.revised");
});

test.each([
	{
		name: "classified to generic",
		oldClassified: true,
		oldVersion: 1,
		nextClassified: false,
		nextVersion: 1,
		code: "classification-removed",
	},
	{
		name: "schema downgrade",
		oldClassified: true,
		oldVersion: 2,
		nextClassified: true,
		nextVersion: 1,
		code: "schema-transition-not-registered",
	},
] as const)("illegal $name fails before writes", async (scenario) => {
	const artifacts = gateway(
		{
			old: [candidate("artifacts/a", A, "old", scenario.oldClassified, scenario.oldVersion)],
			new: [candidate("artifacts/a", A, "new", scenario.nextClassified, scenario.nextVersion)],
		},
		{ ancestry: [{ ancestor: "old", descendant: "new" }], changed: ["artifacts/a/body.txt"] },
	);
	const store = new InMemoryMaterializationStoreGateway({
		cursors: [{ sourceId: "source", commit: "old" }],
	});
	const result = await run(artifacts, store, "new");
	expect(result).toMatchObject({ ok: false, failure: { code: scenario.code, phase: "plan" } });
	expect(store.operationLog()).not.toContain("insertReconciliationPlanBaseline");
});

test("a registered direct schema transition is accepted", async () => {
	const artifacts = gateway(
		{
			old: [candidate("artifacts/a", A, "old", true, 1)],
			new: [candidate("artifacts/a", A, "new", true, 2)],
		},
		{ ancestry: [{ ancestor: "old", descendant: "new" }], changed: ["artifacts/a/body.txt"] },
	);
	const store = new InMemoryMaterializationStoreGateway({
		cursors: [{ sourceId: "source", commit: "old" }],
	});
	expect(await run(artifacts, store, "new")).toMatchObject({
		ok: true,
		data: { transitions: { revised: 1 } },
	});
});

test("changes outside artifact boundaries reconcile with no transitions", async () => {
	const artifacts = gateway(
		{ old: [candidate("artifacts/a", A, "same")], new: [candidate("artifacts/a", A, "same")] },
		{ ancestry: [{ ancestor: "old", descendant: "new" }], changed: ["README.md"] },
	);
	const store = new InMemoryMaterializationStoreGateway({
		cursors: [{ sourceId: "source", commit: "old" }],
	});
	expect(await run(artifacts, store, "new")).toMatchObject({
		ok: true,
		data: { transitions: { created: 0, revised: 0, moved: 0, deleted: 0 } },
	});
});

test("incremental revision plans all reads before deterministic writes and emits one event", async () => {
	const artifacts = gateway(
		{ old: [candidate("artifacts/a", A, "old")], new: [candidate("artifacts/a", A, "new")] },
		{ ancestry: [{ ancestor: "old", descendant: "new" }], changed: ["artifacts/a/body.txt"] },
	);
	const backing = InMemoryMaterializationStoreGateway.createBackingState({
		cursors: [{ sourceId: "source", commit: "old" }],
	});
	const store = new InMemoryMaterializationStoreGateway(backing);
	const result = await run(artifacts, store, "new");
	expect(result).toMatchObject({
		ok: true,
		data: { transitions: { revised: 1 }, eventReconstruction: "complete" },
	});
	expect(store.snapshot().events?.[0]?.event.eventType).toBe("artifact.revised");
	const log = store.operationLog();
	expect(log.indexOf("insertReconciliationPlanBaseline")).toBeGreaterThan(
		log.lastIndexOf("readReconciliationPlanBaseline"),
	);
	expect(log.slice(log.indexOf("insertRevision"), log.indexOf("insertEvent") + 1)).toEqual([
		"insertRevision",
		"upsertLineage",
		"upsertCurrentArtifact",
		"insertEvent",
	]);
});

test.each([
	{ name: "equal", targetCommit: "old", ancestry: [], status: "not-applicable" },
	{
		name: "older",
		targetCommit: "older",
		ancestry: [{ ancestor: "older", descendant: "old" }],
		status: "skipped",
	},
	{ name: "divergent", targetCommit: "other", ancestry: [], status: "skipped" },
] as const)("$name full repair is legal with the specified event status", async (scenario) => {
	const artifacts = gateway(
		{
			old: [candidate("artifacts/a", A, "old")],
			[scenario.targetCommit]: [candidate("artifacts/a", A, scenario.targetCommit)],
		},
		{ ancestry: scenario.ancestry },
	);
	const store = new InMemoryMaterializationStoreGateway({
		cursors: [{ sourceId: "source", commit: "old" }],
	});
	const result = await run(artifacts, store, scenario.targetCommit, true);
	expect(result).toMatchObject({
		ok: true,
		data: { eventReconstruction: scenario.status, cursorAdvanced: true },
	});
	expect(store.snapshot().events).toEqual([]);
});

test("unavailable prior history still permits full repair without synthetic events", async () => {
	const artifacts = gateway({ target: [candidate("artifacts/a", A, "target")] });
	const store = new InMemoryMaterializationStoreGateway({
		cursors: [{ sourceId: "source", commit: "missing" }],
	});
	const result = await run(artifacts, store, "target", true);
	expect(result).toMatchObject({
		ok: true,
		data: { eventReconstruction: "skipped", cursorAdvanced: true },
	});
	expect(store.snapshot().events).toEqual([]);
});

test("full repair tombstones absent classified rows and preserves their values", async () => {
	const initialArtifacts = gateway({ old: [candidate("artifacts/a", A, "hello", true)] });
	const backing = InMemoryMaterializationStoreGateway.createBackingState();
	expect(
		(await run(initialArtifacts, new InMemoryMaterializationStoreGateway(backing), "old", true)).ok,
	).toBe(true);
	const repairArtifacts = gateway({ old: [candidate("artifacts/a", A, "hello", true)], empty: [] });
	const result = await run(
		repairArtifacts,
		new InMemoryMaterializationStoreGateway(backing),
		"empty",
		true,
	);
	expect(result).toMatchObject({
		ok: true,
		data: { eventReconstruction: "skipped", transitions: { deleted: 1 } },
	});
	const snapshot = new InMemoryMaterializationStoreGateway(backing).snapshot();
	expect(snapshot.currentArtifacts?.[0]?.tombstoned).toBe(true);
	expect(snapshot.targetRows?.[0]?.values).toMatchObject({
		message: "hello",
		deleted: true,
		deleted_at_commit: "empty",
	});
	expect(snapshot.events).toEqual([]);
});

test("same-path ID replacement is rejected before writes", async () => {
	const artifacts = gateway(
		{
			old: [candidate("artifacts/a", A, "old")],
			new: [candidate("artifacts/a", B, "new")],
		},
		{ ancestry: [{ ancestor: "old", descendant: "new" }], changed: ["artifacts/a/body.txt"] },
	);
	const store = new InMemoryMaterializationStoreGateway({
		cursors: [{ sourceId: "source", commit: "old" }],
	});
	expect(await run(artifacts, store, "new")).toMatchObject({
		ok: false,
		failure: { code: "same-path-id-replacement", phase: "plan" },
	});
	expect(store.operationLog()).not.toContain("insertReconciliationPlanBaseline");
});

test("unchanged candidate is counted without emitting an event", async () => {
	const artifacts = gateway(
		{ old: [candidate("artifacts/a", A, "same")], new: [candidate("artifacts/a", A, "same")] },
		{ ancestry: [{ ancestor: "old", descendant: "new" }], changed: ["artifacts/a/body.txt"] },
	);
	const store = new InMemoryMaterializationStoreGateway({
		cursors: [{ sourceId: "source", commit: "old" }],
	});
	expect(await run(artifacts, store, "new")).toMatchObject({
		ok: true,
		data: { transitions: { unchanged: 1 } },
	});
	expect(store.snapshot().events).toEqual([]);
});

test("artifact ID order deterministically controls event sequence", async () => {
	const artifacts = gateway(
		{
			old: [],
			new: [candidate("artifacts/b", B, "b"), candidate("artifacts/a", A, "a")],
		},
		{
			ancestry: [{ ancestor: "old", descendant: "new" }],
			changed: ["artifacts/b/body.txt", "artifacts/a/body.txt"],
		},
	);
	const store = new InMemoryMaterializationStoreGateway({
		cursors: [{ sourceId: "source", commit: "old" }],
	});
	expect((await run(artifacts, store, "new")).ok).toBe(true);
	expect(store.snapshot().events?.map((item) => item.event.artifactId)).toEqual([A, B]);
	expect(store.snapshot().events?.map((item) => item.sequence)).toEqual([1, 2]);
});

test("planning failure from target-wide duplicate IDs performs no writes", async () => {
	const artifacts = gateway(
		{
			old: [candidate("artifacts/a", A, "old")],
			new: [candidate("artifacts/a", A, "new"), candidate("artifacts/unchanged", A, "duplicate")],
		},
		{ ancestry: [{ ancestor: "old", descendant: "new" }], changed: ["artifacts/a/body.txt"] },
	);
	const store = new InMemoryMaterializationStoreGateway({
		cursors: [{ sourceId: "source", commit: "old" }],
	});
	const result = await run(artifacts, store, "new");
	expect(result).toMatchObject({
		ok: false,
		failure: { code: "duplicate-artifact-id", phase: "plan" },
	});
	expect(store.operationLog()).not.toContain("insertReconciliationPlanBaseline");
	expect(store.snapshot().errors).toEqual([]);
});

test("partial full repair retains already-tombstoned absent IDs from its frozen baseline", async () => {
	const oldArtifacts = gateway({
		old: [candidate("artifacts/a", A, "old-a", true), candidate("artifacts/b", B, "old-b", true)],
	});
	const backing = InMemoryMaterializationStoreGateway.createBackingState();
	expect(
		(await run(oldArtifacts, new InMemoryMaterializationStoreGateway(backing), "old", true)).ok,
	).toBe(true);
	const repairArtifacts = gateway({
		old: [candidate("artifacts/a", A, "old-a", true), candidate("artifacts/b", B, "old-b", true)],
		new: [candidate("artifacts/b", B, "new-b", true)],
	});
	const failed = await run(
		repairArtifacts,
		new InMemoryMaterializationStoreGateway(backing, {
			upsertTargetRow: { code: "offline", message: "target offline" },
		}),
		"new",
		true,
	);
	expect(failed).toMatchObject({
		ok: false,
		failure: { operation: "upsertTargetRow", cursorAdvanced: false },
	});
	const partial = new InMemoryMaterializationStoreGateway(backing).snapshot();
	expect(partial.currentArtifacts?.find((item) => item.artifactId === A)?.tombstoned).toBe(true);
	expect(partial.baselines?.[0]?.entries.map((item) => item.artifactId)).toEqual([A, B]);
	const competing = gateway({
		old: [candidate("artifacts/a", A, "old-a", true), candidate("artifacts/b", B, "old-b", true)],
		other: [candidate("artifacts/b", B, "other-b", true)],
	});
	expect(
		await run(competing, new InMemoryMaterializationStoreGateway(backing), "other", true),
	).toMatchObject({
		ok: false,
		failure: { code: "reconciliation-baseline-conflict", cursorAdvanced: false },
	});

	const retried = await run(
		repairArtifacts,
		new InMemoryMaterializationStoreGateway(backing),
		"new",
		true,
	);
	expect(retried).toMatchObject({
		ok: true,
		data: { transitions: { revised: 1, deleted: 1 }, cursorAdvanced: true },
	});
	const completed = new InMemoryMaterializationStoreGateway(backing).snapshot();
	expect(completed.currentArtifacts?.find((item) => item.artifactId === A)?.tombstoned).toBe(true);
	expect(completed.cursors?.[0]?.commit).toBe("new");
	expect(completed.baselines).toEqual([]);
});

test("normal equal-cursor resolution failure is best-effort durably recorded", async () => {
	const artifacts = gateway({ target: [] });
	const backing = InMemoryMaterializationStoreGateway.createBackingState({
		cursors: [{ sourceId: "source", commit: "target" }],
	});
	const result = await run(
		artifacts,
		new InMemoryMaterializationStoreGateway(backing, {
			resolveReconciliationErrors: { code: "offline", message: "error store offline" },
		}),
		"target",
	);
	expect(result).toMatchObject({
		ok: false,
		failure: { phase: "cleanup", operation: "resolveReconciliationErrors" },
	});
	expect(new InMemoryMaterializationStoreGateway(backing).snapshot().errors).toMatchObject([
		{
			sourceId: "source",
			targetCommit: "target",
			operation: "resolveReconciliationErrors",
			resolved: false,
		},
	]);
});

test.each([
	"insertReconciliationPlanBaseline",
	"insertRevision",
	"upsertLineage",
	"upsertCurrentArtifact",
	"compareAndSetCursor",
	"resolveReconciliationErrors",
	"deleteReconciliationPlanBaseline",
] as const)("operational %s failure is durable and converges on retry", async (operation) => {
	const artifacts = gateway(
		{ old: [candidate("artifacts/a", A, "old")], new: [candidate("artifacts/a", A, "new")] },
		{ ancestry: [{ ancestor: "old", descendant: "new" }], changed: ["artifacts/a/body.txt"] },
	);
	const backing = InMemoryMaterializationStoreGateway.createBackingState({
		cursors: [{ sourceId: "source", commit: "old" }],
	});
	const failed = await run(
		artifacts,
		new InMemoryMaterializationStoreGateway(backing, {
			[operation]: { code: "offline", message: `${operation} offline` },
		}),
		"new",
	);
	expect(failed).toMatchObject({ ok: false, failure: { operation } });
	expect(new InMemoryMaterializationStoreGateway(backing).snapshot().errors).toHaveLength(1);
	const retried = await run(artifacts, new InMemoryMaterializationStoreGateway(backing), "new");
	expect(retried).toMatchObject({ ok: true, data: { errorsResolved: 1 } });
});

test.each([
	{ name: "classified target upsert", oldClassified: true },
	{ name: "generic to classified target upsert", oldClassified: false },
] as const)("$name failure converges over shared state", async ({ oldClassified }) => {
	const operation = "upsertTargetRow";
	const artifacts = gateway(
		{
			old: [candidate("artifacts/a", A, "old", oldClassified)],
			new: [candidate("artifacts/a", A, "new", true)],
		},
		{ ancestry: [{ ancestor: "old", descendant: "new" }], changed: ["artifacts/a/body.txt"] },
	);
	const backing = InMemoryMaterializationStoreGateway.createBackingState({
		cursors: [{ sourceId: "source", commit: "old" }],
	});
	const failed = await run(
		artifacts,
		new InMemoryMaterializationStoreGateway(backing, {
			[operation]: { code: "offline", message: "target offline" },
		}),
		"new",
	);
	expect(failed).toMatchObject({ ok: false, failure: { operation } });
	expect(
		await run(artifacts, new InMemoryMaterializationStoreGateway(backing), "new"),
	).toMatchObject({
		ok: true,
	});
});

test("cursor mismatch is structural and does not create a durable operational error", async () => {
	const artifacts = gateway(
		{ old: [candidate("artifacts/a", A, "old")], new: [candidate("artifacts/a", A, "new")] },
		{ ancestry: [{ ancestor: "old", descendant: "new" }], changed: ["artifacts/a/body.txt"] },
	);
	const store = new (class extends InMemoryMaterializationStoreGateway {
		override async compareAndSetCursor() {
			return { type: "mismatch" as const, actual: "competing" };
		}
	})({ cursors: [{ sourceId: "source", commit: "old" }] });
	const result = await run(artifacts, store, "new");
	expect(result).toMatchObject({
		ok: false,
		failure: { code: "cursor-mismatch", operation: "compareAndSetCursor", cursorAdvanced: false },
	});
	expect(store.snapshot().errors).toEqual([]);
});

test("partial write retry over shared state converges with stable event identity", async () => {
	const artifacts = gateway(
		{ old: [candidate("artifacts/a", A, "old")], new: [candidate("artifacts/a", A, "new")] },
		{ ancestry: [{ ancestor: "old", descendant: "new" }], changed: ["artifacts/a/body.txt"] },
	);
	const backing = InMemoryMaterializationStoreGateway.createBackingState({
		cursors: [{ sourceId: "source", commit: "old" }],
	});
	const failed = await run(
		artifacts,
		new InMemoryMaterializationStoreGateway(backing, {
			insertEvent: { code: "offline", message: "event store offline" },
		}),
		"new",
	);
	expect(failed).toMatchObject({
		ok: false,
		failure: { operation: "insertEvent", cursorAdvanced: false },
	});
	const retried = await run(artifacts, new InMemoryMaterializationStoreGateway(backing), "new");
	expect(retried).toMatchObject({ ok: true, data: { errorsResolved: 1 } });
	const snapshot = new InMemoryMaterializationStoreGateway(backing).snapshot();
	expect(snapshot.revisions).toHaveLength(1);
	expect(snapshot.events).toHaveLength(1);
	expect(snapshot.cursors?.[0]?.commit).toBe("new");
	expect(snapshot.baselines).toEqual([]);
});
