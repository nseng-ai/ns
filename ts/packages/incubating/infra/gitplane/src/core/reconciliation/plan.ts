import {
	validateClassificationTransition,
	type ArtifactClassification,
	type ArtifactId,
} from "../artifact.ts";
import type {
	ArtifactCorpusEntry,
	ArtifactKindRegistration,
	ArtifactSnapshot,
	TargetMapping,
	TargetProjectionField,
} from "../domain.ts";
import type {
	ArtifactBoundary,
	ArtifactCurrentRecord,
	ArtifactGateway,
	ArtifactLineageRecord,
	ArtifactTransitionKind,
	EventReconstructionStatus,
	MaterializationStoreGateway,
	ReconciliationMode,
	ReconciliationPlanBaseline,
} from "../gateways.ts";
import { deriveRevisionId, digestArtifactContent } from "../identity.ts";
import { buildProjectionPlan } from "../projection/index.ts";
import { deriveReconciliationPlanDigest } from "../reconciliation-baseline.ts";
import type { ReconcileFailure, ReconciliationTransitionCounts } from "./types.ts";

export interface PlannedTransition {
	readonly kind: ArtifactTransitionKind;
	readonly artifactId: ArtifactId;
	readonly prior: ArtifactCorpusEntry | null;
	readonly current: ArtifactCorpusEntry | null;
	readonly priorCurrent: ArtifactCurrentRecord | null;
	readonly lineage: ArtifactLineageRecord;
	readonly target: TargetMapping | null;
	readonly fields: readonly TargetProjectionField[];
	readonly clearFields: readonly string[];
	readonly baselinePriorRevisionId: string | null;
	readonly baselinePriorPath: string | null;
}
export interface ReconciliationPlan {
	readonly sourceId: string;
	readonly targetCommit: string;
	readonly previousCursor: string | null;
	readonly mode: ReconciliationMode;
	readonly eventReconstruction: EventReconstructionStatus;
	readonly transitions: readonly PlannedTransition[];
	readonly counts: ReconciliationTransitionCounts;
	readonly baseline: ReconciliationPlanBaseline;
}
export type PlanResult =
	| { readonly ok: true; readonly plan: ReconciliationPlan }
	| { readonly ok: false; readonly failure: ReconcileFailure };

function failure(
	phase: "read" | "plan",
	code: string,
	message: string,
	targetCommit?: string,
): PlanResult {
	return {
		ok: false,
		failure: {
			code,
			message,
			phase,
			...(targetCommit === undefined ? {} : { targetCommit }),
			cursorAdvanced: false,
		},
	};
}
function registrationFor(
	classification: ArtifactClassification,
	kinds: readonly ArtifactKindRegistration[],
): ArtifactKindRegistration | undefined {
	if (classification.state === "generic") return undefined;
	return kinds.find(
		(item) => item.apiVersion === classification.apiVersion && item.kind === classification.kind,
	);
}
function sameClassification(left: ArtifactClassification, right: ArtifactClassification): boolean {
	return (
		left.state === right.state &&
		(left.state === "generic" ||
			(right.state === "classified" &&
				left.apiVersion === right.apiVersion &&
				left.kind === right.kind &&
				left.schemaVersion === right.schemaVersion))
	);
}
function revision(entry: ArtifactCorpusEntry | null, sourceId: string): string | null {
	return entry === null
		? null
		: deriveRevisionId({
				sourceId,
				artifactId: entry.snapshot.artifactId,
				contentDigest: entry.digest.bytes,
			});
}
function eventStatus(
	previousCursor: string | null,
	targetCommit: string,
	mode: ReconciliationMode,
	strictForward: boolean,
): EventReconstructionStatus {
	if (previousCursor === null || previousCursor === targetCommit) return "not-applicable";
	if (mode === "incremental" || strictForward) return "complete";
	return "skipped";
}
function transitionKind(
	prior: ArtifactCorpusEntry | null,
	current: ArtifactCorpusEntry | null,
	stored: ArtifactCurrentRecord | null,
): ArtifactTransitionKind {
	if (current === null) return "deleted";
	if (prior === null) return stored?.tombstoned === true ? "restored" : "created";
	if (
		prior.digest.text !== current.digest.text ||
		!sameClassification(prior.snapshot.classification, current.snapshot.classification)
	)
		return "revised";
	if (prior.snapshot.path !== current.snapshot.path) return "moved";
	return "unchanged";
}
function emptyCounts(): Record<ArtifactTransitionKind, number> {
	return { created: 0, restored: 0, revised: 0, moved: 0, unchanged: 0, deleted: 0 };
}
function pathsForChanges(
	boundaries: readonly ArtifactBoundary[],
	changed: readonly string[],
): string[] {
	return boundaries
		.filter((boundary) =>
			changed.some((path) => path === boundary.path || path.startsWith(`${boundary.path}/`)),
		)
		.map((item) => item.path);
}

