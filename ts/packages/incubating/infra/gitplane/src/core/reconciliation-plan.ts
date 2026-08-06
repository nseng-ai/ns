import {
	validateClassificationTransition,
	type ArtifactClassification,
	type ArtifactId,
} from "./artifact.ts";
import { checkArtifactCorpus } from "./check/check-artifact-corpus.ts";
import type { Finding } from "./check/finding.ts";
import { inspectCorpusTopology } from "./check/inspect-corpus-topology.ts";
import type { ArtifactCorpusEntry, ArtifactKindRegistration } from "./domain.ts";
import type {
	ArtifactCurrentRecord,
	ArtifactLineageRecord,
	EventRecord,
	MaterializationSnapshot,
	RevisionRecord,
	TargetRowRecord,
} from "./gateways.ts";
import type {
	FrozenArtifactWork,
	FrozenReconciliationPlan,
	FrozenRevisionRecord,
} from "./frozen-plan.ts";
import type { ReconciliationMode, TargetSnapshotFacts } from "./gather-source-facts.ts";
import {
	deriveAttemptId,
	deriveEventId,
	deriveRevisionId,
	type ArtifactEventType,
} from "./identity.ts";
import { buildProjectionPlan } from "./projection/index.ts";
import { z } from "zod";

const jsonPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
type JsonValue = z.infer<typeof jsonPrimitiveSchema> | JsonValue[] | { [key: string]: JsonValue };
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
	z.union([jsonPrimitiveSchema, z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)]),
);
const jsonObjectSchema = z.record(z.string(), jsonValueSchema);

export interface ReconciliationPlanFacts {
	readonly sourceId: string;
	readonly targetCommitish: string;
	readonly targetSnapshot: TargetSnapshotFacts;
	readonly materialization: MaterializationSnapshot;
	readonly kinds: readonly ArtifactKindRegistration[];
	readonly mode: ReconciliationMode;
}

export type ReconciliationPlanResult =
	| { readonly type: "planned"; readonly plan: FrozenReconciliationPlan }
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

type PreparedArtifact = {
	readonly corpus: ArtifactCorpusEntry;
	readonly revisionId: string;
	readonly registration: ArtifactKindRegistration | null;
};

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

function freezeRevision(record: RevisionRecord): FrozenRevisionRecord {
	return {
		sourceId: record.sourceId,
		artifactId: record.artifactId,
		revisionId: record.revisionId,
		digest: {
			text: record.digest.text,
			bytes: [...record.digest.bytes],
			manifest: record.digest.manifest.map((item) => ({ ...item })),
		},
		envelope: copyJsonObject(record.envelope),
		firstObservedCommit: record.firstObservedCommit,
		firstObservedPath: record.firstObservedPath,
	};
}

