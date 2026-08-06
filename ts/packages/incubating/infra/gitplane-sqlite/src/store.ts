import { DatabaseSync } from "node:sqlite";
import { artifactClassificationSchema, frozenReconciliationPlanSchema } from "@nseng-ai/gitplane";
import type {
	ArtifactClassification,
	ArtifactCurrentRecord,
	ArtifactId,
	ArtifactLineageRecord,
	CursorCompareAndSetResult,
	CursorRecord,
	DoctorIntrospection,
	EventInsertResult,
	EventRecord,
	GatewayResult,
	GitplaneStoreFactory,
	InsertResult,
	LookupResult,
	MaterializationSnapshot,
	MaterializationStoreGateway,
	OperationResult,
	ReconciliationAttemptRecord,
	ReconciliationErrorRecord,
	RevisionRecord,
	TargetMapping,
	TargetRowRecord,
} from "@nseng-ai/gitplane";
import {
	databaseError,
	quoteIdentifier,
	readTransaction,
	resolveDatabasePath,
	transaction,
} from "./database.ts";
import { inspectControlSchema } from "./schema.ts";

export interface CreateSqliteStoreOptions {
	readonly path: string;
}

export function createSqliteStoreFactory(options: CreateSqliteStoreOptions): GitplaneStoreFactory {
	return (context, invocationOptions) => {
		const database = new DatabaseSync(resolveDatabasePath(options.path, context.configDirectory), {
			readOnly: invocationOptions.access === "read-only",
		});
		return new SqliteMaterializationStore(database);
	};
}

