import { z } from "zod";
import {
	artifactClassificationSchema,
	artifactIdSchema,
	validateClassificationTransition,
	type ArtifactClassification,
} from "./artifact.ts";
import { checkArtifactCorpus } from "./check/check-artifact-corpus.ts";
import type { Finding } from "./check/finding.ts";
import { inspectCorpusTopology } from "./check/inspect-corpus-topology.ts";
import type { ArtifactCorpusEntry, ArtifactKindRegistration } from "./domain.ts";
import type {
	ArtifactCurrentRecord,
	ArtifactLineageRecord,
	CursorRecord,
	EventRecord,
	MaterializationSnapshot,
	RevisionRecord,
	TargetRowRecord,
} from "./gateways.ts";
import type { TargetSnapshotFacts } from "./gather-source-facts.ts";
import { deriveAttemptId, deriveEventId, deriveRevisionId } from "./identity.ts";
import { buildProjectionPlan } from "./projection/index.ts";

const jsonPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
type JsonValue = z.infer<typeof jsonPrimitiveSchema> | JsonValue[] | { [key: string]: JsonValue };
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
	z.union([jsonPrimitiveSchema, z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)]),
);
const jsonObjectSchema = z.record(z.string(), jsonValueSchema);
const nonNegativeCountSchema = z.number().int().nonnegative();

const compactCursorSchema = z
	.object({
		commit: z.string().min(1),
		generation: z.number().int().positive(),
	})
	.strict();

const targetMappingSchema = z
	.object({
		table: z.string().min(1),
		lineage: z
			.object({
				sourceId: z.string().min(1),
				artifactId: z.string().min(1),
				revisionId: z.string().min(1),
				path: z.string().min(1),
				deleted: z.string().min(1),
				deletedAtCommit: z.string().min(1),
			})
			.strict(),
	})
	.strict();

const lineageSchema = z
	.object({
		establishedClassification: z
			.object({
				state: z.literal("classified"),
				apiVersion: z.string().min(1),
				kind: z.string().min(1),
				schemaVersion: z.number().int().positive(),
			})
			.strict()
			.nullable(),
		lastSchemaVersion: z.number().int().positive().nullable(),
	})
	.strict();

const priorArtifactSchema = z
	.object({
		revisionId: z.string().min(1),
		path: z.string(),
		classification: artifactClassificationSchema,
	})
	.strict();

const plannedRevisionSchema = z
	.object({
		revisionId: z.string().min(1),
		digest: z
			.object({
				text: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
				bytes: z.array(z.number().int().min(0).max(255)).length(32),
				manifest: z.array(
					z.object({ path: z.string(), sha256: z.string().regex(/^[0-9a-f]{64}$/u) }).strict(),
				),
			})
			.strict(),
		envelope: jsonObjectSchema,
	})
	.strict();

const targetUpsertSchema = z
	.object({
		type: z.literal("upsert"),
		mapping: targetMappingSchema,
		fields: z.array(
			z
				.object({
					column: z.string().min(1),
					mode: z.union([z.literal("scalar"), z.literal("json")]),
					value: jsonValueSchema,
				})
				.strict(),
		),
		clearFields: z.array(z.string()),
	})
	.strict();

const plannedLiveArtifactMaterializationSchema = z
	.object({
		artifactId: artifactIdSchema,
		outcome: z.union([
			z.literal("artifact.created"),
			z.literal("artifact.restored"),
			z.literal("artifact.revised"),
		]),
		prior: priorArtifactSchema.nullable(),
		revision: plannedRevisionSchema,
		path: z.string(),
		classification: artifactClassificationSchema,
		lineage: lineageSchema,
		target: targetUpsertSchema.nullable(),
	})
	.strict()
	.superRefine((materialization, context) => {
		if (materialization.outcome === "artifact.created" && materialization.prior !== null)
			context.addIssue({
				code: "custom",
				path: ["prior"],
				message: "created artifact materialization cannot have prior state",
			});
		if (materialization.outcome !== "artifact.created" && materialization.prior === null)
			context.addIssue({
				code: "custom",
				path: ["prior"],
				message: `${materialization.outcome} artifact materialization requires prior state`,
			});
		if (materialization.classification.state === "generic" && materialization.target !== null)
			context.addIssue({
				code: "custom",
				path: ["target"],
				message: "generic artifact materialization cannot include a target operation",
			});
	});

