export {
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
	deriveEventId,
	deriveRevisionId,
	digestArtifactContent,
} from "./identity.ts";
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
	ArtifactTransitionKind,
	BaselineDeleteResult,
	ArtifactLineageRecord,
	CommitDiff,
	CommitFacts,
	CreateArtifactRequest,
	CreateArtifactResult,
	CountedOperationResult,
	CursorCompareAndSetResult,
	CursorRecord,
	DoctorCapability,
	DoctorCheck,
	DoctorIntrospection,
	EventInsertResult,
	EventRecord,
	EventReconstructionStatus,
	GatewayError,
	GatewayResult,
	InsertResult,
	LookupResult,
	MaterializationStoreGateway,
	OperationResult,
	ReconciliationErrorRecord,
	ReconciliationMode,
	ReconciliationPlanBaseline,
	ReconciliationPlanBaselineEntry,
	RevisionRecord,
	StoredEvent,
	StoredReconciliationError,
	TargetRowRecord,
	TreeInventoryEntry,
} from "./gateways.ts";
export { checkArtifactCorpus } from "./check/check-artifact-corpus.ts";
export type {
	CorpusCheckFailure,
	CorpusCheckResult,
	CorpusPreconditionResult,
} from "./check/corpus.ts";
export { FINDING_CODES, findingSchema, sortFindings } from "./check/finding.ts";
export type { Finding } from "./check/finding.ts";
export { ARTIFACT_MARKER_NAME, inspectCorpusTopology } from "./check/inspect-corpus-topology.ts";
export type { ArtifactBoundaryTopology, CorpusTopology } from "./check/inspect-corpus-topology.ts";
export { doctorCheckSchema, evaluateDoctor } from "./doctor/index.ts";
export { deriveReconciliationPlanDigest } from "./reconciliation-baseline.ts";
export type { ReconciliationPlanDigestInput } from "./reconciliation-baseline.ts";
export { reconcile } from "./reconciliation/reconcile.ts";
export type {
	ReconcileContext,
	ReconcileData,
	ReconcileFailure,
	ReconcileOptions,
	ReconcileResult,
	ReconciliationTransitionCounts,
} from "./reconciliation/types.ts";
export { buildProjectionPlan, resolveJsonPointer } from "./projection/index.ts";
export type { JsonPointerResult, ProjectionPlan } from "./projection/index.ts";
