import { expect, test } from "vitest";
import type {
	ArtifactCandidate,
	ArtifactClassification,
	ArtifactCurrentRecord,
	ArtifactKindRegistration,
	ArtifactLineageRecord,
	MaterializationSnapshot,
	TargetSnapshotFacts,
} from "@nseng-ai/gitplane";
import {
	artifactIdSchema,
	deriveEventId,
	deriveRevisionId,
	digestArtifactContent,
	parseArtifactId,
	parseReconciliationPlan,
	prepareArtifactMaterialization,
	prepareResultingCursor,
	reconciliationPlanSchema,
} from "@nseng-ai/gitplane";
import { deriveReconciliationPlan } from "../../src/core/reconciliation-plan.ts";

const parsedArtifactId = parseArtifactId("01jxyz8y3jqazj7jrx53w9b3dn");
if (!parsedArtifactId.ok) throw new Error("Invalid fixture artifact ID.");
const artifactId = parsedArtifactId.artifactId;
const digestHex = "01".repeat(32);

function planFixture() {
	return {
		schemaVersion: 1 as const,
		sourceId: "acme/greetings",
		attemptId: "gpa_attempt",
		targetCommit: "abc123",
		targetCommitish: "HEAD",
		expectedCursor: { commit: "prior", generation: 7 },
		artifactMaterialization: [
			{
				artifactId,
				outcome: "artifact.revised" as const,
				prior: {
					revisionId: "gpr_prior",
					path: "greetings/old",
					classification: { state: "generic" as const },
				},
				revision: {
					revisionId: "gpr_current",
					digest: {
						text: `sha256:${digestHex}`,
						bytes: Array.from({ length: 32 }, () => 1),
						manifest: [{ path: "gitplane-artifact.json", sha256: digestHex }],
					},
					envelope: { gpId: artifactId, message: "hello" },
				},
				path: "greetings/current",
				classification: {
					state: "classified" as const,
					apiVersion: "example/v1",
					kind: "Greeting",
					schemaVersion: 1,
				},
				lineage: {
					establishedClassification: {
						state: "classified" as const,
						apiVersion: "example/v1",
						kind: "Greeting",
						schemaVersion: 1,
					},
					lastSchemaVersion: 1,
				},
				target: {
					type: "upsert" as const,
					mapping: {
						table: "greetings",
						lineage: {
							sourceId: "source_id",
							artifactId: "artifact_id",
							revisionId: "revision_id",
							path: "artifact_path",
							deleted: "deleted",
							deletedAtCommit: "deleted_at_commit",
						},
					},
					fields: [{ column: "message", mode: "scalar" as const, value: "hello" }],
					clearFields: ["retired"],
				},
			},
		],
		completion: { created: 0, restored: 0, revised: 1, unchanged: 0, deleted: 0 },
	};
}

test("parses canonical initial and non-initial plans and prepares the Resulting Cursor", () => {
	const nonInitial = parseReconciliationPlan(planFixture());
	expect(prepareResultingCursor(nonInitial)).toEqual({
		sourceId: "acme/greetings",
		commit: "abc123",
		generation: 8,
	});
	const initial = parseReconciliationPlan({
		...planFixture(),
		expectedCursor: null,
	});
	expect(prepareResultingCursor(initial)).toEqual({
		sourceId: "acme/greetings",
		commit: "abc123",
		generation: 1,
	});
});

test("prepares live Gateway records and converts planned digest bytes explicitly", () => {
	const plan = parseReconciliationPlan(planFixture());
	const planned = plan.artifactMaterialization[0];
	if (planned === undefined) throw new Error("Missing fixture materialization.");
	const prepared = prepareArtifactMaterialization(plan, planned);
	expect(prepared.revision).toMatchObject({
		sourceId: plan.sourceId,
		artifactId,
		revisionId: "gpr_current",
		digest: { bytes: new Uint8Array(Array.from({ length: 32 }, () => 1)) },
		firstObservedCommit: plan.targetCommit,
		firstObservedPath: "greetings/current",
	});
	expect(prepared.current).toMatchObject({
		sourceId: plan.sourceId,
		artifactId,
		tombstoned: false,
	});
	expect(prepared.lineage).toMatchObject({ sourceId: plan.sourceId, artifactId });
	expect(prepared.target).toMatchObject({
		type: "upsert",
		record: { sourceId: plan.sourceId, artifactId, revisionId: "gpr_current" },
	});
	expect(prepared.event).toEqual({
		eventId: deriveEventId({
			sourceId: plan.sourceId,
			artifactId,
			reconciliationGeneration: 8,
			attemptId: plan.attemptId,
			reconciledCommit: plan.targetCommit,
			eventType: "artifact.revised",
		}),
		sourceId: plan.sourceId,
		artifactId,
		reconciliationGeneration: 8,
		attemptId: plan.attemptId,
		reconciledCommit: plan.targetCommit,
		eventType: "artifact.revised",
		priorRevisionId: "gpr_prior",
		currentRevisionId: "gpr_current",
		priorPath: "greetings/old",
		currentPath: "greetings/current",
	});
	expect(JSON.parse(JSON.stringify(plan)).artifactMaterialization[0].revision.digest.bytes).toEqual(
		Array.from({ length: 32 }, () => 1),
	);
});

