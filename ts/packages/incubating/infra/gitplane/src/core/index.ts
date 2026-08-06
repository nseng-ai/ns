export {
	ARTIFACT_MARKER_NAME,
	artifactClassificationSchema,
	artifactIdSchema,
	parseArtifactId,
	parseArtifactMarker,
	serializeArtifactMarker,
	validateClassificationTransition,
} from "./artifact.ts";
export type {
	ArtifactClassification,
	ArtifactId,
	ArtifactIdParseResult,
	ArtifactMarker,
	ClassificationTransitionResult,
	MarkerParseResult,
} from "./artifact.ts";
export { defineArtifactKind, defineGitplaneConfig } from "./domain.ts";
export type {
	ArtifactCandidate,
	ArtifactCorpus,
	ArtifactCorpusEntry,
	ArtifactEntry,
	ArtifactEntryKind,
	ArtifactKindRegistration,
	ArtifactSchemaRegistration,
	ArtifactSnapshot,
	Clock,
	GitplaneConfig,
	GitplaneContext,
	GitplaneStoreFactory,
	ProjectionField,
	StoreAccess,
	TargetMapping,
	TargetProjectionField,
} from "./domain.ts";
export {
	ARTIFACT_EVENT_TYPES,
	createArtifactIdGenerator,
	deriveAttemptId,
	deriveEventId,
	deriveRevisionId,
	digestArtifactContent,
} from "./identity.ts";
export { frozenReconciliationPlanSchema } from "./frozen-plan.ts";
export type { FrozenArtifactWork, FrozenReconciliationPlan } from "./frozen-plan.ts";
export type {
	ArtifactEventType,
	ArtifactIdGenerator,
	ContentDigest,
	IdentityResult,
} from "./identity.ts";
export type {
	ArtifactBoundary,
	ArtifactCurrentRecord,
	ArtifactGateway,
	ArtifactLineageRecord,
	CreateArtifactRequest,
	CreateArtifactResult,
	CursorCompareAndSetResult,
	CursorRecord,
	DoctorCapability,
	DoctorCheck,
	DoctorIntrospection,
	EventInsertResult,
	EventRecord,
	GatewayError,
	GatewayResult,
	GitObservation,
	InsertResult,
	LookupResult,
	MaterializationSnapshot,
	MaterializationStoreGateway,
	OperationResult,
	ReconciliationAttemptRecord,
	ReconciliationErrorRecord,
	RevisionRecord,
	StoredEvent,
	StoredReconciliationError,
	TargetRowRecord,
	TreeInventoryEntry,
} from "./gateways.ts";
export { gatherSourceFacts } from "./gather-source-facts.ts";
export type {
	GatheredSourceFacts,
	GatherSourceFactsOptions,
	GatherSourceFactsResult,
	ReconciliationMode,
	TargetSnapshotFacts,
} from "./gather-source-facts.ts";
export { checkArtifactCorpus } from "./check/check-artifact-corpus.ts";
export type {
	CorpusCheckFailure,
	CorpusCheckResult,
	CorpusPreconditionResult,
} from "./check/corpus.ts";
export { FINDING_CODES, findingSchema, sortFindings } from "./check/finding.ts";
export type { Finding } from "./check/finding.ts";
export { inspectCorpusTopology } from "./check/inspect-corpus-topology.ts";
export type { ArtifactBoundaryTopology, CorpusTopology } from "./check/inspect-corpus-topology.ts";
export { doctorCheckSchema, evaluateDoctor } from "./doctor/index.ts";
export { buildProjectionPlan, isValidJsonPointer, resolveJsonPointer } from "./projection/index.ts";
export type { JsonPointerResult, ProjectionPlan } from "./projection/index.ts";
