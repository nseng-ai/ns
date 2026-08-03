import type { ArtifactClassification, ArtifactId } from "./artifact.ts";
import type {
	ArtifactCandidate,
	ArtifactEntry,
	ArtifactSnapshot,
	TargetMapping,
	TargetProjectionField,
} from "./domain.ts";
import type { ArtifactEventType, ContentDigest } from "./identity.ts";

export interface GatewayError {
	readonly code: string;
	readonly message: string;
}
export type GatewayResult<T> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly error: GatewayError };
export type LookupResult<T> =
	| { readonly type: "found"; readonly value: T }
	| { readonly type: "missing" }
	| { readonly type: "error"; readonly error: GatewayError };
export type OperationResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly error: GatewayError };
export interface CreateArtifactRequest {
	readonly directory: string;
	readonly marker: string;
	readonly artifactId: ArtifactId;
}
export type CreateArtifactResult =
	| { readonly type: "created"; readonly directory: string; readonly artifactId: ArtifactId }
	| { readonly type: "target-exists" }
	| { readonly type: "parent-missing" }
	| { readonly type: "error"; readonly error: GatewayError };
export interface CommitFacts {
	readonly commit: string;
	readonly parents: readonly string[];
	readonly isMerge: boolean;
}
export interface ArtifactBoundary {
	readonly path: string;
}
export interface TreeInventoryEntry {
	readonly path: string;
	readonly kind: ArtifactEntry["kind"];
}
export interface CommitDiff {
	readonly fromCommit: string;
	readonly toCommit: string;
	readonly changedPaths: readonly string[];
}
export interface ArtifactGateway {
	createArtifact(request: CreateArtifactRequest): Promise<CreateArtifactResult>;
	resolveCommit(request: { readonly commitish: string }): Promise<GatewayResult<string>>;
	readCommitFacts(request: { readonly commit: string }): Promise<GatewayResult<CommitFacts>>;
	isAncestor(request: {
		readonly ancestor: string;
		readonly descendant: string;
	}): Promise<GatewayResult<boolean>>;
	discoverWorkingTree(request: {
		readonly artifactRoot: string;
	}): Promise<GatewayResult<readonly ArtifactBoundary[]>>;
	discoverCommitTree(request: {
		readonly commit: string;
		readonly artifactRoot: string;
	}): Promise<GatewayResult<readonly ArtifactBoundary[]>>;
	readWorkingTreeSnapshot(request: {
		readonly sourceId: string;
		readonly path: string;
	}): Promise<GatewayResult<ArtifactSnapshot>>;
	readCommitTreeSnapshot(request: {
		readonly sourceId: string;
		readonly commit: string;
		readonly path: string;
	}): Promise<GatewayResult<ArtifactSnapshot>>;
	diffCommits(request: {
		readonly fromCommit: string;
		readonly toCommit: string;
	}): Promise<GatewayResult<CommitDiff>>;
	inventoryWorkingTree(request: {
		readonly artifactRoot: string;
	}): Promise<GatewayResult<readonly TreeInventoryEntry[]>>;
	readWorkingTreeCandidate(request: {
		readonly path: string;
	}): Promise<GatewayResult<ArtifactCandidate>>;
}
export interface CursorRecord {
	readonly sourceId: string;
	readonly commit: string;
}
export interface ArtifactCurrentRecord {
	readonly sourceId: string;
	readonly artifactId: ArtifactId;
	readonly revisionId: string;
	readonly path: string;
	readonly classification: ArtifactClassification;
	readonly observedCommit: string;
	readonly tombstoned: boolean;
}
export interface ArtifactLineageRecord {
	readonly sourceId: string;
	readonly artifactId: ArtifactId;
	readonly establishedClassification: Extract<
		ArtifactClassification,
		{ readonly state: "classified" }
	> | null;
	readonly lastSchemaVersion: number | null;
}
export interface RevisionRecord {
	readonly sourceId: string;
	readonly artifactId: ArtifactId;
	readonly revisionId: string;
	readonly digest: ContentDigest;
	readonly envelope: Readonly<Record<string, unknown>>;
	readonly firstObservedCommit: string;
	readonly firstObservedPath: string;
}
export interface TargetRowRecord {
	readonly sourceId: string;
	readonly artifactId: ArtifactId;
	readonly revisionId: string;
	readonly path: string;
	readonly target: TargetMapping;
	readonly fields: readonly TargetProjectionField[];
	readonly clearFields: readonly string[];
}
export interface EventRecord {
	readonly eventId: string;
	readonly sourceId: string;
	readonly artifactId: ArtifactId;
	readonly reconciledCommit: string;
	readonly eventType: ArtifactEventType;
	readonly priorRevisionId: string | null;
	readonly currentRevisionId: string | null;
	readonly priorPath: string | null;
	readonly currentPath: string | null;
}
export interface StoredEvent {
	readonly event: EventRecord;
	readonly sequence: number;
}
export interface ReconciliationErrorRecord {
	readonly sourceId: string;
	readonly targetCommit: string;
	readonly subject: string;
	readonly operation: string;
	readonly category: string;
	readonly diagnostic: string;
	readonly observedAt: Date;
}
export interface StoredReconciliationError extends ReconciliationErrorRecord {
	readonly firstObservedAt: Date;
	readonly lastObservedAt: Date;
	readonly attemptCount: number;
	readonly resolved: boolean;
}
export type ReconciliationMode = "incremental" | "full";
export type EventReconstructionStatus = "complete" | "skipped" | "not-applicable";
export type ArtifactTransitionKind =
	| "created"
	| "restored"
	| "revised"
	| "moved"
	| "unchanged"
	| "deleted";
