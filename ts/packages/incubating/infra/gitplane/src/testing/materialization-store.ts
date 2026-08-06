import { isDeepStrictEqual } from "node:util";
import type {
	ArtifactCurrentRecord,
	ArtifactId,
	ArtifactLineageRecord,
	CursorCompareAndSetResult,
	CursorRecord,
	DoctorIntrospection,
	EventInsertResult,
	EventRecord,
	GatewayError,
	GatewayResult,
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
	TargetMapping,
	TargetRowRecord,
} from "../core/index.ts";

type FailureKey = keyof MaterializationStoreGateway;
export interface MaterializedTargetRow {
	readonly table: string;
	readonly sourceId: string;
	readonly artifactId: ArtifactId;
	readonly values: Readonly<Record<string, unknown>>;
}
export interface InMemoryMaterializationStoreState {
	readonly cursors?: readonly CursorRecord[];
	readonly lineage?: readonly ArtifactLineageRecord[];
	readonly currentArtifacts?: readonly ArtifactCurrentRecord[];
	readonly attempts?: readonly ReconciliationAttemptRecord[];
	readonly revisions?: readonly RevisionRecord[];
	readonly targetRows?: readonly MaterializedTargetRow[];
	readonly events?: readonly StoredEvent[];
	readonly errors?: readonly StoredReconciliationError[];
	readonly doctorIntrospection?: DoctorIntrospection;
	readonly failures?: Partial<Record<FailureKey, GatewayError>>;
}
function copy<T>(value: T): T {
	return structuredClone(value);
}
export class InMemoryMaterializationStoreGateway implements MaterializationStoreGateway {
	private readonly failures: Partial<Record<FailureKey, GatewayError>>;
	private readonly cursors: CursorRecord[];
	private readonly lineage: ArtifactLineageRecord[];
	private readonly current: ArtifactCurrentRecord[];
	private readonly attempts: ReconciliationAttemptRecord[];
	private readonly revisions: RevisionRecord[];
	private readonly targets: MaterializedTargetRow[];
	private readonly events: StoredEvent[];
	private readonly errors: StoredReconciliationError[];
	private readonly doctorIntrospection: DoctorIntrospection;
	constructor(state: InMemoryMaterializationStoreState = {}) {
		this.failures = copy(state.failures ?? {});
		this.cursors = copy([...(state.cursors ?? [])]);
		this.lineage = copy([...(state.lineage ?? [])]);
		this.current = copy([...(state.currentArtifacts ?? [])]);
		this.attempts = copy([...(state.attempts ?? [])]);
		this.revisions = copy([...(state.revisions ?? [])]);
		this.targets = copy([...(state.targetRows ?? [])]);
		this.events = copy([...(state.events ?? [])]);
		this.errors = copy([...(state.errors ?? [])]);
		this.doctorIntrospection = copy(
			state.doctorIntrospection ?? {
				controlSchema: { state: "compatible", version: 1 },
				targetTables: [],
				jsonProjection: {
					requirement: "required",
					status: "pass",
					detail: "JSON projection is supported.",
				},
			},
		);
	}
	snapshot(): InMemoryMaterializationStoreState {
		return copy({
			cursors: this.cursors,
			lineage: this.lineage,
			currentArtifacts: this.current,
			attempts: this.attempts,
			revisions: this.revisions,
			targetRows: this.targets,
			events: this.events,
			errors: this.errors,
			doctorIntrospection: this.doctorIntrospection,
		});
	}
	private failure(operation: FailureKey): GatewayError | undefined {
		const failure = this.failures[operation];
		return failure === undefined ? undefined : { ...failure };
	}
	async readMaterializationSnapshot(request: {
		readonly sourceId: string;
	}): Promise<GatewayResult<MaterializationSnapshot>> {
		const failure = this.failure("readMaterializationSnapshot");
		if (failure !== undefined) return { ok: false, error: failure };
		return {
			ok: true,
			value: copy({
				cursor: this.cursors.find((item) => item.sourceId === request.sourceId) ?? null,
				currentArtifacts: this.current.filter((item) => item.sourceId === request.sourceId),
				lineage: this.lineage.filter((item) => item.sourceId === request.sourceId),
				pendingAttempt: this.attempts.find((item) => item.sourceId === request.sourceId) ?? null,
			}),
		};
	}
	async insertReconciliationAttempt(record: ReconciliationAttemptRecord): Promise<InsertResult> {
		const failure = this.failure("insertReconciliationAttempt");
		if (failure !== undefined) return { type: "error", error: failure };
		const existing = this.attempts.find((item) => item.sourceId === record.sourceId);
		if (existing !== undefined)
			return isDeepStrictEqual(existing, record)
				? { type: "existing" }
				: { type: "conflict", message: "Source already has a different pending attempt." };
		const cursor = this.cursors.find((item) => item.sourceId === record.sourceId) ?? null;
		if (!isDeepStrictEqual(cursor, record.plan.expectedCursor))
			return {
				type: "conflict",
				message: "Completed cursor no longer matches the reconciliation attempt.",
			};
		this.attempts.push(copy(record));
		return { type: "inserted" };
	}
	async deleteReconciliationAttempt(request: {
		readonly sourceId: string;
		readonly attemptId: string;
	}): Promise<OperationResult> {
		const failure = this.failure("deleteReconciliationAttempt");
		if (failure !== undefined) return { ok: false, error: failure };
		const index = this.attempts.findIndex(
			(item) => item.sourceId === request.sourceId && item.attemptId === request.attemptId,
		);
		if (index >= 0) this.attempts.splice(index, 1);
		return { ok: true };
	}
	async readCursor(request: { readonly sourceId: string }): Promise<LookupResult<CursorRecord>> {
		const failure = this.failure("readCursor");
		if (failure !== undefined) return { type: "error", error: failure };
		const found = this.cursors.find((item) => item.sourceId === request.sourceId);
		return found === undefined ? { type: "missing" } : { type: "found", value: copy(found) };
	}
	async compareAndSetCursor(request: {
		readonly sourceId: string;
		readonly expectedGeneration: number;
		readonly next: CursorRecord;
	}): Promise<CursorCompareAndSetResult> {
		const failure = this.failure("compareAndSetCursor");
		if (failure !== undefined) return { type: "error", error: failure };
		const index = this.cursors.findIndex((item) => item.sourceId === request.sourceId);
		const existing = this.cursors[index];
		const actualGeneration = existing?.generation ?? 0;
		if (actualGeneration !== request.expectedGeneration)
			return { type: "mismatch", actual: existing === undefined ? null : copy(existing) };
		if (
			request.next.sourceId !== request.sourceId ||
			request.next.generation !== request.expectedGeneration + 1
		)
			return {
				type: "error",
				error: {
					code: "invalid-cursor-transition",
					message: "Cursor generation must advance by one.",
				},
			};
		if (index < 0) this.cursors.push(copy(request.next));
		else this.cursors[index] = copy(request.next);
		return { type: "updated" };
	}
	async readLineage(request: {
		readonly sourceId: string;
		readonly artifactId: ArtifactId;
	}): Promise<LookupResult<ArtifactLineageRecord>> {
		return this.lookup("readLineage", this.lineage, request);
	}
	async readCurrentArtifact(request: {
		readonly sourceId: string;
		readonly artifactId: ArtifactId;
	}): Promise<LookupResult<ArtifactCurrentRecord>> {
		return this.lookup("readCurrentArtifact", this.current, request);
	}
	private lookup<T extends { readonly sourceId: string; readonly artifactId: ArtifactId }>(
		operation: FailureKey,
		records: readonly T[],
		request: { readonly sourceId: string; readonly artifactId: ArtifactId },
	): LookupResult<T> {
		const failure = this.failure(operation);
		if (failure !== undefined) return { type: "error", error: failure };
		const found = records.find(
			(item) => item.sourceId === request.sourceId && item.artifactId === request.artifactId,
		);
		return found === undefined ? { type: "missing" } : { type: "found", value: copy(found) };
	}
	async upsertLineage(record: ArtifactLineageRecord): Promise<OperationResult> {
		return this.upsert(
			"upsertLineage",
			this.lineage,
			record,
			(item) => `${item.sourceId}:${item.artifactId}`,
		);
	}
	async listCurrentArtifacts(request: {
		readonly sourceId: string;
	}): Promise<GatewayResult<readonly ArtifactCurrentRecord[]>> {
		const failure = this.failure("listCurrentArtifacts");
		return failure === undefined
			? { ok: true, value: copy(this.current.filter((item) => item.sourceId === request.sourceId)) }
			: { ok: false, error: failure };
	}
	async insertRevision(record: RevisionRecord): Promise<InsertResult> {
		const failure = this.failure("insertRevision");
		if (failure !== undefined) return { type: "error", error: failure };
		const found = this.revisions.find((item) => item.revisionId === record.revisionId);
		if (found !== undefined) {
			const foundContent = {
				sourceId: found.sourceId,
				artifactId: found.artifactId,
				revisionId: found.revisionId,
				digest: found.digest,
				envelope: found.envelope,
			};
			const recordContent = {
				sourceId: record.sourceId,
				artifactId: record.artifactId,
				revisionId: record.revisionId,
				digest: record.digest,
				envelope: record.envelope,
			};
			return isDeepStrictEqual(foundContent, recordContent)
				? { type: "existing" }
				: { type: "conflict", message: "Revision ID already has different content." };
		}
		this.revisions.push(copy(record));
		return { type: "inserted" };
	}
	async upsertCurrentArtifact(record: ArtifactCurrentRecord): Promise<OperationResult> {
		return this.upsert(
			"upsertCurrentArtifact",
			this.current,
			record,
			(item) => `${item.sourceId}:${item.artifactId}`,
		);
	}
	async upsertTargetRow(record: TargetRowRecord): Promise<OperationResult> {
		const failure = this.failure("upsertTargetRow");
		if (failure !== undefined) return { ok: false, error: failure };
		const index = this.targets.findIndex(
			(item) =>
				item.table === record.target.table &&
				item.sourceId === record.sourceId &&
				item.artifactId === record.artifactId,
		);
		const previous = this.targets[index];
		const lineage = record.target.lineage;
		const values: Record<string, unknown> = {
			...(previous?.values ?? {}),
			[lineage.sourceId]: record.sourceId,
			[lineage.artifactId]: record.artifactId,
			[lineage.revisionId]: record.revisionId,
			[lineage.path]: record.path,
			[lineage.deleted]: false,
			[lineage.deletedAtCommit]: null,
		};
		for (const field of record.fields) values[field.column] = copy(field.value);
		for (const column of record.clearFields) values[column] = null;
		const materialized = {
			table: record.target.table,
			sourceId: record.sourceId,
			artifactId: record.artifactId,
			values,
		};
		if (index < 0) this.targets.push(materialized);
		else this.targets[index] = materialized;
		return { ok: true };
	}
	private upsert<T>(
		operation: FailureKey,
		records: T[],
		record: T,
		key: (item: T) => string,
	): OperationResult {
		const failure = this.failure(operation);
		if (failure !== undefined) return { ok: false, error: failure };
		const index = records.findIndex((item) => key(item) === key(record));
		if (index < 0) records.push(copy(record));
		else records[index] = copy(record);
		return { ok: true };
	}
	async tombstoneTargetRow(request: {
		readonly sourceId: string;
		readonly artifactId: ArtifactId;
		readonly target: TargetMapping;
		readonly deletedAtCommit: string;
	}): Promise<OperationResult> {
		const failure = this.failure("tombstoneTargetRow");
		if (failure !== undefined) return { ok: false, error: failure };
		const index = this.targets.findIndex(
			(item) =>
				item.sourceId === request.sourceId &&
				item.artifactId === request.artifactId &&
				item.table === request.target.table,
		);
		const found = this.targets[index];
		if (found !== undefined)
			this.targets[index] = {
				...found,
				values: {
					...found.values,
					[request.target.lineage.deleted]: true,
					[request.target.lineage.deletedAtCommit]: request.deletedAtCommit,
				},
			};
		return { ok: true };
	}
	async insertEvent(record: EventRecord): Promise<EventInsertResult> {
		const failure = this.failure("insertEvent");
		if (failure !== undefined) return { type: "error", error: failure };
		const found = this.events.find((item) => item.event.eventId === record.eventId);
		if (found !== undefined)
			return isDeepStrictEqual(found.event, record)
				? { type: "existing", sequence: found.sequence }
				: { type: "conflict", message: "Event ID already has different content." };
		const sequence =
			Math.max(
				0,
				...this.events
					.filter((item) => item.event.sourceId === record.sourceId)
					.map((item) => item.sequence),
			) + 1;
		this.events.push({ event: copy(record), sequence });
		return { type: "inserted", sequence };
	}
	async recordReconciliationError(record: ReconciliationErrorRecord): Promise<OperationResult> {
		const failure = this.failure("recordReconciliationError");
		if (failure !== undefined) return { ok: false, error: failure };
		const index = this.errors.findIndex(
			(item) =>
				item.sourceId === record.sourceId &&
				item.targetCommit === record.targetCommit &&
				item.subject === record.subject &&
				item.operation === record.operation,
		);
		const existing = this.errors[index];
		this.errors[index < 0 ? this.errors.length : index] =
			existing === undefined
				? {
						...copy(record),
						firstObservedAt: record.observedAt,
						lastObservedAt: record.observedAt,
						attemptCount: 1,
						resolved: false,
					}
				: {
						...existing,
						category: record.category,
						diagnostic: record.diagnostic,
						lastObservedAt: record.observedAt,
						attemptCount: existing.attemptCount + 1,
						resolved: false,
					};
		return { ok: true };
	}
	async resolveReconciliationErrors(request: {
		readonly sourceId: string;
		readonly targetCommit: string;
		readonly resolvedAt: Date;
	}): Promise<OperationResult> {
		const failure = this.failure("resolveReconciliationErrors");
		if (failure !== undefined) return { ok: false, error: failure };
		for (const [index, item] of this.errors.entries()) {
			if (item.sourceId === request.sourceId && item.targetCommit === request.targetCommit)
				this.errors[index] = { ...item, lastObservedAt: request.resolvedAt, resolved: true };
		}
		return { ok: true };
	}
	async inspectDoctor(_request: {
		readonly targets: readonly TargetMapping[];
	}): Promise<GatewayResult<DoctorIntrospection>> {
		const failure = this.failure("inspectDoctor");
		return failure === undefined
			? { ok: true, value: copy(this.doctorIntrospection) }
			: { ok: false, error: failure };
	}
	async close(): Promise<OperationResult> {
		const failure = this.failure("close");
		return failure === undefined ? { ok: true } : { ok: false, error: failure };
	}
}
