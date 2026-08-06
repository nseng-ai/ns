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
	deriveRevisionId,
	digestArtifactContent,
	frozenReconciliationPlanSchema,
} from "@nseng-ai/gitplane";
import { deriveReconciliationPlan } from "../../src/core/reconciliation-plan.ts";

const ID_A = artifactIdSchema.parse("01jxyz8y3jqazj7jrx53w9b3dn");
const ID_B = artifactIdSchema.parse("01jxyz8y3jqazj7jrx53w9b3dp");
const ID_C = artifactIdSchema.parse("01jxyz8y3jqazj7jrx53w9b3dq");
const GENERIC = { state: "generic" } as const;
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
	schemaVersions: {
		1: { fields: { "/name": { target: "name" } }, clearFields: ["legacy"] },
		2: { fields: { "/name": { target: "name", mode: "json" } }, clearFields: ["old"] },
	},
	transitions: [{ from: 1, to: 2 }],
	target,
};

function marker(
	id: string,
	classification: ArtifactClassification = GENERIC,
	extra = {},
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

function candidate(options: {
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
				bytes: marker(options.id, options.classification ?? GENERIC, options.extra),
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

function revisionId(item: ArtifactCandidate, id: typeof ID_A): string {
	const digest = digestArtifactContent(item.entries);
	if (!digest.ok) throw new Error(digest.message);
	return deriveRevisionId({
		sourceId: "source",
		artifactId: id,
		artifactPath: item.path,
		contentDigest: digest.value.bytes,
	});
}

function current(options: {
	readonly id: typeof ID_A;
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
		observedCommit: "old",
		tombstoned: options.tombstoned ?? false,
	};
}

function lineage(
	id: typeof ID_A,
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
		pendingAttempt: null,
	};
}

function plan(options: {
	readonly candidates: readonly ArtifactCandidate[];
	readonly materialization?: MaterializationSnapshot;
	readonly mode?: "normal" | "repair";
	readonly commit?: string;
	readonly kinds?: readonly ArtifactKindRegistration[];
}) {
	return deriveReconciliationPlan({
		sourceId: "source",
		targetCommitish: options.commit ?? "target",
		targetSnapshot: targetSnapshot(options.commit ?? "target", options.candidates),
		materialization: options.materialization ?? materialization(),
		kinds: options.kinds ?? [],
		mode: options.mode ?? "normal",
	});
}

test.each([
	{ name: "create", prior: undefined, changed: false, event: "artifact.created" },
	{ name: "restore", prior: "tombstoned", changed: false, event: "artifact.restored" },
	{ name: "revise content", prior: "live", changed: true, event: "artifact.revised" },
	{ name: "move", prior: "moved", changed: false, event: "artifact.revised" },
] as const)("plans normal lifecycle: $name", ({ prior, changed, event }) => {
	const next = candidate({ id: ID_A, path: "artifacts/a", body: changed ? "new" : "body" });
	const old = candidate({ id: ID_A, path: prior === "moved" ? "artifacts/old" : "artifacts/a" });
	const stored =
		prior === undefined
			? materialization()
			: materialization({
					generation: 3,
					current: [
						current({
							id: ID_A,
							path: old.path,
							revisionId: revisionId(old, ID_A),
							tombstoned: prior === "tombstoned",
						}),
					],
					lineage: [lineage(ID_A)],
				});
	const result = plan({ candidates: [next], materialization: stored });
	expect(result.type).toBe("planned");
	if (result.type !== "planned") return;
	expect(result.plan.artifactWork).toHaveLength(1);
	expect(result.plan.artifactWork[0]?.outcome).toBe(event);
	expect(result.plan.artifactWork[0]?.event.eventType).toBe(event);
	expect(frozenReconciliationPlanSchema.safeParse(result.plan).success).toBe(true);
});

test("plans unchanged, deletion, and equal-target no-op correctly", () => {
	const item = candidate({ id: ID_A, path: "a" });
	const baseline = materialization({
		generation: 2,
		commit: "target",
		current: [current({ id: ID_A, path: "a", revisionId: revisionId(item, ID_A) })],
		lineage: [lineage(ID_A)],
	});
	expect(plan({ candidates: [item], materialization: baseline })).toMatchObject({ type: "noop" });
	const deleted = plan({ candidates: [], materialization: baseline, commit: "later" });
	expect(deleted.type).toBe("planned");
	if (deleted.type !== "planned") return;
	expect(deleted.plan.artifactWork[0]).toMatchObject({
		outcome: "artifact.deleted",
		revision: null,
		current: { tombstoned: true },
		event: { priorPath: "a", currentPath: null },
	});
});

test("repair reapplies matching/changed live artifacts and removals but skips tombstones", () => {
	const same = candidate({ id: ID_A, path: "a" });
	const priorB = current({ id: ID_B, path: "b", revisionId: "gpr_old" });
	const result = plan({
		candidates: [same],
		mode: "repair",
		materialization: materialization({
			generation: 4,
			current: [
				current({ id: ID_A, path: "a", revisionId: revisionId(same, ID_A) }),
				priorB,
				current({ id: ID_C, path: "gone", revisionId: "gpr_gone", tombstoned: true }),
			],
			lineage: [lineage(ID_A), lineage(ID_B), lineage(ID_C)],
		}),
	});
	expect(result.type).toBe("planned");
	if (result.type !== "planned") return;
	expect(result.plan.artifactWork.map((item) => [item.artifactId, item.outcome])).toEqual([
		[ID_A, "artifact.repaired"],
		[ID_B, "artifact.repaired"],
	]);
	expect(result.plan.artifactWork[1]?.event).toMatchObject({
		priorRevisionId: "gpr_old",
		currentRevisionId: null,
	});
});

test("builds explicit classified projections and clear fields", () => {
	const classification = {
		state: "classified",
		apiVersion: kind.apiVersion,
		kind: kind.kind,
		schemaVersion: 1,
	} as const;
	const result = plan({
		candidates: [candidate({ id: ID_A, path: "a", classification, extra: { name: "A" } })],
		kinds: [kind],
	});
	expect(result.type).toBe("planned");
	if (result.type !== "planned") return;
	expect(result.plan.artifactWork[0]?.target).toEqual({
		type: "upsert",
		record: expect.objectContaining({
			target,
			fields: [{ column: "name", mode: "scalar", value: "A" }],
			clearFields: ["legacy"],
		}),
	});
});

test.each([
	{
		name: "classification removal",
		prior: {
			state: "classified",
			apiVersion: kind.apiVersion,
			kind: kind.kind,
			schemaVersion: 1,
		} as const,
		next: GENERIC,
		code: "classification-removed",
	},
	{
		name: "kind change",
		prior: {
			state: "classified",
			apiVersion: kind.apiVersion,
			kind: kind.kind,
			schemaVersion: 1,
		} as const,
		next: {
			state: "classified",
			apiVersion: kind.apiVersion,
			kind: "Other",
			schemaVersion: 1,
		} as const,
		code: "invalid-target-corpus",
	},
	{
		name: "unregistered schema edge",
		prior: {
			state: "classified",
			apiVersion: kind.apiVersion,
			kind: kind.kind,
			schemaVersion: 2,
		} as const,
		next: {
			state: "classified",
			apiVersion: kind.apiVersion,
			kind: kind.kind,
			schemaVersion: 1,
		} as const,
		code: "schema-transition-not-registered",
	},
] as const)("rejects illegal lineage: $name", ({ prior, next, code }) => {
	const result = plan({
		candidates: [candidate({ id: ID_A, path: "a", classification: next })],
		kinds: [kind],
		materialization: materialization({
			generation: 1,
			current: [current({ id: ID_A, path: "a", revisionId: "gpr_old", classification: prior })],
			lineage: [lineage(ID_A, prior)],
		}),
	});
	expect(result).toMatchObject({ type: "invalid", code });
});

test("allows generic-to-classified and a registered schema transition", () => {
	const classification = {
		state: "classified",
		apiVersion: kind.apiVersion,
		kind: kind.kind,
		schemaVersion: 2,
	} as const;
	const result = plan({
		candidates: [candidate({ id: ID_A, path: "a", classification })],
		kinds: [kind],
		materialization: materialization({
			generation: 1,
			current: [
				current({
					id: ID_A,
					path: "a",
					revisionId: "gpr_old",
					classification: { ...classification, schemaVersion: 1 },
				}),
			],
			lineage: [lineage(ID_A, { ...classification, schemaVersion: 1 })],
		}),
	});
	expect(result).toMatchObject({
		type: "planned",
		plan: { artifactWork: [{ outcome: "artifact.revised" }] },
	});
});

test("rejects malformed topology, incomplete corpus, duplicate IDs, path replacement, and pending attempts", () => {
	const a = candidate({ id: ID_A, path: "a" });
	const malformed = targetSnapshot("target", [a]);
	expect(
		deriveReconciliationPlan({
			sourceId: "source",
			targetCommitish: "target",
			targetSnapshot: {
				...malformed,
				inventory: [
					...malformed.inventory,
					{ path: "a/nested/gitplane-artifact.json", kind: "regular-file" },
				],
			},
			materialization: materialization(),
			kinds: [],
			mode: "normal",
		}),
	).toMatchObject({ type: "invalid", code: "invalid-target-topology" });
	expect(
		deriveReconciliationPlan({
			sourceId: "source",
			targetCommitish: "target",
			targetSnapshot: { commit: "target", inventory: malformed.inventory, candidates: [] },
			materialization: materialization(),
			kinds: [],
			mode: "normal",
		}),
	).toMatchObject({ type: "invalid", code: "incomplete-target-snapshot" });
	expect(plan({ candidates: [a, candidate({ id: ID_A, path: "b" })] })).toMatchObject({
		type: "invalid",
		code: "invalid-target-corpus",
	});
	expect(
		plan({
			candidates: [a],
			materialization: materialization({
				generation: 1,
				current: [current({ id: ID_B, path: "a", revisionId: "gpr_old" })],
				lineage: [lineage(ID_B)],
			}),
		}),
	).toMatchObject({ type: "invalid", code: "artifact-id-replaced-at-path" });
	const pending = materialization();
	expect(
		plan({
			candidates: [a],
			materialization: {
				...pending,
				pendingAttempt: { sourceId: "source", attemptId: "gpa_pending", plan: {} as never },
			},
		}),
	).toMatchObject({ type: "invalid", code: "pending-attempt" });
});

test("is deterministic and input-order independent with canonical artifact ordering", () => {
	const a = candidate({ id: ID_A, path: "z" });
	const b = candidate({ id: ID_B, path: "a" });
	const first = plan({ candidates: [b, a] });
	const second = plan({ candidates: [a, b] });
	expect(first).toEqual(second);
	expect(first.type).toBe("planned");
	if (first.type === "planned")
		expect(first.plan.artifactWork.map((item) => item.artifactId)).toEqual([ID_A, ID_B]);
});

test("uses generation-aware stable retry identities and distinct repeated-target identities", () => {
	const item = candidate({ id: ID_A, path: "a" });
	const generation2 = plan({
		candidates: [item],
		materialization: materialization({ generation: 1, current: [], lineage: [] }),
	});
	const retry = plan({
		candidates: [item],
		materialization: materialization({ generation: 1, current: [], lineage: [] }),
	});
	const generation6 = plan({
		candidates: [item],
		materialization: materialization({ generation: 5, current: [], lineage: [] }),
	});
	expect(generation2).toEqual(retry);
	if (generation2.type !== "planned" || generation6.type !== "planned") throw new Error();
	expect(generation2.plan.nextCursor.generation).toBe(2);
	expect(generation6.plan.nextCursor.generation).toBe(6);
	expect(generation2.plan.attemptId).not.toBe(generation6.plan.attemptId);
	expect(generation2.plan.artifactWork[0]?.event.eventId).not.toBe(
		generation6.plan.artifactWork[0]?.event.eventId,
	);
});

test("treats target snapshots neutrally and advances a different target with no artifact changes", () => {
	const item = candidate({ id: ID_A, path: "a" });
	const state = materialization({
		generation: 2,
		commit: "older-or-merge",
		current: [current({ id: ID_A, path: "a", revisionId: revisionId(item, ID_A) })],
		lineage: [lineage(ID_A)],
	});
	const result = plan({ candidates: [item], materialization: state, commit: "arbitrary-merge" });
	expect(result).toMatchObject({
		type: "planned",
		plan: { artifactWork: [], nextCursor: { commit: "arbitrary-merge", generation: 3 } },
	});
});
