export {
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
	ProjectionField,
	TargetMapping,
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
	ArtifactCurrentRecord,
	ArtifactGateway,
	ArtifactLineageRecord,
	CommitDiff,
	CommitFacts,
	CreateArtifactRequest,
	CreateArtifactResult,
	CursorCompareAndSetResult,
	CursorRecord,
	DoctorCheck,
	EventInsertResult,
	EventRecord,
	GatewayError,
	GatewayResult,
	InsertResult,
	LookupResult,
	MaterializationStoreGateway,
	OperationResult,
	ReconciliationErrorRecord,
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
