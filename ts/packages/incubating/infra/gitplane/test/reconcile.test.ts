import { expect, test } from "vitest";
import {
	artifactIdSchema,
	reconcile,
	type ArtifactCandidate,
	type GatewayError,
	type ReconciliationContext,
} from "@nseng-ai/gitplane";
import {
	InMemoryArtifactGateway,
	InMemoryMaterializationStoreGateway,
} from "@nseng-ai/gitplane/testing";

const ID = artifactIdSchema.parse("01jxyz8y3jqazj7jrx53w9b3dn");
const failure: GatewayError = { code: "injected", message: "sensitive backend detail" };
const clock = { now: () => new Date("2026-01-02T03:04:05.000Z") };

function candidate(body = "body"): ArtifactCandidate {
	return {
		path: "items/a",
		entries: [
			{
				path: "gitplane-artifact.json",
				kind: "regular-file",
				bytes: Buffer.from(JSON.stringify({ gpId: ID })),
			},
			{ path: "body.txt", kind: "regular-file", bytes: Buffer.from(body) },
		],
	};
}

function artifacts(
	commit = "resolved",
	item: ArtifactCandidate = candidate(),
	commitish = "requested",
): InMemoryArtifactGateway {
	return new InMemoryArtifactGateway({
		commits: { [commitish]: { type: "found", value: commit } },
		commitInventories: [
			{
				commit,
				artifactRoot: "items",
				observation: {
					type: "found",
					value: [
						{ path: `${item.path}/gitplane-artifact.json`, kind: "regular-file" },
						{ path: `${item.path}/body.txt`, kind: "regular-file" },
					],
				},
			},
		],
		commitCandidates: [{ commit, candidate: { type: "found", value: item } }],
	});
}

function context(
	store: InMemoryMaterializationStoreGateway,
	artifactGateway = artifacts(),
): ReconciliationContext {
	return { clock, store, artifacts: artifactGateway };
}

const options = {
	sourceId: "source",
	artifactRoot: "items",
	targetCommitish: "requested",
} as const;

test("initial reconciliation applies canonical control effects and equal target is a no-op", async () => {
	const store = new InMemoryMaterializationStoreGateway();
	const first = await reconcile(context(store), options);
	expect(first).toMatchObject({
		type: "completed",
		resultingCursor: { commit: "resolved", generation: 1 },
		counts: { created: 1 },
	});
	const snapshot = store.snapshot();
	expect(snapshot).toMatchObject({
		plans: [],
		cursors: [{ commit: "resolved", generation: 1 }],
		currentArtifacts: [{ artifactId: ID, tombstoned: false }],
		events: [{ sequence: 1, event: { eventType: "artifact.created" } }],
	});
	const second = await reconcile(context(store), options);
	expect(second).toMatchObject({ type: "no-op", cursor: { generation: 1 } });
	expect(store.snapshot().events).toHaveLength(1);
});

test("matching retry replays the Pending Plan without source or configuration reads", async () => {
	const interrupted = new InMemoryMaterializationStoreGateway({
		failures: { insertEvent: failure },
	});
	expect(await reconcile(context(interrupted), options)).toMatchObject({
		type: "operational-failure",
		operation: "insert-event",
	});
	const state = interrupted.snapshot();
	expect(state.plans).toHaveLength(1);
	const forbiddenSource = new InMemoryArtifactGateway({ failures: { resolveCommit: failure } });
	const retryStore = new InMemoryMaterializationStoreGateway(state);
	const retried = await reconcile(context(retryStore, forbiddenSource), options);
	expect(retried).toMatchObject({
		type: "completed",
		replayedPlan: true,
		resultingCursor: { generation: 1 },
	});
	expect(forbiddenSource.operationLog()).toEqual([]);
	expect(retryStore.snapshot()).toMatchObject({ plans: [], events: [{ sequence: 1 }] });
});

test("a different target recovers the Pending Plan before reconciling requested work", async () => {
	const interrupted = new InMemoryMaterializationStoreGateway({
		failures: { insertEvent: failure },
	});
	await reconcile(context(interrupted), options);
	const retryStore = new InMemoryMaterializationStoreGateway(interrupted.snapshot());
	const requestedSource = artifacts("resolved-new", candidate("new body"), "different");
	const result = await reconcile(context(retryStore, requestedSource), {
		...options,
		targetCommitish: "different",
	});
	expect(result).toMatchObject({
		type: "completed",
		targetCommit: "resolved-new",
		resultingCursor: { generation: 2 },
		recoveredPendingPlan: true,
		counts: { revised: 1 },
	});
	expect(requestedSource.operationLog()).toEqual([
		"resolveCommit:different",
		"inventoryCommitTree:resolved-new:items",
		"readCommitTreeCandidate:resolved-new:items/a",
	]);
	expect(retryStore.snapshot()).toMatchObject({
		plans: [],
		cursors: [{ commit: "resolved-new", generation: 2 }],
		events: [{ sequence: 1 }, { sequence: 2 }],
	});
});

test("post-CAS residue retries cleanup only and never replays source or artifact writes", async () => {
	const interrupted = new InMemoryMaterializationStoreGateway({
		failures: { deleteReconciliationPlan: failure },
	});
	const first = await reconcile(context(interrupted), options);
	expect(first).toMatchObject({
		type: "completed-with-cleanup-pending",
		resultingCursor: { generation: 1 },
	});
	const before = interrupted.snapshot();
	const forbiddenSource = new InMemoryArtifactGateway({ failures: { resolveCommit: failure } });
	const retryStore = new InMemoryMaterializationStoreGateway(before);
	const cleaned = await reconcile(context(retryStore, forbiddenSource), options);
	expect(cleaned).toMatchObject({
		type: "completed",
		cleanupOnly: true,
		cursorAdvanced: false,
	});
	expect(forbiddenSource.operationLog()).toEqual([]);
	const after = retryStore.snapshot();
	expect(after.plans).toEqual([]);
	expect(after.events).toEqual(before.events);
	expect(after.revisions).toEqual(before.revisions);
});

test("source and pre-write structural failures leave no reconciliation residue", async () => {
	const sourceFailureStore = new InMemoryMaterializationStoreGateway();
	const unavailable = new InMemoryArtifactGateway({
		commits: { requested: { type: "unavailable", reason: "missing-object" } },
	});
	expect(await reconcile(context(sourceFailureStore, unavailable), options)).toMatchObject({
		type: "structural-failure",
		code: "target-unavailable",
	});
	expect(sourceFailureStore.snapshot()).toMatchObject({ plans: [], errors: [] });
});
