import { expect, test } from "vitest";
import {
	artifactIdSchema,
	reconcile,
	type ArtifactCandidate,
	type ArtifactCurrentRecord,
	type ArtifactKindRegistration,
	type ArtifactLineageRecord,
	type CursorCompareAndSetResult,
	type CursorRecord,
	type EventInsertResult,
	type EventRecord,
	type InsertResult,
	type OperationResult,
	type ReconciliationContext,
	type ReconciliationPlan,
	type RevisionRecord,
	type TargetRowRecord,
} from "@nseng-ai/gitplane";
import {
	InMemoryArtifactGateway,
	InMemoryMaterializationStoreGateway,
	type InMemoryMaterializationStoreState,
} from "@nseng-ai/gitplane/testing";

const ID = artifactIdSchema.parse("01jxyz8y3jqazj7jrx53w9b3dn");
const injected = { code: "injected", message: "backend detail" } as const;
type Boundary =
	| "insertReconciliationPlan"
	| "insertRevision"
	| "upsertLineage"
	| "upsertCurrentArtifact"
	| "upsertTargetRow"
	| "tombstoneTargetRow"
	| "insertEvent"
	| "compareAndSetCursor"
	| "recordReconciliationError"
	| "resolveReconciliationErrors"
	| "deleteReconciliationPlan";
type Timing = "before" | "after";

class FaultStore extends InMemoryMaterializationStoreGateway {
	private fired = false;
	private readonly boundary: Boundary;
	private readonly timing: Timing;
	constructor(state: InMemoryMaterializationStoreState, boundary: Boundary, timing: Timing) {
		super(state);
		this.boundary = boundary;
		this.timing = timing;
	}
	private shouldFail(boundary: Boundary, timing: Timing): boolean {
		if (this.fired || this.boundary !== boundary || this.timing !== timing) return false;
		this.fired = true;
		return true;
	}
	private async operation(
		boundary: Boundary,
		run: () => Promise<OperationResult>,
	): Promise<OperationResult> {
		if (this.shouldFail(boundary, "before")) return { ok: false, error: injected };
		const result = await run();
		return this.shouldFail(boundary, "after") ? { ok: false, error: injected } : result;
	}
	override async insertReconciliationPlan(plan: ReconciliationPlan): Promise<InsertResult> {
		if (this.shouldFail("insertReconciliationPlan", "before"))
			return { type: "error", error: injected };
		const result = await super.insertReconciliationPlan(plan);
		return this.shouldFail("insertReconciliationPlan", "after")
			? { type: "error", error: injected }
			: result;
	}
	override async insertRevision(record: RevisionRecord): Promise<InsertResult> {
		if (this.shouldFail("insertRevision", "before")) return { type: "error", error: injected };
		const result = await super.insertRevision(record);
		return this.shouldFail("insertRevision", "after") ? { type: "error", error: injected } : result;
	}
	override async upsertLineage(record: ArtifactLineageRecord): Promise<OperationResult> {
		return this.operation("upsertLineage", () => super.upsertLineage(record));
	}
	override async upsertCurrentArtifact(record: ArtifactCurrentRecord): Promise<OperationResult> {
		return this.operation("upsertCurrentArtifact", () => super.upsertCurrentArtifact(record));
	}
	override async upsertTargetRow(record: TargetRowRecord): Promise<OperationResult> {
		return this.operation("upsertTargetRow", () => super.upsertTargetRow(record));
	}
	override async tombstoneTargetRow(request: {
		readonly sourceId: string;
		readonly artifactId: typeof ID;
		readonly target: typeof target;
		readonly deletedAtCommit: string;
	}): Promise<OperationResult> {
		return this.operation("tombstoneTargetRow", () => super.tombstoneTargetRow(request));
	}
	override async insertEvent(record: EventRecord): Promise<EventInsertResult> {
		if (this.shouldFail("insertEvent", "before")) return { type: "error", error: injected };
		const result = await super.insertEvent(record);
		return this.shouldFail("insertEvent", "after") ? { type: "error", error: injected } : result;
	}
	override async compareAndSetCursor(request: {
		readonly sourceId: string;
		readonly expectedGeneration: number;
		readonly next: CursorRecord;
	}): Promise<CursorCompareAndSetResult> {
		if (this.shouldFail("compareAndSetCursor", "before")) return { type: "error", error: injected };
		const result = await super.compareAndSetCursor(request);
		return this.shouldFail("compareAndSetCursor", "after")
			? { type: "error", error: injected }
			: result;
	}
	override async recordReconciliationError(
		record: Parameters<InMemoryMaterializationStoreGateway["recordReconciliationError"]>[0],
	): Promise<OperationResult> {
		return this.operation("recordReconciliationError", () =>
			super.recordReconciliationError(record),
		);
	}
	override async resolveReconciliationErrors(request: {
		readonly sourceId: string;
		readonly targetCommit: string;
		readonly resolvedAt: Date;
	}): Promise<OperationResult> {
		return this.operation("resolveReconciliationErrors", () =>
			super.resolveReconciliationErrors(request),
		);
	}
	override async deleteReconciliationPlan(request: {
		readonly sourceId: string;
		readonly attemptId: string;
	}): Promise<OperationResult> {
		return this.operation("deleteReconciliationPlan", () =>
			super.deleteReconciliationPlan(request),
		);
	}
}