class SqliteMaterializationStore implements MaterializationStoreGateway {
	private readonly database: DatabaseSync;
	private closed = false;
	constructor(database: DatabaseSync) {
		this.database = database;
	}
	async readMaterializationSnapshot(request: {
		readonly sourceId: string;
	}): Promise<GatewayResult<MaterializationSnapshot>> {
		try {
			let snapshot: MaterializationSnapshot | undefined;
			readTransaction(this.database, () => {
				const cursorRow = this.database
					.prepare("SELECT commit_id, generation FROM gitplane_cursors WHERE source_id = ?")
					.get(request.sourceId) as { commit_id: string; generation: number } | undefined;
				const currentRows = this.database
					.prepare(
						"SELECT artifact_id, revision_id, artifact_path, classification, observed_commit, tombstoned FROM gitplane_current_artifacts WHERE source_id = ? ORDER BY artifact_id",
					)
					.all(request.sourceId) as {
					artifact_id: ArtifactId;
					revision_id: string;
					artifact_path: string;
					classification: string;
					observed_commit: string;
					tombstoned: number;
				}[];
				const lineageRows = this.database
					.prepare(
						"SELECT artifact_id, established_classification, last_schema_version FROM gitplane_lineage WHERE source_id = ? ORDER BY artifact_id",
					)
					.all(request.sourceId) as {
					artifact_id: ArtifactId;
					established_classification: string | null;
					last_schema_version: number | null;
				}[];
				const attemptRow = this.database
					.prepare(
						"SELECT attempt_id, frozen_plan FROM gitplane_reconciliation_attempts WHERE source_id = ?",
					)
					.get(request.sourceId) as { attempt_id: string; frozen_plan: string } | undefined;
				snapshot = {
					cursor:
						cursorRow === undefined
							? null
							: {
									sourceId: request.sourceId,
									commit: cursorRow.commit_id,
									generation: cursorRow.generation,
								},
					currentArtifacts: currentRows.map((row) =>
						currentFromRow(request.sourceId, row.artifact_id, row),
					),
					lineage: lineageRows.map((row) => ({
						sourceId: request.sourceId,
						artifactId: row.artifact_id,
						establishedClassification: parseJson(row.established_classification),
						lastSchemaVersion: row.last_schema_version,
					})),
					pendingAttempt:
						attemptRow === undefined ? null : parseAttempt(request.sourceId, attemptRow),
				};
			});
			if (snapshot === undefined)
				throw new Error("Materialization snapshot transaction produced no value.");
			return { ok: true, value: snapshot };
		} catch (error) {
			return { ok: false, error: databaseError(error) };
		}
	}
	async insertReconciliationAttempt(record: ReconciliationAttemptRecord): Promise<InsertResult> {
		try {
			const serialized = deterministicJson(record.plan);
			let result: InsertResult = { type: "inserted" };
			transaction(this.database, () => {
				const existing = this.database
					.prepare(
						"SELECT attempt_id, frozen_plan FROM gitplane_reconciliation_attempts WHERE source_id = ?",
					)
					.get(record.sourceId) as { attempt_id: string; frozen_plan: string } | undefined;
				if (existing !== undefined) {
					result =
						existing.attempt_id === record.attemptId && existing.frozen_plan === serialized
							? { type: "existing" }
							: { type: "conflict", message: "Source already has a different pending attempt." };
					return;
				}
				const cursor = this.database
					.prepare("SELECT commit_id, generation FROM gitplane_cursors WHERE source_id = ?")
					.get(record.sourceId) as { commit_id: string; generation: number } | undefined;
				const expected = record.plan.expectedCursor;
				if (
					(cursor === undefined) !== (expected === null) ||
					(cursor !== undefined &&
						(cursor.commit_id !== expected?.commit || cursor.generation !== expected.generation))
				) {
					result = {
						type: "conflict",
						message: "Completed cursor no longer matches the reconciliation attempt.",
					};
					return;
				}
				this.database
					.prepare(
						"INSERT INTO gitplane_reconciliation_attempts (source_id, attempt_id, frozen_plan) VALUES (?, ?, ?)",
					)
					.run(record.sourceId, record.attemptId, serialized);
			});
			return result;
		} catch (error) {
			return { type: "error", error: databaseError(error) };
		}
	}
	async deleteReconciliationAttempt(request: {
		readonly sourceId: string;
		readonly attemptId: string;
	}): Promise<OperationResult> {
		return this.operation(() =>
			this.database
				.prepare(
					"DELETE FROM gitplane_reconciliation_attempts WHERE source_id = ? AND attempt_id = ?",
				)
				.run(request.sourceId, request.attemptId),
		);
	}
	async readCursor(request: { readonly sourceId: string }): Promise<LookupResult<CursorRecord>> {
		return this.lookup(() => {
			const row = this.database
				.prepare("SELECT commit_id, generation FROM gitplane_cursors WHERE source_id = ?")
				.get(request.sourceId) as { commit_id: string; generation: number } | undefined;
			return row === undefined
				? undefined
				: { sourceId: request.sourceId, commit: row.commit_id, generation: row.generation };
		});
	}
	async compareAndSetCursor(request: {
		readonly sourceId: string;
		readonly expectedGeneration: number;
		readonly next: CursorRecord;
	}): Promise<CursorCompareAndSetResult> {
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
		try {
			let result: CursorCompareAndSetResult = { type: "updated" };
			transaction(this.database, () => {
				const row = this.database
					.prepare("SELECT commit_id, generation FROM gitplane_cursors WHERE source_id = ?")
					.get(request.sourceId) as { commit_id: string; generation: number } | undefined;
				if ((row?.generation ?? 0) !== request.expectedGeneration) {
					result = {
						type: "mismatch",
						actual:
							row === undefined
								? null
								: { sourceId: request.sourceId, commit: row.commit_id, generation: row.generation },
					};
					return;
				}
				this.database
					.prepare(
						"INSERT INTO gitplane_cursors (source_id, commit_id, generation) VALUES (?, ?, ?) ON CONFLICT(source_id) DO UPDATE SET commit_id = excluded.commit_id, generation = excluded.generation",
					)
					.run(request.sourceId, request.next.commit, request.next.generation);
			});
			return result;
		} catch (error) {
			return { type: "error", error: databaseError(error) };
		}
	}
	async readLineage(request: {
		readonly sourceId: string;
		readonly artifactId: ArtifactId;
	}): Promise<LookupResult<ArtifactLineageRecord>> {
		return this.lookup(() => {
			const row = this.database
				.prepare(
					"SELECT established_classification, last_schema_version FROM gitplane_lineage WHERE source_id = ? AND artifact_id = ?",
				)
				.get(request.sourceId, request.artifactId) as
				| { established_classification: string | null; last_schema_version: number | null }
				| undefined;
			return row === undefined
				? undefined
				: {
						sourceId: request.sourceId,
						artifactId: request.artifactId,
						establishedClassification: parseJson(row.established_classification),
						lastSchemaVersion: row.last_schema_version,
					};
		});
	}
	async readCurrentArtifact(request: {
		readonly sourceId: string;
		readonly artifactId: ArtifactId;
	}): Promise<LookupResult<ArtifactCurrentRecord>> {
		return this.lookup(() => {
			const row = this.database
				.prepare(
					"SELECT revision_id, artifact_path, classification, observed_commit, tombstoned FROM gitplane_current_artifacts WHERE source_id = ? AND artifact_id = ?",
				)
				.get(request.sourceId, request.artifactId) as
				| {
						revision_id: string;
						artifact_path: string;
						classification: string;
						observed_commit: string;
						tombstoned: number;
				  }
				| undefined;
			return row === undefined
				? undefined
				: currentFromRow(request.sourceId, request.artifactId, row);
		});
	}
	async upsertLineage(record: ArtifactLineageRecord): Promise<OperationResult> {
		return this.operation(() =>
			this.database
				.prepare(
					"INSERT INTO gitplane_lineage (source_id, artifact_id, established_classification, last_schema_version) VALUES (?, ?, ?, ?) ON CONFLICT(source_id, artifact_id) DO UPDATE SET established_classification = excluded.established_classification, last_schema_version = excluded.last_schema_version",
				)
				.run(
					record.sourceId,
					record.artifactId,
					stringifyNullable(record.establishedClassification),
					record.lastSchemaVersion,
				),
		);
	}
	async listCurrentArtifacts(request: {
		readonly sourceId: string;
	}): Promise<GatewayResult<readonly ArtifactCurrentRecord[]>> {
		try {
			const rows = this.database
				.prepare(
					"SELECT artifact_id, revision_id, artifact_path, classification, observed_commit, tombstoned FROM gitplane_current_artifacts WHERE source_id = ? ORDER BY artifact_id",
				)
				.all(request.sourceId) as {
				artifact_id: ArtifactId;
				revision_id: string;
				artifact_path: string;
				classification: string;
				observed_commit: string;
				tombstoned: number;
			}[];
			return {
				ok: true,
				value: rows.map((row) => currentFromRow(request.sourceId, row.artifact_id, row)),
			};
		} catch (error) {
			return { ok: false, error: databaseError(error) };
		}
	}
	async insertRevision(record: RevisionRecord): Promise<InsertResult> {
		try {
			const found = this.database
				.prepare(
					"SELECT source_id, artifact_id, digest, digest_bytes, manifest, envelope FROM gitplane_revisions WHERE revision_id = ?",
				)
				.get(record.revisionId) as
				| {
						source_id: string;
						artifact_id: string;
						digest: string;
						digest_bytes: Uint8Array;
						manifest: string;
						envelope: string;
				  }
				| undefined;
			if (found !== undefined)
				return found.source_id === record.sourceId &&
					found.artifact_id === record.artifactId &&
					found.digest === record.digest.text &&
					bytesEqual(found.digest_bytes, record.digest.bytes) &&
					found.manifest === deterministicJson(record.digest.manifest) &&
					found.envelope === deterministicJson(record.envelope)
					? { type: "existing" }
					: { type: "conflict", message: "Revision ID already has different content." };
			this.database
				.prepare(
					"INSERT INTO gitplane_revisions (revision_id, source_id, artifact_id, digest, digest_bytes, manifest, envelope, first_observed_commit, first_observed_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
				)
				.run(
					record.revisionId,
					record.sourceId,
					record.artifactId,
					record.digest.text,
					record.digest.bytes,
					deterministicJson(record.digest.manifest),
					deterministicJson(record.envelope),
					record.firstObservedCommit,
					record.firstObservedPath,
				);
			return { type: "inserted" };
		} catch (error) {
			return { type: "error", error: databaseError(error) };
		}
	}
	async upsertCurrentArtifact(record: ArtifactCurrentRecord): Promise<OperationResult> {
		return this.operation(() =>
			this.database
				.prepare(
					"INSERT INTO gitplane_current_artifacts (source_id, artifact_id, revision_id, artifact_path, classification, observed_commit, tombstoned) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(source_id, artifact_id) DO UPDATE SET revision_id=excluded.revision_id, artifact_path=excluded.artifact_path, classification=excluded.classification, observed_commit=excluded.observed_commit, tombstoned=excluded.tombstoned",
				)
				.run(
					record.sourceId,
					record.artifactId,
					record.revisionId,
					record.path,
					deterministicJson(record.classification),
					record.observedCommit,
					record.tombstoned ? 1 : 0,
				),
		);
	}
	async upsertTargetRow(record: TargetRowRecord): Promise<OperationResult> {
		return this.operation(() => {
			const lineage = record.target.lineage;
			const entries: [string, unknown][] = [
				[lineage.sourceId, record.sourceId],
				[lineage.artifactId, record.artifactId],
				[lineage.revisionId, record.revisionId],
				[lineage.path, record.path],
				[lineage.deleted, 0],
				[lineage.deletedAtCommit, null],
				...record.fields.map((field): [string, unknown] => [
					field.column,
					bindProjection(field.mode, field.value),
				]),
				...record.clearFields.map((column): [string, unknown] => [column, null]),
			];
			const columns = entries.map(([column]) => quoteIdentifier(column));
			const updates = entries
				.slice(2)
				.map(([column]) => `${quoteIdentifier(column)}=excluded.${quoteIdentifier(column)}`);
			const sql = `INSERT INTO ${quoteIdentifier(record.target.table)} (${columns.join(",")}) VALUES (${entries.map(() => "?").join(",")}) ON CONFLICT(${quoteIdentifier(lineage.sourceId)},${quoteIdentifier(lineage.artifactId)}) DO UPDATE SET ${updates.join(",")}`;
			this.database.prepare(sql).run(...entries.map(([, value]) => sqliteValue(value)));
		});
	}
	async tombstoneTargetRow(request: {
		readonly sourceId: string;
		readonly artifactId: ArtifactId;
		readonly target: TargetMapping;
		readonly deletedAtCommit: string;
	}): Promise<OperationResult> {
		return this.operation(() =>
			this.database
				.prepare(
					`UPDATE ${quoteIdentifier(request.target.table)} SET ${quoteIdentifier(request.target.lineage.deleted)} = 1, ${quoteIdentifier(request.target.lineage.deletedAtCommit)} = ? WHERE ${quoteIdentifier(request.target.lineage.sourceId)} = ? AND ${quoteIdentifier(request.target.lineage.artifactId)} = ?`,
				)
				.run(request.deletedAtCommit, request.sourceId, request.artifactId),
		);
	}
	async insertEvent(record: EventRecord): Promise<EventInsertResult> {
		try {
			const existing = this.database
				.prepare(
					"SELECT source_id, sequence, artifact_id, reconciliation_generation, attempt_id, reconciled_commit, event_type, prior_revision_id, current_revision_id, prior_path, current_path FROM gitplane_events WHERE event_id = ?",
				)
				.get(record.eventId) as ({ sequence: number } & Record<string, unknown>) | undefined;
			if (existing !== undefined)
				return eventMatches(existing, record)
					? { type: "existing", sequence: existing.sequence }
					: { type: "conflict", message: "Event ID already has different content." };
			let sequence = 0;
			transaction(this.database, () => {
				const row = this.database
					.prepare(
						"SELECT COALESCE(MAX(sequence), 0) AS value FROM gitplane_events WHERE source_id = ?",
					)
					.get(record.sourceId) as { value: number };
				sequence = row.value + 1;
				this.database
					.prepare(
						"INSERT INTO gitplane_events (event_id, source_id, sequence, artifact_id, reconciliation_generation, attempt_id, reconciled_commit, event_type, prior_revision_id, current_revision_id, prior_path, current_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
					)
					.run(
						record.eventId,
						record.sourceId,
						sequence,
						record.artifactId,
						record.reconciliationGeneration,
						record.attemptId,
						record.reconciledCommit,
						record.eventType,
						record.priorRevisionId,
						record.currentRevisionId,
						record.priorPath,
						record.currentPath,
					);
			});
			return { type: "inserted", sequence };
		} catch (error) {
			return { type: "error", error: databaseError(error) };
		}
	}
	async recordReconciliationError(record: ReconciliationErrorRecord): Promise<OperationResult> {
		const observed = record.observedAt.toISOString();
		return this.operation(() =>
			this.database
				.prepare(
					"INSERT INTO gitplane_reconciliation_errors (source_id, target_commit, subject, operation, category, diagnostic, first_observed_at, last_observed_at, attempt_count, resolved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0) ON CONFLICT(source_id,target_commit,subject,operation) DO UPDATE SET category=excluded.category, diagnostic=excluded.diagnostic, last_observed_at=excluded.last_observed_at, attempt_count=attempt_count+1, resolved=0",
				)
				.run(
					record.sourceId,
					record.targetCommit,
					record.subject,
					record.operation,
					record.category,
					record.diagnostic,
					observed,
					observed,
				),
		);
	}
	async resolveReconciliationErrors(request: {
		readonly sourceId: string;
		readonly targetCommit: string;
		readonly resolvedAt: Date;
	}): Promise<OperationResult> {
		return this.operation(() =>
			this.database
				.prepare(
					"UPDATE gitplane_reconciliation_errors SET resolved = 1, last_observed_at = ? WHERE source_id = ? AND target_commit = ?",
				)
				.run(request.resolvedAt.toISOString(), request.sourceId, request.targetCommit),
		);
	}
	async inspectDoctor(request: {
		readonly targets: readonly TargetMapping[];
	}): Promise<GatewayResult<DoctorIntrospection>> {
		try {
			const control = inspectControlSchema(this.database);
			return {
				ok: true,
				value: {
					controlSchema:
						control.state === "compatible"
							? control
							: {
									state: control.state,
									detail:
										control.state === "incompatible"
											? control.detail
											: `Missing control tables: ${control.missingTables.join(", ")}.`,
								},
					targetTables: request.targets
						.filter(
							(target, index, targets) =>
								targets.findIndex((item) => item.table === target.table) === index,
						)
						.filter((target) => this.tableExists(target.table))
						.map((target) => inspectTable(this.database, target.table)),
					jsonProjection: {
						requirement: "required",
						status: "pass",
						detail: "SQLite JSON projection serialization is supported.",
					},
				},
			};
		} catch (error) {
			return { ok: false, error: databaseError(error) };
		}
	}
	async close(): Promise<OperationResult> {
		if (this.closed) return { ok: true };
		try {
			this.database.close();
			this.closed = true;
			return { ok: true };
		} catch (error) {
			return { ok: false, error: databaseError(error) };
		}
	}
	private tableExists(table: string): boolean {
		return (
			this.database
				.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
				.get(table) !== undefined
		);
	}
	private async lookup<T>(operation: () => T | undefined): Promise<LookupResult<T>> {
		try {
			const value = operation();
			return value === undefined ? { type: "missing" } : { type: "found", value };
		} catch (error) {
			return { type: "error", error: databaseError(error) };
		}
	}
	private async operation(operation: () => unknown): Promise<OperationResult> {
		try {
			operation();
			return { ok: true };
		} catch (error) {
			return { ok: false, error: databaseError(error) };
		}
	}
}

