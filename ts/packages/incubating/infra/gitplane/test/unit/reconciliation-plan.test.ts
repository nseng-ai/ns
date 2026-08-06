import { expect, test } from "vitest";
import {
	prepareArtifactMaterialization,
	deriveEventId,
	prepareResultingCursor,
	reconciliationPlanSchema,
	parseArtifactId,
	parseReconciliationPlan,
} from "@nseng-ai/gitplane";

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
		observedCommit: plan.targetCommit,
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