const plannedDeletedArtifactMaterializationSchema = z
	.object({
		artifactId: artifactIdSchema,
		outcome: z.literal("artifact.deleted"),
		prior: priorArtifactSchema,
		lineage: lineageSchema,
		target: z
			.object({ type: z.literal("tombstone"), mapping: targetMappingSchema })
			.strict()
			.nullable(),
	})
	.strict();

const plannedArtifactMaterializationSchema = z.union([
	plannedLiveArtifactMaterializationSchema,
	plannedDeletedArtifactMaterializationSchema,
]);

export const reconciliationPlanSchema = z
	.object({
		schemaVersion: z.literal(1),
		sourceId: z.string().min(1),
		attemptId: z.string().regex(/^gpa_[0-9a-z]+$/u),
		targetCommit: z.string().min(1),
		targetCommitish: z.string().min(1),
		expectedCursor: compactCursorSchema.nullable(),
		artifactMaterialization: z.array(plannedArtifactMaterializationSchema),
		completion: z
			.object({
				created: nonNegativeCountSchema,
				restored: nonNegativeCountSchema,
				revised: nonNegativeCountSchema,
				unchanged: nonNegativeCountSchema,
				deleted: nonNegativeCountSchema,
			})
			.strict(),
	})
	.strict()
	.superRefine((plan, context) => {
		for (let index = 1; index < plan.artifactMaterialization.length; index++) {
			const previous = plan.artifactMaterialization[index - 1];
			const current = plan.artifactMaterialization[index];
			if (previous === undefined || current === undefined) continue;
			if (previous.artifactId >= current.artifactId)
				context.addIssue({
					code: "custom",
					path: ["artifactMaterialization", index, "artifactId"],
					message: "planned artifact materialization must be uniquely ordered by artifact ID",
				});
		}
		const outcomeCounts = {
			created: plan.artifactMaterialization.filter(
				(materialization) => materialization.outcome === "artifact.created",
			).length,
			restored: plan.artifactMaterialization.filter(
				(materialization) => materialization.outcome === "artifact.restored",
			).length,
			revised: plan.artifactMaterialization.filter(
				(materialization) => materialization.outcome === "artifact.revised",
			).length,
			deleted: plan.artifactMaterialization.filter(
				(materialization) => materialization.outcome === "artifact.deleted",
			).length,
		};
		for (const outcome of ["created", "restored", "revised", "deleted"] as const)
			if (plan.completion[outcome] !== outcomeCounts[outcome])
				context.addIssue({
					code: "custom",
					path: ["completion", outcome],
					message: `${outcome} completion count must match planned artifact materialization`,
				});
	});

export type ReconciliationPlan = z.infer<typeof reconciliationPlanSchema>;
export type PlannedArtifactMaterialization = z.infer<typeof plannedArtifactMaterializationSchema>;

export type PreparedArtifactMaterialization = {
	readonly revision: RevisionRecord | null;
	readonly lineage: ArtifactLineageRecord;
	readonly current: ArtifactCurrentRecord;
	readonly target:
		| { readonly type: "upsert"; readonly record: TargetRowRecord }
		| {
				readonly type: "tombstone";
				readonly sourceId: string;
				readonly artifactId: PlannedArtifactMaterialization["artifactId"];
				readonly target: NonNullable<PlannedArtifactMaterialization["target"]>["mapping"];
				readonly deletedAtCommit: string;
		  }
		| null;
	readonly event: EventRecord;
};

export function parseReconciliationPlan(input: unknown): ReconciliationPlan {
	return reconciliationPlanSchema.parse(input);
}

export function prepareResultingCursor(plan: ReconciliationPlan): CursorRecord {
	return {
		sourceId: plan.sourceId,
		commit: plan.targetCommit,
		generation: (plan.expectedCursor?.generation ?? 0) + 1,
	};
}