test("rejects non-canonical planned ordering and duplicate artifact IDs", () => {
	const fixture = planFixture();
	const duplicate = structuredClone(fixture.artifactMaterialization[0]);
	expect(
		reconciliationPlanSchema.safeParse({
			...fixture,
			artifactMaterialization: [fixture.artifactMaterialization[0], duplicate],
		}).success,
	).toBe(false);
});

test("rejects arbitrary, negative, and non-integer completion counters", () => {
	const fixture = planFixture();
	for (const completion of [
		{ ...fixture.completion, moved: 1 },
		{ ...fixture.completion, revised: -1 },
		{ ...fixture.completion, unchanged: 0.5 },
	])
		expect(reconciliationPlanSchema.safeParse({ ...fixture, completion }).success).toBe(false);
});

test("fails closed for malformed durable JSON and does not accept caller-supplied event identity", () => {
	const fixture = planFixture();
	expect(() => parseReconciliationPlan(JSON.parse('{"schemaVersion":1}'))).toThrow();
	expect(
		reconciliationPlanSchema.safeParse({
			...fixture,
			eventId: "gpe_caller_supplied",
		}).success,
	).toBe(false);
});

const SNAPSHOT_ID_A = artifactIdSchema.parse("01jxyz8y3jqazj7jrx53w9b3dn");
const SNAPSHOT_ID_B = artifactIdSchema.parse("01jxyz8y3jqazj7jrx53w9b3dp");
const GENERIC = { state: "generic" } as const;
const snapshotTarget = {
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
const snapshotKind: ArtifactKindRegistration = {
	apiVersion: "example.dev/v1",
	kind: "Item",
	schemaVersions: {
		1: { fields: { "/name": { target: "name" } }, clearFields: ["legacy"] },
		2: { fields: { "/name": { target: "name", mode: "json" } }, clearFields: ["old"] },
	},
	transitions: [{ from: 1, to: 2 }],
	target: snapshotTarget,
};

function snapshotMarker(
	id: string,
	classification: ArtifactClassification = GENERIC,
	extra: Readonly<Record<string, unknown>> = {},
): Uint8Array {
	return Buffer.from(
		JSON.stringify({
			gpId: id,
			...(classification.state === "generic"
				? {}
				: {
						gpApiVersion: classification.apiVersion,
						gpKind: classification.kind,
						gpSchemaVersion: classification.schemaVersion,
					}),
			...extra,
		}),
	);
}

function snapshotCandidate(options: {
	readonly id: string;
	readonly path: string;
	readonly body?: string;
	readonly classification?: ArtifactClassification;
	readonly extra?: Readonly<Record<string, unknown>>;
}): ArtifactCandidate {
	return {
		path: options.path,
		entries: [
			{
				path: "gitplane-artifact.json",
				kind: "regular-file",
				bytes: snapshotMarker(options.id, options.classification ?? GENERIC, options.extra),
			},
			{ path: "body.txt", kind: "regular-file", bytes: Buffer.from(options.body ?? "body") },
		],
	};
}

function targetSnapshot(
	commit: string,
	candidates: readonly ArtifactCandidate[],
): TargetSnapshotFacts {
	return {
		commit,
		inventory: candidates.flatMap((item) => [
			{ path: `${item.path}/gitplane-artifact.json`, kind: "regular-file" as const },
			{ path: `${item.path}/body.txt`, kind: "regular-file" as const },
		]),
		candidates,
	};
}

function snapshotRevisionId(item: ArtifactCandidate, id: typeof SNAPSHOT_ID_A): string {
	const digest = digestArtifactContent(item.entries);
	if (!digest.ok) throw new Error(digest.message);
	return deriveRevisionId({
		sourceId: "source",
		artifactId: id,
		artifactPath: item.path,
		contentDigest: digest.value.bytes,
	});
}

function snapshotCurrent(options: {
	readonly id: typeof SNAPSHOT_ID_A;
	readonly path: string;
	readonly revisionId: string;
	readonly tombstoned?: boolean;
	readonly classification?: ArtifactClassification;
}): ArtifactCurrentRecord {
	return {
		sourceId: "source",
		artifactId: options.id,
		revisionId: options.revisionId,
		path: options.path,
		classification: options.classification ?? GENERIC,
		tombstoned: options.tombstoned ?? false,
	};
}

function snapshotLineage(
	id: typeof SNAPSHOT_ID_A,
	classification: Extract<ArtifactClassification, { state: "classified" }> | null = null,
): ArtifactLineageRecord {
	return {
		sourceId: "source",
		artifactId: id,
		establishedClassification: classification,
		lastSchemaVersion: classification?.schemaVersion ?? null,
	};
}

function materialization(
	options: {
		readonly current?: readonly ArtifactCurrentRecord[];
		readonly lineage?: readonly ArtifactLineageRecord[];
		readonly commit?: string;
		readonly generation?: number;
	} = {},
): MaterializationSnapshot {
	return {
		cursor:
			options.generation === undefined
				? null
				: { sourceId: "source", commit: options.commit ?? "old", generation: options.generation },
		currentArtifacts: options.current ?? [],
		lineage: options.lineage ?? [],
		pendingPlan: null,
	};
}

function snapshotPlan(options: {
	readonly candidates: readonly ArtifactCandidate[];
	readonly materialization?: MaterializationSnapshot;
	readonly commit?: string;
	readonly kinds?: readonly ArtifactKindRegistration[];
}) {
	return deriveReconciliationPlan({
		sourceId: "source",
		targetCommitish: options.commit ?? "target",
		targetSnapshot: targetSnapshot(options.commit ?? "target", options.candidates),
		materialization: options.materialization ?? materialization(),
		kinds: options.kinds ?? [],
	});
}

test.each([
	{ name: "create", prior: undefined, changed: false, event: "artifact.created" },
	{ name: "restore", prior: "tombstoned", changed: false, event: "artifact.restored" },
	{ name: "revise content", prior: "live", changed: true, event: "artifact.revised" },
	{ name: "move", prior: "moved", changed: false, event: "artifact.revised" },
] as const)("derives complete-snapshot lifecycle: $name", ({ prior, changed, event }) => {
	const next = snapshotCandidate({
		id: SNAPSHOT_ID_A,
		path: "artifacts/a",
		body: changed ? "new" : "body",
	});
	const old = snapshotCandidate({
		id: SNAPSHOT_ID_A,
		path: prior === "moved" ? "artifacts/old" : "artifacts/a",
	});
	const stored =
		prior === undefined
			? materialization()
			: materialization({
					generation: 3,
					current: [
						snapshotCurrent({
							id: SNAPSHOT_ID_A,
							path: old.path,
							revisionId: snapshotRevisionId(old, SNAPSHOT_ID_A),
							tombstoned: prior === "tombstoned",
						}),
					],
					lineage: [snapshotLineage(SNAPSHOT_ID_A)],
				});
	const result = snapshotPlan({ candidates: [next], materialization: stored });
	expect(result.type).toBe("planned");
	if (result.type !== "planned") return;
	expect(result.plan.artifactMaterialization).toHaveLength(1);
	expect(result.plan.artifactMaterialization[0]?.outcome).toBe(event);
	expect(reconciliationPlanSchema.safeParse(result.plan).success).toBe(true);
});

test("derives unchanged, deletion, and equal-target no-op", () => {
	const item = snapshotCandidate({ id: SNAPSHOT_ID_A, path: "a" });
	const baseline = materialization({
		generation: 2,
		commit: "target",
		current: [
			snapshotCurrent({
				id: SNAPSHOT_ID_A,
				path: "a",
				revisionId: snapshotRevisionId(item, SNAPSHOT_ID_A),
			}),
		],
		lineage: [snapshotLineage(SNAPSHOT_ID_A)],
	});
	expect(snapshotPlan({ candidates: [item], materialization: baseline })).toMatchObject({
		type: "noop",
	});
	const deleted = snapshotPlan({ candidates: [], materialization: baseline, commit: "later" });
	expect(deleted).toMatchObject({
		type: "planned",
		plan: {
			artifactMaterialization: [{ outcome: "artifact.deleted", prior: { path: "a" } }],
			completion: { unchanged: 0, deleted: 1 },
		},
	});
});

test("builds classified projections and validates lineage transitions", () => {
	const classification = {
		state: "classified",
		apiVersion: snapshotKind.apiVersion,
		kind: snapshotKind.kind,
		schemaVersion: 1,
	} as const;
	const created = snapshotPlan({
		candidates: [
			snapshotCandidate({
				id: SNAPSHOT_ID_A,
				path: "a",
				classification,
				extra: { name: "A" },
			}),
		],
		kinds: [snapshotKind],
	});
	expect(created).toMatchObject({
		type: "planned",
		plan: {
			artifactMaterialization: [
				{
					target: {
						type: "upsert",
						mapping: snapshotTarget,
						fields: [{ column: "name", mode: "scalar", value: "A" }],
						clearFields: ["legacy"],
					},
				},
			],
		},
	});
	const removed = snapshotPlan({
		candidates: [snapshotCandidate({ id: SNAPSHOT_ID_A, path: "a" })],
		kinds: [snapshotKind],
		materialization: materialization({
			generation: 1,
			current: [
				snapshotCurrent({
					id: SNAPSHOT_ID_A,
					path: "a",
					revisionId: "gpr_old",
					classification,
				}),
			],
			lineage: [snapshotLineage(SNAPSHOT_ID_A, classification)],
		}),
	});
	expect(removed).toMatchObject({ type: "invalid", code: "classification-removed" });
});

test("plans replacement at one path as deletion and creation", () => {
	const replacement = snapshotCandidate({ id: SNAPSHOT_ID_B, path: "a" });
	const result = snapshotPlan({
		candidates: [replacement],
		materialization: materialization({
			generation: 1,
			current: [snapshotCurrent({ id: SNAPSHOT_ID_A, path: "a", revisionId: "gpr_old" })],
			lineage: [snapshotLineage(SNAPSHOT_ID_A)],
		}),
	});
	expect(result).toMatchObject({
		type: "planned",
		plan: {
			artifactMaterialization: [
				{ artifactId: SNAPSHOT_ID_A, outcome: "artifact.deleted", prior: { path: "a" } },
				{ artifactId: SNAPSHOT_ID_B, outcome: "artifact.created", path: "a", prior: null },
			],
			completion: { created: 1, deleted: 1 },
		},
	});
});

test("rejects malformed or incomplete snapshots and Pending Plans", () => {
	const item = snapshotCandidate({ id: SNAPSHOT_ID_A, path: "a" });
	const complete = targetSnapshot("target", [item]);
	expect(
		deriveReconciliationPlan({
			sourceId: "source",
			targetCommitish: "target",
			targetSnapshot: { ...complete, candidates: [] },
			materialization: materialization(),
			kinds: [],
		}),
	).toMatchObject({ type: "invalid", code: "incomplete-target-snapshot" });
	const pending = materialization();
	expect(
		snapshotPlan({
			candidates: [item],
			materialization: { ...pending, pendingPlan: planFixture() },
		}),
	).toMatchObject({ type: "invalid", code: "pending-plan" });
});

test("is deterministic, canonically ordered, generation-aware, and history-neutral", () => {
	const a = snapshotCandidate({ id: SNAPSHOT_ID_A, path: "z" });
	const b = snapshotCandidate({ id: SNAPSHOT_ID_B, path: "a" });
	const first = snapshotPlan({ candidates: [b, a] });
	const second = snapshotPlan({ candidates: [a, b] });
	expect(first).toEqual(second);
	if (first.type !== "planned") throw new Error("Expected a plan.");
	expect(first.plan.artifactMaterialization.map((item) => item.artifactId)).toEqual([
		SNAPSHOT_ID_A,
		SNAPSHOT_ID_B,
	]);
	const laterGeneration = snapshotPlan({
		candidates: [a],
		materialization: materialization({ generation: 5 }),
	});
	if (laterGeneration.type !== "planned") throw new Error("Expected a plan.");
	expect(first.plan.attemptId).not.toBe(laterGeneration.plan.attemptId);
	expect(prepareResultingCursor(laterGeneration.plan).generation).toBe(6);
	const neutral = snapshotPlan({
		candidates: [a],
		commit: "arbitrary-merge",
		materialization: materialization({
			generation: 2,
			commit: "older",
			current: [
				snapshotCurrent({
					id: SNAPSHOT_ID_A,
					path: "z",
					revisionId: snapshotRevisionId(a, SNAPSHOT_ID_A),
				}),
			],
			lineage: [snapshotLineage(SNAPSHOT_ID_A)],
		}),
	});
	expect(neutral).toMatchObject({
		type: "planned",
		plan: { artifactMaterialization: [], completion: { unchanged: 1 } },
	});
});