function corpusEntries(
	snapshots: readonly ArtifactSnapshot[],
	kinds: readonly ArtifactKindRegistration[],
	targetCommit: string,
): PlanResult | readonly ArtifactCorpusEntry[] {
	const pathsById = new Map<ArtifactId, string>();
	const entries: ArtifactCorpusEntry[] = [];
	for (const snapshot of snapshots) {
		const duplicate = pathsById.get(snapshot.artifactId);
		if (duplicate !== undefined)
			return failure(
				"plan",
				"duplicate-artifact-id",
				`Artifact ID ${snapshot.artifactId} occurs at ${duplicate} and ${snapshot.path}.`,
				targetCommit,
			);
		pathsById.set(snapshot.artifactId, snapshot.path);
		if (snapshot.classification.state === "classified") {
			const registration = registrationFor(snapshot.classification, kinds);
			if (registration === undefined)
				return failure(
					"plan",
					"unknown-artifact-kind",
					`Artifact kind is not registered for ${snapshot.artifactId}.`,
					targetCommit,
				);
			if (!(snapshot.classification.schemaVersion in registration.schemaVersions))
				return failure(
					"plan",
					"unknown-schema-version",
					`Artifact schema version is not registered for ${snapshot.artifactId}.`,
					targetCommit,
				);
		}
		const digest = digestArtifactContent(snapshot.entries);
		if (!digest.ok) return failure("plan", "invalid-corpus", digest.message, targetCommit);
		entries.push({ snapshot, digest: digest.value });
	}
	return entries;
}