export function prepareArtifactMaterialization(
	plan: ReconciliationPlan,
	planned: PlannedArtifactMaterialization,
): PreparedArtifactMaterialization {
	const resultingCursor = prepareResultingCursor(plan);
	const lineage: ArtifactLineageRecord = {
		sourceId: plan.sourceId,
		artifactId: planned.artifactId,
		...planned.lineage,
	};
	if (planned.outcome === "artifact.deleted") {
		const current: ArtifactCurrentRecord = {
			sourceId: plan.sourceId,
			artifactId: planned.artifactId,
			...planned.prior,
			observedCommit: plan.targetCommit,
			tombstoned: true,
		};
		return {
			revision: null,
			lineage,
			current,
			target:
				planned.target === null
					? null
					: {
							type: "tombstone",
							sourceId: plan.sourceId,
							artifactId: planned.artifactId,
							target: planned.target.mapping,
							deletedAtCommit: plan.targetCommit,
						},
			event: prepareEvent(plan, planned, resultingCursor.generation, null, null),
		};
	}
	const revision: RevisionRecord = {
		sourceId: plan.sourceId,
		artifactId: planned.artifactId,
		revisionId: planned.revision.revisionId,
		digest: {
			...planned.revision.digest,
			text: planned.revision.digest.text as `sha256:${string}`,
			bytes: Uint8Array.from(planned.revision.digest.bytes),
		},
		envelope: planned.revision.envelope,
		firstObservedCommit: plan.targetCommit,
		firstObservedPath: planned.path,
	};
	const current: ArtifactCurrentRecord = {
		sourceId: plan.sourceId,
		artifactId: planned.artifactId,
		revisionId: planned.revision.revisionId,
		path: planned.path,
		classification: planned.classification,
		observedCommit: plan.targetCommit,
		tombstoned: false,
	};
	return {
		revision,
		lineage,
		current,
		target:
			planned.target === null
				? null
				: {
						type: "upsert",
						record: {
							sourceId: plan.sourceId,
							artifactId: planned.artifactId,
							revisionId: planned.revision.revisionId,
							path: planned.path,
							target: planned.target.mapping,
							fields: planned.target.fields,
							clearFields: planned.target.clearFields,
						},
					},
		event: prepareEvent(
			plan,
			planned,
			resultingCursor.generation,
			planned.revision.revisionId,
			planned.path,
		),
	};
}

function prepareEvent(
	plan: ReconciliationPlan,
	planned: PlannedArtifactMaterialization,
	reconciliationGeneration: number,
	currentRevisionId: string | null,
	currentPath: string | null,
): EventRecord {
	const eventIdentity = {
		sourceId: plan.sourceId,
		artifactId: planned.artifactId,
		reconciliationGeneration,
		attemptId: plan.attemptId,
		reconciledCommit: plan.targetCommit,
		eventType: planned.outcome,
	};
	return {
		eventId: deriveEventId(eventIdentity),
		...eventIdentity,
		priorRevisionId: planned.prior?.revisionId ?? null,
		currentRevisionId,
		priorPath: planned.prior?.path ?? null,
		currentPath,
	};
}

export interface ReconciliationPlanFacts {
	readonly sourceId: string;
	readonly targetCommitish: string;
	readonly targetSnapshot: TargetSnapshotFacts;
	readonly materialization: MaterializationSnapshot;
	readonly kinds: readonly ArtifactKindRegistration[];
}

export type ReconciliationPlanResult =
	| { readonly type: "planned"; readonly plan: ReconciliationPlan }
	| {
			readonly type: "noop";
			readonly sourceId: string;
			readonly targetCommit: string;
			readonly cursor: NonNullable<MaterializationSnapshot["cursor"]>;
	  }
	| {
			readonly type: "invalid";
			readonly code: string;
			readonly message: string;
			readonly findings?: readonly Finding[];
	  };

interface PreparedArtifact {
	readonly corpus: ArtifactCorpusEntry;
	readonly revisionId: string;
	readonly registration: ArtifactKindRegistration | null;
}