const target = {
	table: "items",
	lineage: {
		sourceId: "source_id",
		artifactId: "artifact_id",
		revisionId: "revision_id",
		path: "path",
		deleted: "deleted",
		deletedAtCommit: "deleted_at_commit",
	},
} as const;
const kind: ArtifactKindRegistration = {
	apiVersion: "example.dev/v1",
	kind: "Item",
	schemaVersions: { 1: { fields: { "/name": { target: "name" } } } },
	transitions: [],
	target,
};
function candidate(): ArtifactCandidate {
	return {
		path: "items/a",
		entries: [
			{
				path: "gitplane-artifact.json",
				kind: "regular-file",
				bytes: Buffer.from(
					JSON.stringify({
						gpId: ID,
						gpApiVersion: kind.apiVersion,
						gpKind: kind.kind,
						gpSchemaVersion: 1,
						name: "A",
					}),
				),
			},
		],
	};
}
function artifacts(includeItem = true): InMemoryArtifactGateway {
	const item = candidate();
	return new InMemoryArtifactGateway({
		commits: { requested: { type: "found", value: "target" } },
		commitInventories: [
			{
				commit: "target",
				artifactRoot: "items",
				observation: {
					type: "found",
					value: includeItem
						? [{ path: `${item.path}/gitplane-artifact.json`, kind: "regular-file" }]
						: [],
				},
			},
		],
		commitCandidates: includeItem
			? [{ commit: "target", candidate: { type: "found", value: item } }]
			: [],
	});
}
const clock = { now: () => new Date("2026-01-02T03:04:05.000Z") };
const options = {
	sourceId: "source",
	artifactRoot: "items",
	targetCommitish: "requested",
	kinds: [kind],
} as const;
function context(
	store: InMemoryMaterializationStoreGateway,
	includeItem = true,
): ReconciliationContext {
	return { clock, store, artifacts: artifacts(includeItem) };
}
function durable(state: InMemoryMaterializationStoreState): unknown {
	return {
		cursors: state.cursors,
		lineage: state.lineage,
		currentArtifacts: state.currentArtifacts,
		plans: state.plans,
		revisions: state.revisions,
		targetRows: state.targetRows,
		events: state.events,
	};
}

test.each(
	(
		[
			"insertReconciliationPlan",
			"insertRevision",
			"upsertLineage",
			"upsertCurrentArtifact",
			"upsertTargetRow",
			"insertEvent",
			"compareAndSetCursor",
			"resolveReconciliationErrors",
			"deleteReconciliationPlan",
		] as const
	).flatMap((boundary) => (["before", "after"] as const).map((timing) => ({ boundary, timing }))),
)("retry converges after $timing $boundary failure", async ({ boundary, timing }) => {
	const baseline = new InMemoryMaterializationStoreGateway();
	expect(await reconcile(context(baseline), options)).toMatchObject({ type: "completed" });

	const interrupted = new FaultStore({}, boundary, timing);
	const first = await reconcile(context(interrupted), options);
	expect(["operational-failure", "completed-with-cleanup-pending"]).toContain(first.type);
	const retry = new InMemoryMaterializationStoreGateway(interrupted.snapshot());
	const retried = await reconcile(context(retry), options);
	expect(["completed", "no-op"]).toContain(retried.type);
	expect(durable(retry.snapshot())).toEqual(durable(baseline.snapshot()));
});

test.each(["before", "after"] as const)(
	"best-effort reconciliation error write can fail %s without masking convergence",
	async (timing) => {
		const baseline = new InMemoryMaterializationStoreGateway();
		expect(await reconcile(context(baseline), options)).toMatchObject({ type: "completed" });

		const interrupted = new FaultStore(
			{ failures: { insertEvent: injected } },
			"recordReconciliationError",
			timing,
		);
		expect(await reconcile(context(interrupted), options)).toMatchObject({
			type: "operational-failure",
			operation: "insert-event",
		});
		const retry = new InMemoryMaterializationStoreGateway(interrupted.snapshot());
		expect(await reconcile(context(retry), options)).toMatchObject({ type: "completed" });
		expect(durable(retry.snapshot())).toEqual(durable(baseline.snapshot()));
	},
);

test.each(["before", "after"] as const)(
	"retry converges after %s tombstoneTargetRow failure",
	async (timing) => {
		const initial = new InMemoryMaterializationStoreGateway();
		expect(await reconcile(context(initial), options)).toMatchObject({ type: "completed" });
		const startingState = initial.snapshot();

		const baseline = new InMemoryMaterializationStoreGateway(startingState);
		expect(await reconcile(context(baseline, false), options)).toMatchObject({ type: "completed" });

		const interrupted = new FaultStore(startingState, "tombstoneTargetRow", timing);
		const first = await reconcile(context(interrupted, false), options);
		expect(first).toMatchObject({ type: "operational-failure", operation: "tombstone-target" });
		const retry = new InMemoryMaterializationStoreGateway(interrupted.snapshot());
		expect(await reconcile(context(retry, false), options)).toMatchObject({ type: "completed" });
		expect(durable(retry.snapshot())).toEqual(durable(baseline.snapshot()));
	},
);