export async function buildReconciliationPlan(options: {
	readonly artifacts: ArtifactGateway;
	readonly store: MaterializationStoreGateway;
	readonly sourceId: string;
	readonly artifactRoot: string;
	readonly targetCommit: string;
	readonly previousCursor: string | null;
	readonly mode: ReconciliationMode;
	readonly strictForward: boolean;
	readonly kinds: readonly ArtifactKindRegistration[];
}): Promise<PlanResult> {
	const targetBoundariesResult = await options.artifacts.discoverCommitTree({
		commit: options.targetCommit,
		artifactRoot: options.artifactRoot,
	});
	if (!targetBoundariesResult.ok)
		return failure(
			"read",
			targetBoundariesResult.error.code,
			targetBoundariesResult.error.message,
			options.targetCommit,
		);
	const targetBoundaries = targetBoundariesResult.value;
	const targetSnapshotReads = await Promise.all(
		targetBoundaries.map((boundary) =>
			options.artifacts.readCommitTreeSnapshot({
				sourceId: options.sourceId,
				commit: options.targetCommit,
				path: boundary.path,
			}),
		),
	);
	for (const item of targetSnapshotReads)
		if (!item.ok) return failure("read", item.error.code, item.error.message, options.targetCommit);
	const targetSnapshots = targetSnapshotReads.filter((item) => item.ok).map((item) => item.value);
	const targetEntries = corpusEntries(targetSnapshots, options.kinds, options.targetCommit);
	if ("ok" in targetEntries) return targetEntries;
	let oldPaths: string[] = [];
	let newPaths: string[];
	if (options.mode === "full") newPaths = targetBoundaries.map((item) => item.path);
	else {
		if (options.previousCursor === null)
			return failure(
				"plan",
				"full-required",
				"Initial reconciliation requires full mode.",
				options.targetCommit,
			);
		const diff = await options.artifacts.diffCommits({
			fromCommit: options.previousCursor,
			toCommit: options.targetCommit,
		});
		if (!diff.ok) return failure("read", diff.error.code, diff.error.message, options.targetCommit);
		const oldBoundaries = await options.artifacts.discoverCommitTree({
			commit: options.previousCursor,
			artifactRoot: options.artifactRoot,
		});
		if (!oldBoundaries.ok)
			return failure(
				"read",
				oldBoundaries.error.code,
				oldBoundaries.error.message,
				options.targetCommit,
			);
		oldPaths = pathsForChanges(oldBoundaries.value, diff.value.changedPaths);
		newPaths = pathsForChanges(targetBoundaries, diff.value.changedPaths);
	}
	if (options.mode === "full" && options.previousCursor !== null) {
		const oldBoundaries = await options.artifacts.discoverCommitTree({
			commit: options.previousCursor,
			artifactRoot: options.artifactRoot,
		});
		if (oldBoundaries.ok) oldPaths = oldBoundaries.value.map((item) => item.path);
	}
	const readSnapshots = async (commit: string, paths: readonly string[]) =>
		Promise.all(
			paths.map((path) =>
				options.artifacts.readCommitTreeSnapshot({ sourceId: options.sourceId, commit, path }),
			),
		);
	const [oldReads, newReads] = await Promise.all([
		options.previousCursor === null
			? Promise.resolve([])
			: readSnapshots(options.previousCursor, oldPaths),
		Promise.resolve(
			newPaths.map((path) => {
				const found = targetSnapshots.find((snapshot) => snapshot.path === path);
				return found === undefined
					? {
							ok: false as const,
							error: { code: "artifact-missing", message: path },
						}
					: { ok: true as const, value: found };
			}),
		),
	]);
	for (const item of [...oldReads, ...newReads])
		if (!item.ok) return failure("read", item.error.code, item.error.message, options.targetCommit);
	const oldEntries = corpusEntries(
		oldReads.filter((item) => item.ok).map((item) => item.value),
		options.kinds,
		options.targetCommit,
	);
	if ("ok" in oldEntries) return oldEntries;
	const newEntries = corpusEntries(
		newReads.filter((item) => item.ok).map((item) => item.value),
		options.kinds,
		options.targetCommit,
	);
	if ("ok" in newEntries) return newEntries;
	const oldById = new Map(oldEntries.map((item) => [item.snapshot.artifactId, item]));
	const newById = new Map(newEntries.map((item) => [item.snapshot.artifactId, item]));
	for (const oldEntry of oldEntries) {
		const replacement = newEntries.find(
			(item) =>
				item.snapshot.path === oldEntry.snapshot.path &&
				item.snapshot.artifactId !== oldEntry.snapshot.artifactId,
		);
		if (replacement !== undefined)
			return failure(
				"plan",
				"same-path-id-replacement",
				`Artifact ID changed at ${oldEntry.snapshot.path}.`,
				options.targetCommit,
			);
	}
	const existing = await options.store.readReconciliationPlanBaseline({
		sourceId: options.sourceId,
	});
	if (existing.type === "error")
		return failure("read", existing.error.code, existing.error.message, options.targetCommit);
	if (
		existing.type === "found" &&
		(existing.value.targetCommit !== options.targetCommit ||
			existing.value.expectedCursor !== options.previousCursor ||
			existing.value.mode !== options.mode)
	)
		return failure(
			"plan",
			"reconciliation-baseline-conflict",
			"An incompatible reconciliation baseline already exists for this source.",
			options.targetCommit,
		);
	const listed = await options.store.listCurrentArtifacts({ sourceId: options.sourceId });
	if (!listed.ok)
		return failure("read", listed.error.code, listed.error.message, options.targetCommit);
	const storedById = new Map(listed.value.map((item) => [item.artifactId, item]));
	const ids = new Set<ArtifactId>([...oldById.keys(), ...newById.keys()]);
	if (options.mode === "full") {
		for (const item of listed.value) if (!item.tombstoned) ids.add(item.artifactId);
		// A partial full repair may already have tombstoned an absent live row. Its baseline entry is
		// therefore the only frozen evidence that the ID still belongs to this repair plan.
		if (existing.type === "found")
			for (const entry of existing.value.entries) ids.add(entry.artifactId);
	}
	const facts = await Promise.all(
		[...ids].map(async (artifactId) => ({
			artifactId,
			lineage: await options.store.readLineage({ sourceId: options.sourceId, artifactId }),
			current: await options.store.readCurrentArtifact({ sourceId: options.sourceId, artifactId }),
		})),
	);
	for (const fact of facts) {
		if (fact.lineage.type === "error")
			return failure(
				"read",
				fact.lineage.error.code,
				fact.lineage.error.message,
				options.targetCommit,
			);
		if (fact.current.type === "error")
			return failure(
				"read",
				fact.current.error.code,
				fact.current.error.message,
				options.targetCommit,
			);
	}
	const transitions: PlannedTransition[] = [];
	for (const artifactId of [...ids].sort()) {
		const prior = oldById.get(artifactId) ?? null;
		const current = newById.get(artifactId) ?? null;
		const fact = facts.find((item) => item.artifactId === artifactId);
		if (fact === undefined) throw new Error("Missing planned store facts.");
		const priorCurrent =
			fact.current.type === "found" ? fact.current.value : (storedById.get(artifactId) ?? null);
		const baselineEntry =
			existing.type === "found"
				? existing.value.entries.find((item) => item.artifactId === artifactId)
				: undefined;
		if (prior === null && current === null && baselineEntry === undefined) continue;
		const baselineClassification =
			baselineEntry?.priorClassification ??
			prior?.snapshot.classification ??
			priorCurrent?.classification ??
			null;
		if (baselineClassification !== null && current !== null) {
			const valid = validateClassificationTransition(
				baselineClassification,
				current.snapshot.classification,
			);
			if (!valid.ok)
				return failure(
					"plan",
					valid.code,
					`Illegal classification transition for ${artifactId}.`,
					options.targetCommit,
				);
		}
		const established =
			fact.lineage.type === "found" ? fact.lineage.value.establishedClassification : null;
		if (
			established !== null &&
			current?.snapshot.classification.state === "classified" &&
			(established.apiVersion !== current.snapshot.classification.apiVersion ||
				established.kind !== current.snapshot.classification.kind)
		)
			return failure(
				"plan",
				"classification-changed",
				`Established classification changed for ${artifactId}.`,
				options.targetCommit,
			);
		const previousSchema =
			baselineClassification?.state === "classified" ? baselineClassification.schemaVersion : null;
		const nextSchema =
			current?.snapshot.classification.state === "classified"
				? current.snapshot.classification.schemaVersion
				: null;
		if (previousSchema !== null && nextSchema !== null && previousSchema !== nextSchema) {
			if (current === null) throw new Error("Current classified schema is missing.");
			const registration = registrationFor(current.snapshot.classification, options.kinds);
			if (
				registration === undefined ||
				!registration.transitions.some(
					(edge) => edge.from === previousSchema && edge.to === nextSchema,
				)
			)
				return failure(
					"plan",
					"schema-transition-not-registered",
					`Schema transition ${previousSchema} -> ${nextSchema} is not registered for ${artifactId}.`,
					options.targetCommit,
				);
		}
		const classified =
			current?.snapshot.classification.state === "classified"
				? current.snapshot.classification
				: baselineClassification?.state === "classified"
					? baselineClassification
					: null;
		const registration =
			classified === null ? undefined : registrationFor(classified, options.kinds);
		if (
			classified !== null &&
			registration === undefined &&
			(baselineEntry?.target ?? null) === null
		)
			return failure(
				"plan",
				"target-registration-missing",
				`Target registration is missing for ${artifactId}.`,
				options.targetCommit,
			);
		const projection =
			current !== null &&
			current.snapshot.classification.state === "classified" &&
			registration !== undefined
				? buildProjectionPlan(
						current.snapshot.envelope,
						registration.schemaVersions[current.snapshot.classification.schemaVersion]!,
					)
				: { fields: [], clearFields: [] };
		const kind = baselineEntry?.transition ?? transitionKind(prior, current, priorCurrent);
		const currentClassification = current?.snapshot.classification ??
			baselineClassification ?? { state: "generic" as const };
		transitions.push({
			kind,
			artifactId,
			prior,
			current,
			priorCurrent,
			lineage: {
				sourceId: options.sourceId,
				artifactId,
				establishedClassification:
					currentClassification.state === "classified" ? currentClassification : established,
				lastSchemaVersion:
					currentClassification.state === "classified" ? currentClassification.schemaVersion : null,
			},
			target: baselineEntry?.target ?? registration?.target ?? null,
			fields: projection.fields,
			clearFields: projection.clearFields,
			baselinePriorRevisionId:
				baselineEntry?.priorRevisionId ??
				revision(prior, options.sourceId) ??
				priorCurrent?.revisionId ??
				null,
			baselinePriorPath:
				baselineEntry?.priorPath ?? prior?.snapshot.path ?? priorCurrent?.path ?? null,
		});
	}
	const counts = emptyCounts();
	for (const item of transitions) counts[item.kind] += 1;
	const reconstruction = eventStatus(
		options.previousCursor,
		options.targetCommit,
		options.mode,
		options.strictForward,
	);
	const baselineInput = {
		sourceId: options.sourceId,
		expectedCursor: options.previousCursor,
		targetCommit: options.targetCommit,
		mode: options.mode,
		eventReconstruction: reconstruction,
		entries: transitions.map((item) => ({
			artifactId: item.artifactId,
			transition: item.kind,
			priorRevisionId: item.baselinePriorRevisionId,
			currentRevisionId: revision(item.current, options.sourceId),
			priorPath: item.baselinePriorPath,
			currentPath: item.current?.snapshot.path ?? null,
			priorClassification:
				existing.type === "found"
					? (existing.value.entries.find((entry) => entry.artifactId === item.artifactId)
							?.priorClassification ??
						item.prior?.snapshot.classification ??
						item.priorCurrent?.classification ??
						null)
					: (item.prior?.snapshot.classification ?? item.priorCurrent?.classification ?? null),
			currentClassification: item.current?.snapshot.classification ?? null,
			priorSchemaVersion:
				existing.type === "found"
					? (existing.value.entries.find((entry) => entry.artifactId === item.artifactId)
							?.priorSchemaVersion ?? null)
					: item.prior?.snapshot.classification.state === "classified"
						? item.prior.snapshot.classification.schemaVersion
						: null,
			currentSchemaVersion:
				item.current?.snapshot.classification.state === "classified"
					? item.current.snapshot.classification.schemaVersion
					: null,
			target: item.target,
		})),
	};
	const baseline = { ...baselineInput, planDigest: deriveReconciliationPlanDigest(baselineInput) };
	if (existing.type === "found" && existing.value.planDigest !== baseline.planDigest)
		return failure(
			"plan",
			"reconciliation-baseline-conflict",
			"An incompatible reconciliation baseline already exists for this source.",
			options.targetCommit,
		);
	return {
		ok: true,
		plan: {
			sourceId: options.sourceId,
			targetCommit: options.targetCommit,
			previousCursor: options.previousCursor,
			mode: options.mode,
			eventReconstruction: reconstruction,
			transitions,
			counts,
			baseline,
		},
	};
}