function compareCodeUnits(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

function invalid(
	code: string,
	message: string,
	findings?: readonly Finding[],
): ReconciliationPlanResult {
	return { type: "invalid", code, message, ...(findings === undefined ? {} : { findings }) };
}

function findRegistration(
	classification: ArtifactClassification,
	kinds: readonly ArtifactKindRegistration[],
): ArtifactKindRegistration | null {
	if (classification.state === "generic") return null;
	return (
		kinds.find(
			(kind) => kind.apiVersion === classification.apiVersion && kind.kind === classification.kind,
		) ?? null
	);
}

function copyJsonObject(value: Readonly<Record<string, unknown>>): Record<string, JsonValue> {
	const parsed = jsonObjectSchema.safeParse(value);
	if (!parsed.success) throw new Error("Validated artifact envelope is not JSON-compatible.");
	return structuredClone(parsed.data);
}

function validateStoreSnapshot(
	sourceId: string,
	snapshot: MaterializationSnapshot,
): ReconciliationPlanResult | null {
	if (snapshot.pendingPlan !== null)
		return invalid(
			"pending-plan",
			"A new Reconciliation Plan cannot be derived while a Pending Plan exists.",
		);
	if (snapshot.cursor !== null && snapshot.cursor.sourceId !== sourceId)
		return invalid(
			"snapshot-source-mismatch",
			"The materialization cursor belongs to another source.",
		);
	if (
		snapshot.cursor !== null &&
		(!Number.isSafeInteger(snapshot.cursor.generation) ||
			snapshot.cursor.generation < 1 ||
			snapshot.cursor.generation === Number.MAX_SAFE_INTEGER)
	)
		return invalid(
			"invalid-cursor-generation",
			"The completed cursor generation must be a positive safe integer with room to advance.",
		);
	const currentIds = new Set<string>();
	const currentPaths = new Set<string>();
	const lineageIds = new Set<string>();
	for (const current of snapshot.currentArtifacts) {
		if (current.sourceId !== sourceId)
			return invalid("snapshot-source-mismatch", "A current artifact belongs to another source.");
		if (currentIds.has(current.artifactId))
			return invalid(
				"duplicate-current-artifact",
				`Current artifact ${current.artifactId} is duplicated.`,
			);
		if (currentPaths.has(current.path))
			return invalid(
				"duplicate-current-path",
				`Current artifact path ${current.path} is duplicated.`,
			);
		currentIds.add(current.artifactId);
		currentPaths.add(current.path);
	}
	for (const lineage of snapshot.lineage) {
		if (lineage.sourceId !== sourceId)
			return invalid("snapshot-source-mismatch", "An artifact lineage belongs to another source.");
		if (lineageIds.has(lineage.artifactId))
			return invalid("duplicate-lineage", `Artifact lineage ${lineage.artifactId} is duplicated.`);
		lineageIds.add(lineage.artifactId);
		if ((lineage.establishedClassification === null) !== (lineage.lastSchemaVersion === null))
			return invalid(
				"invalid-lineage",
				`Artifact lineage ${lineage.artifactId} has inconsistent classification state.`,
			);
	}
	for (const current of snapshot.currentArtifacts) {
		if (!lineageIds.has(current.artifactId))
			return invalid(
				"missing-lineage",
				`Current artifact ${current.artifactId} has no lineage record.`,
			);
		const lineage = snapshot.lineage.find((item) => item.artifactId === current.artifactId);
		if (lineage === undefined) throw new Error("Validated lineage disappeared.");
		if (
			current.classification.state === "generic"
				? lineage.establishedClassification !== null
				: lineage.establishedClassification === null ||
					lineage.establishedClassification.apiVersion !== current.classification.apiVersion ||
					lineage.establishedClassification.kind !== current.classification.kind ||
					lineage.lastSchemaVersion !== current.classification.schemaVersion
		)
			return invalid(
				"current-lineage-mismatch",
				`Current artifact ${current.artifactId} does not match its lineage record.`,
			);
	}
	return null;
}

function validateLineage(
	prepared: PreparedArtifact,
	current: ArtifactCurrentRecord | undefined,
	lineage: ArtifactLineageRecord | undefined,
): ReconciliationPlanResult | null {
	if (current !== undefined && lineage === undefined)
		return invalid(
			"missing-lineage",
			`Current artifact ${prepared.corpus.snapshot.artifactId} has no lineage record.`,
		);
	if (lineage === undefined) return null;
	const next = prepared.corpus.snapshot.classification;
	const previous = lineage.establishedClassification ?? { state: "generic" as const };
	const transition = validateClassificationTransition(previous, next);
	if (!transition.ok)
		return invalid(
			transition.code,
			`Artifact ${prepared.corpus.snapshot.artifactId} has an illegal classification transition.`,
		);
	if (next.state === "generic" || lineage.lastSchemaVersion === null) return null;
	if (lineage.lastSchemaVersion === next.schemaVersion) return null;
	if (
		prepared.registration?.transitions.some(
			(edge) => edge.from === lineage.lastSchemaVersion && edge.to === next.schemaVersion,
		) === true
	)
		return null;
	return invalid(
		"schema-transition-not-registered",
		`Artifact ${prepared.corpus.snapshot.artifactId} has no registered schema transition from ${lineage.lastSchemaVersion} to ${next.schemaVersion}.`,
	);
}

function nextLineage(
	prepared: PreparedArtifact,
	prior: ArtifactLineageRecord | undefined,
): PlannedArtifactMaterialization["lineage"] {
	const classification = prepared.corpus.snapshot.classification;
	return {
		establishedClassification:
			classification.state === "classified"
				? classification
				: (prior?.establishedClassification ?? null),
		lastSchemaVersion:
			classification.state === "classified"
				? classification.schemaVersion
				: (prior?.lastSchemaVersion ?? null),
	};
}

function plannedRevision(prepared: PreparedArtifact): {
	readonly revisionId: string;
	readonly digest: {
		readonly text: `sha256:${string}`;
		readonly bytes: number[];
		readonly manifest: { readonly path: string; readonly sha256: string }[];
	};
	readonly envelope: Record<string, JsonValue>;
} {
	return {
		revisionId: prepared.revisionId,
		digest: {
			text: prepared.corpus.digest.text,
			bytes: [...prepared.corpus.digest.bytes],
			manifest: prepared.corpus.digest.manifest.map((item) => ({ ...item })),
		},
		envelope: copyJsonObject(prepared.corpus.snapshot.envelope),
	};
}

function priorArtifact(current: ArtifactCurrentRecord): {
	readonly revisionId: string;
	readonly path: string;
	readonly classification: ArtifactClassification;
} {
	return {
		revisionId: current.revisionId,
		path: current.path,
		classification: current.classification,
	};
}

export function deriveReconciliationPlan(facts: ReconciliationPlanFacts): ReconciliationPlanResult {
	const snapshotFailure = validateStoreSnapshot(facts.sourceId, facts.materialization);
	if (snapshotFailure !== null) return snapshotFailure;

	const topology = inspectCorpusTopology(facts.targetSnapshot.inventory);
	if (topology.findings.length > 0)
		return invalid(
			"invalid-target-topology",
			"The target artifact topology is invalid.",
			topology.findings,
		);
	const expectedPaths = topology.boundaries.map((boundary) => boundary.path).sort(compareCodeUnits);
	const candidatePaths = facts.targetSnapshot.candidates
		.map((candidate) => candidate.path)
		.sort(compareCodeUnits);
	if (
		expectedPaths.length !== candidatePaths.length ||
		expectedPaths.some((path, index) => path !== candidatePaths[index])
	)
		return invalid(
			"incomplete-target-snapshot",
			"Target candidates do not exactly match the complete target topology.",
		);

	const checked = checkArtifactCorpus({
		sourceId: facts.sourceId,
		artifactCount: topology.artifactCount,
		candidates: facts.targetSnapshot.candidates,
		kinds: facts.kinds,
	});
	if (checked.type === "invalid")
		return invalid(
			"invalid-target-corpus",
			"The target artifact corpus is invalid.",
			checked.findings,
		);
	if (checked.type === "failed") return invalid(checked.failure.code, checked.failure.message);

	const currentById = new Map(
		facts.materialization.currentArtifacts.map((item) => [item.artifactId, item]),
	);
	const lineageById = new Map(facts.materialization.lineage.map((item) => [item.artifactId, item]));
	const storedByPath = new Map(
		facts.materialization.currentArtifacts.map((item) => [item.path, item]),
	);
	const prepared = checked.corpus.artifacts.map((corpus) => ({
		corpus,
		revisionId: deriveRevisionId({
			sourceId: facts.sourceId,
			artifactId: corpus.snapshot.artifactId,
			artifactPath: corpus.snapshot.path,
			contentDigest: corpus.digest.bytes,
		}),
		registration: findRegistration(corpus.snapshot.classification, facts.kinds),
	}));
	for (const artifact of prepared) {
		const occupant = storedByPath.get(artifact.corpus.snapshot.path);
		if (occupant !== undefined && occupant.artifactId !== artifact.corpus.snapshot.artifactId)
			return invalid(
				"artifact-id-replaced-at-path",
				`Path ${artifact.corpus.snapshot.path} replaces artifact ${occupant.artifactId} with ${artifact.corpus.snapshot.artifactId}.`,
			);
		const legality = validateLineage(
			artifact,
			currentById.get(artifact.corpus.snapshot.artifactId),
			lineageById.get(artifact.corpus.snapshot.artifactId),
		);
		if (legality !== null) return legality;
	}

	const expectedGeneration = facts.materialization.cursor?.generation ?? 0;
	const attemptId = deriveAttemptId({
		sourceId: facts.sourceId,
		expectedGeneration,
		targetCommit: facts.targetSnapshot.commit,
	});
	const artifactMaterialization: PlannedArtifactMaterialization[] = [];
	let unchanged = 0;
	const targetIds = new Set<string>();
	for (const artifact of prepared) {
		const snapshot = artifact.corpus.snapshot;
		targetIds.add(snapshot.artifactId);
		const prior = currentById.get(snapshot.artifactId);
		const changed =
			prior === undefined ||
			prior.revisionId !== artifact.revisionId ||
			prior.path !== snapshot.path;
		if (prior !== undefined && !prior.tombstoned && !changed) {
			unchanged += 1;
			continue;
		}
		const outcome =
			prior === undefined
				? "artifact.created"
				: prior.tombstoned
					? "artifact.restored"
					: "artifact.revised";
		const projection =
			artifact.registration === null
				? null
				: buildProjectionPlan(
						snapshot.envelope,
						artifact.registration.schemaVersions[
							snapshot.classification.state === "classified"
								? snapshot.classification.schemaVersion
								: 0
						]!,
					);
		const target =
			artifact.registration === null || projection === null
				? null
				: {
						type: "upsert" as const,
						mapping: artifact.registration.target,
						fields: projection.fields.map((field) => ({
							...field,
							value: jsonValueSchema.parse(field.value),
						})),
						clearFields: [...projection.clearFields],
					};
		artifactMaterialization.push({
			artifactId: snapshot.artifactId,
			outcome,
			prior: prior === undefined ? null : priorArtifact(prior),
			revision: plannedRevision(artifact),
			path: snapshot.path,
			classification: snapshot.classification,
			lineage: nextLineage(artifact, lineageById.get(snapshot.artifactId)),
			target,
		});
	}
	for (const prior of facts.materialization.currentArtifacts) {
		if (prior.tombstoned || targetIds.has(prior.artifactId)) continue;
		const lineage = lineageById.get(prior.artifactId);
		if (lineage === undefined)
			return invalid(
				"missing-lineage",
				`Current artifact ${prior.artifactId} has no lineage record.`,
			);
		const registration = findRegistration(prior.classification, facts.kinds);
		if (prior.classification.state === "classified" && registration === null)
			return invalid(
				"unknown-artifact-kind",
				`Stored classified artifact ${prior.artifactId} no longer has a kind registration.`,
			);
		artifactMaterialization.push({
			artifactId: prior.artifactId,
			outcome: "artifact.deleted",
			prior: priorArtifact(prior),
			lineage: {
				establishedClassification: lineage.establishedClassification,
				lastSchemaVersion: lineage.lastSchemaVersion,
			},
			target: registration === null ? null : { type: "tombstone", mapping: registration.target },
		});
	}
	artifactMaterialization.sort((left, right) =>
		compareCodeUnits(left.artifactId, right.artifactId),
	);

	if (
		artifactMaterialization.length === 0 &&
		facts.materialization.cursor?.commit === facts.targetSnapshot.commit
	)
		return {
			type: "noop",
			sourceId: facts.sourceId,
			targetCommit: facts.targetSnapshot.commit,
			cursor: facts.materialization.cursor,
		};

	const completion = {
		created: artifactMaterialization.filter((item) => item.outcome === "artifact.created").length,
		restored: artifactMaterialization.filter((item) => item.outcome === "artifact.restored").length,
		revised: artifactMaterialization.filter((item) => item.outcome === "artifact.revised").length,
		unchanged,
		deleted: artifactMaterialization.filter((item) => item.outcome === "artifact.deleted").length,
	};
	return {
		type: "planned",
		plan: parseReconciliationPlan({
			schemaVersion: 1,
			sourceId: facts.sourceId,
			attemptId,
			targetCommit: facts.targetSnapshot.commit,
			targetCommitish: facts.targetCommitish,
			expectedCursor:
				facts.materialization.cursor === null
					? null
					: {
							commit: facts.materialization.cursor.commit,
							generation: facts.materialization.cursor.generation,
						},
			artifactMaterialization,
			completion,
		}),
	};
}