function parseAttempt(
	sourceId: string,
	row: { readonly attempt_id: string; readonly frozen_plan: string },
): ReconciliationAttemptRecord {
	const parsed = frozenReconciliationPlanSchema.safeParse(JSON.parse(row.frozen_plan));
	if (
		!parsed.success ||
		parsed.data.sourceId !== sourceId ||
		parsed.data.attemptId !== row.attempt_id
	)
		throw new Error("Persisted frozen reconciliation plan is invalid.");
	return { sourceId, attemptId: row.attempt_id, plan: parsed.data };
}

function currentFromRow(
	sourceId: string,
	artifactId: ArtifactId,
	row: {
		revision_id: string;
		artifact_path: string;
		classification: string;
		observed_commit: string;
		tombstoned: number;
	},
): ArtifactCurrentRecord {
	return {
		sourceId,
		artifactId,
		revisionId: row.revision_id,
		path: row.artifact_path,
		classification: parseClassification(row.classification),
		observedCommit: row.observed_commit,
		tombstoned: row.tombstoned !== 0,
	};
}
function parseJson(
	value: string | null,
): Extract<ArtifactClassification, { readonly state: "classified" }> | null {
	if (value === null) return null;
	const parsed = artifactClassificationSchema.safeParse(JSON.parse(value));
	if (!parsed.success || parsed.data.state !== "classified")
		throw new Error("Persisted lineage classification is invalid.");
	return parsed.data;
}
function parseClassification(value: string): ArtifactClassification {
	const parsed = artifactClassificationSchema.safeParse(JSON.parse(value));
	if (!parsed.success) throw new Error("Persisted artifact classification is invalid.");
	return parsed.data;
}
function stringifyNullable(value: unknown): string | null {
	return value === null ? null : deterministicJson(value);
}
function deterministicJson(value: unknown): string {
	return JSON.stringify(value, (_key, item: unknown) =>
		typeof item === "object" && item !== null && !Array.isArray(item)
			? Object.fromEntries(
					Object.entries(item).sort(([left], [right]) => left.localeCompare(right)),
				)
			: item,
	);
}
function bindProjection(mode: "scalar" | "json", value: unknown): unknown {
	return mode === "json" && value !== null ? deterministicJson(value) : value;
}
function sqliteValue(value: unknown): string | number | bigint | Uint8Array | null {
	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "bigint" ||
		value instanceof Uint8Array
	)
		return value;
	if (typeof value === "boolean") return value ? 1 : 0;
	throw new Error("Ordinary projection values must be SQLite scalar values.");
}
function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}
function eventMatches(row: Record<string, unknown>, event: EventRecord): boolean {
	return (
		row.source_id === event.sourceId &&
		row.artifact_id === event.artifactId &&
		row.reconciliation_generation === event.reconciliationGeneration &&
		row.attempt_id === event.attemptId &&
		row.reconciled_commit === event.reconciledCommit &&
		row.event_type === event.eventType &&
		row.prior_revision_id === event.priorRevisionId &&
		row.current_revision_id === event.currentRevisionId &&
		row.prior_path === event.priorPath &&
		row.current_path === event.currentPath
	);
}
function inspectTable(
	database: DatabaseSync,
	table: string,
): DoctorIntrospection["targetTables"][number] {
	const columns = database.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as {
		name: string;
		pk: number;
	}[];
	const uniqueColumnSets: string[][] = [];
	const primary = columns
		.filter((column) => column.pk > 0)
		.sort((left, right) => left.pk - right.pk)
		.map((column) => column.name);
	if (primary.length > 0) uniqueColumnSets.push(primary);
	const indexes = database.prepare(`PRAGMA index_list(${quoteIdentifier(table)})`).all() as {
		name: string;
		partial: number;
		unique: number;
	}[];
	for (const index of indexes.filter((item) => item.unique !== 0 && item.partial === 0))
		uniqueColumnSets.push(
			(
				database.prepare(`PRAGMA index_info(${quoteIdentifier(index.name)})`).all() as {
					name: string;
					seqno: number;
				}[]
			)
				.sort((left, right) => left.seqno - right.seqno)
				.map((item) => item.name),
		);
	return { name: table, columns: columns.map((column) => column.name), uniqueColumnSets };
}