function validateStoreSnapshot(
	sourceId: string,
	snapshot: MaterializationSnapshot,
): ReconciliationPlanResult | null {
	if (snapshot.pendingAttempt !== null)
		return invalid(
			"pending-attempt",
			"A new reconciliation plan cannot be derived while an attempt is pending.",
		);
	if (snapshot.cursor !== null && snapshot.cursor.sourceId !== sourceId)
		return invalid(
			"snapshot-source-mismatch",
			"The materialization cursor belongs to another source.",
		);
	if (
		snapshot.cursor !== null &&
		(!Number.isSafeInteger(snapshot.cursor.generation) || snapshot.cursor.generation < 1)
	)
		return invalid(
			"invalid-cursor-generation",
			"The completed cursor generation must be a positive safe integer.",
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
		const lineage = snapshot.lineage.find((item) => item.artifactId === current.artifactId)!;
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
	sourceId: string,
	prepared: PreparedArtifact,
	prior: ArtifactLineageRecord | undefined,
): ArtifactLineageRecord {
	const classification = prepared.corpus.snapshot.classification;
	return {
		sourceId,
		artifactId: prepared.corpus.snapshot.artifactId,
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

function createEvent(options: {
	readonly sourceId: string;
	readonly artifactId: ArtifactId;
	readonly generation: number;
	readonly attemptId: string;
	readonly commit: string;
	readonly eventType: ArtifactEventType;
	readonly prior: ArtifactCurrentRecord | undefined;
	readonly current: ArtifactCurrentRecord | null;
}): EventRecord {
	return {
		eventId: deriveEventId({
			sourceId: options.sourceId,
			artifactId: options.artifactId,
			reconciliationGeneration: options.generation,
			attemptId: options.attemptId,
			reconciledCommit: options.commit,
			eventType: options.eventType,
		}),
		sourceId: options.sourceId,
		artifactId: options.artifactId,
		reconciliationGeneration: options.generation,
		attemptId: options.attemptId,
		reconciledCommit: options.commit,
		eventType: options.eventType,
		priorRevisionId: options.prior?.revisionId ?? null,
		currentRevisionId: options.current?.revisionId ?? null,
		priorPath: options.prior?.path ?? null,
		currentPath: options.current?.path ?? null,
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
	const nextGeneration = expectedGeneration + 1;
	const attemptId = deriveAttemptId({
		sourceId: facts.sourceId,
		expectedGeneration,
		targetCommit: facts.targetSnapshot.commit,
		mode: facts.mode,
	});
	const work: FrozenArtifactWork[] = [];
	const targetIds = new Set<string>();
	for (const artifact of prepared) {
		const snapshot = artifact.corpus.snapshot;
		targetIds.add(snapshot.artifactId);
		const prior = currentById.get(snapshot.artifactId);
		const changed =
			prior === undefined ||
			prior.revisionId !== artifact.revisionId ||
			prior.path !== snapshot.path;
		if (facts.mode === "normal" && prior !== undefined && !prior.tombstoned && !changed) continue;
		const eventType: ArtifactEventType =
			facts.mode === "repair"
				? "artifact.repaired"
				: prior === undefined
					? "artifact.created"
					: prior.tombstoned
						? "artifact.restored"
						: "artifact.revised";
		const current: ArtifactCurrentRecord = {
			sourceId: facts.sourceId,
			artifactId: snapshot.artifactId,
			revisionId: artifact.revisionId,
			path: snapshot.path,
			classification: snapshot.classification,
			observedCommit: facts.targetSnapshot.commit,
			tombstoned: false,
		};
		const revision: RevisionRecord = {
			sourceId: facts.sourceId,
			artifactId: snapshot.artifactId,
			revisionId: artifact.revisionId,
			digest: artifact.corpus.digest,
			envelope: snapshot.envelope,
			firstObservedCommit: facts.targetSnapshot.commit,
			firstObservedPath: snapshot.path,
		};
		let target: FrozenArtifactWork["target"] = null;
		if (artifact.registration !== null) {
			const schema =
				artifact.registration.schemaVersions[
					snapshot.classification.state === "classified" ? snapshot.classification.schemaVersion : 0
				];
			if (schema === undefined)
				return invalid("unknown-schema-version", "Registered schema disappeared during planning.");
			const projection = buildProjectionPlan(snapshot.envelope, schema);
			target = {
				type: "upsert",
				record: {
					sourceId: facts.sourceId,
					artifactId: snapshot.artifactId,
					revisionId: artifact.revisionId,
					path: snapshot.path,
					target: artifact.registration.target,
					fields: projection.fields.map((field) => ({
						...field,
						value: jsonValueSchema.parse(field.value),
					})),
					clearFields: [...projection.clearFields],
				} satisfies TargetRowRecord,
			};
		}
		work.push({
			artifactId: snapshot.artifactId,
			outcome: eventType,
			prior: prior ?? null,
			revision: freezeRevision(revision),
			lineage: nextLineage(facts.sourceId, artifact, lineageById.get(snapshot.artifactId)),
			current,
			target,
			event: createEvent({
				sourceId: facts.sourceId,
				artifactId: snapshot.artifactId,
				generation: nextGeneration,
				attemptId,
				commit: facts.targetSnapshot.commit,
				eventType,
				prior,
				current,
			}),
		});
	}
	for (const prior of facts.materialization.currentArtifacts) {
		if (prior.tombstoned || targetIds.has(prior.artifactId)) continue;
		const eventType = facts.mode === "repair" ? "artifact.repaired" : "artifact.deleted";
		const lineage = lineageById.get(prior.artifactId);
		if (lineage === undefined)
			return invalid(
				"missing-lineage",
				`Current artifact ${prior.artifactId} has no lineage record.`,
			);
		const current: ArtifactCurrentRecord = {
			...prior,
			observedCommit: facts.targetSnapshot.commit,
			tombstoned: true,
		};
		const registration = findRegistration(prior.classification, facts.kinds);
		if (prior.classification.state === "classified" && registration === null)
			return invalid(
				"unknown-artifact-kind",
				`Stored classified artifact ${prior.artifactId} no longer has a kind registration.`,
			);
		work.push({
			artifactId: prior.artifactId,
			outcome: eventType,
			prior,
			revision: null,
			lineage,
			current,
			target:
				registration === null
					? null
					: {
							type: "tombstone",
							target: registration.target,
							deletedAtCommit: facts.targetSnapshot.commit,
						},
			event: createEvent({
				sourceId: facts.sourceId,
				artifactId: prior.artifactId,
				generation: nextGeneration,
				attemptId,
				commit: facts.targetSnapshot.commit,
				eventType,
				prior,
				current: null,
			}),
		});
	}
	work.sort((left, right) => compareCodeUnits(left.artifactId, right.artifactId));

	if (
		facts.mode === "normal" &&
		work.length === 0 &&
		facts.materialization.cursor?.commit === facts.targetSnapshot.commit
	)
		return {
			type: "noop",
			sourceId: facts.sourceId,
			targetCommit: facts.targetSnapshot.commit,
			cursor: facts.materialization.cursor,
		};
	if (
		facts.mode === "repair" &&
		work.length === 0 &&
		facts.materialization.cursor?.commit === facts.targetSnapshot.commit
	)
		return {
			type: "noop",
			sourceId: facts.sourceId,
			targetCommit: facts.targetSnapshot.commit,
			cursor: facts.materialization.cursor,
		};

	const counts: Record<string, number> = {};
	for (const item of work) counts[item.outcome] = (counts[item.outcome] ?? 0) + 1;
	return {
		type: "planned",
		plan: {
			schemaVersion: 1,
			sourceId: facts.sourceId,
			attemptId,
			targetCommit: facts.targetSnapshot.commit,
			targetCommitish: facts.targetCommitish,
			mode: facts.mode,
			expectedCursor: facts.materialization.cursor,
			nextCursor: {
				sourceId: facts.sourceId,
				commit: facts.targetSnapshot.commit,
				generation: nextGeneration,
			},
			artifactWork: work,
			completion: { artifactCount: prepared.length, workCount: work.length, eventCounts: counts },
		},
	};
}