export interface ReconciliationPlanBaselineEntry {
	readonly artifactId: ArtifactId;
	readonly transition: ArtifactTransitionKind;
	readonly priorRevisionId: string | null;
	readonly currentRevisionId: string | null;
	readonly priorPath: string | null;
	readonly currentPath: string | null;
	readonly priorClassification: ArtifactClassification | null;
	readonly currentClassification: ArtifactClassification | null;
	readonly priorSchemaVersion: number | null;
	readonly currentSchemaVersion: number | null;
	readonly target: TargetMapping | null;
}
export interface ReconciliationPlanBaseline {
	readonly sourceId: string;
	readonly expectedCursor: string | null;
	readonly targetCommit: string;
	readonly mode: ReconciliationMode;
	readonly eventReconstruction: EventReconstructionStatus;
	readonly planDigest: string;
	readonly entries: readonly ReconciliationPlanBaselineEntry[];
}
export type BaselineDeleteResult =
	| { readonly type: "deleted" | "missing" }
	| { readonly type: "mismatch"; readonly actualDigest: string }
	| { readonly type: "error"; readonly error: GatewayError };
export type CountedOperationResult =
	| { readonly ok: true; readonly count: number }
	| { readonly ok: false; readonly error: GatewayError };
export interface DoctorCheck {
	readonly code: string;
	readonly subject: string;
	readonly status: "pass" | "fail" | "unsupported";
	readonly summary: string;
}
export interface DoctorCapability {
	readonly requirement: "required" | "optional";
	readonly status: "pass" | "unsupported";
	readonly detail: string;
}
export interface DoctorIntrospection {
	readonly controlSchema:
		| { readonly state: "compatible"; readonly version: number }
		| { readonly state: "missing" | "incompatible"; readonly detail: string };
	readonly targetTables: readonly {
		readonly name: string;
		readonly columns: readonly string[];
		readonly uniqueColumnSets: readonly (readonly string[])[];
	}[];
	readonly jsonProjection: DoctorCapability;
}
export type CursorCompareAndSetResult =
	| { readonly type: "updated" }
	| { readonly type: "mismatch"; readonly actual: string | null }
	| { readonly type: "error"; readonly error: GatewayError };
export type InsertResult =
	| { readonly type: "inserted" }
	| { readonly type: "existing" }
	| { readonly type: "conflict"; readonly message: string }
	| { readonly type: "error"; readonly error: GatewayError };
export type EventInsertResult =
	| { readonly type: "inserted" | "existing"; readonly sequence: number }
	| { readonly type: "conflict"; readonly message: string }
	| { readonly type: "error"; readonly error: GatewayError };
export interface MaterializationStoreGateway {
	readReconciliationPlanBaseline(request: {
		readonly sourceId: string;
	}): Promise<LookupResult<ReconciliationPlanBaseline>>;
	insertReconciliationPlanBaseline(baseline: ReconciliationPlanBaseline): Promise<InsertResult>;
	deleteReconciliationPlanBaseline(request: {
		readonly sourceId: string;
		readonly planDigest: string;
	}): Promise<BaselineDeleteResult>;
	readCursor(request: { readonly sourceId: string }): Promise<LookupResult<CursorRecord>>;
	compareAndSetCursor(request: {
		readonly sourceId: string;
		readonly expectedCommit: string | null;
		readonly nextCommit: string;
	}): Promise<CursorCompareAndSetResult>;
	readLineage(request: {
		readonly sourceId: string;
		readonly artifactId: ArtifactId;
	}): Promise<LookupResult<ArtifactLineageRecord>>;
	readCurrentArtifact(request: {
		readonly sourceId: string;
		readonly artifactId: ArtifactId;
	}): Promise<LookupResult<ArtifactCurrentRecord>>;
	upsertLineage(record: ArtifactLineageRecord): Promise<OperationResult>;
	listCurrentArtifacts(request: {
		readonly sourceId: string;
	}): Promise<GatewayResult<readonly ArtifactCurrentRecord[]>>;
	insertRevision(record: RevisionRecord): Promise<InsertResult>;
	upsertCurrentArtifact(record: ArtifactCurrentRecord): Promise<OperationResult>;
	upsertTargetRow(record: TargetRowRecord): Promise<OperationResult>;
	/** A missing target row is an idempotent success. */
	tombstoneTargetRow(request: {
		readonly sourceId: string;
		readonly artifactId: ArtifactId;
		readonly target: TargetMapping;
		readonly deletedAtCommit: string;
	}): Promise<OperationResult>;
	insertEvent(record: EventRecord): Promise<EventInsertResult>;
	recordReconciliationError(record: ReconciliationErrorRecord): Promise<OperationResult>;
	resolveReconciliationErrors(request: {
		readonly sourceId: string;
		readonly targetCommit: string;
		readonly resolvedAt: Date;
	}): Promise<CountedOperationResult>;
	inspectDoctor(request: {
		readonly sourceId: string;
		readonly targets: readonly TargetMapping[];
	}): Promise<GatewayResult<DoctorIntrospection>>;
	close(): Promise<OperationResult>;
}
