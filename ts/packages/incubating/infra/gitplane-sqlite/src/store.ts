import { DatabaseSync } from "node:sqlite";
import { artifactClassificationSchema } from "@nseng-ai/gitplane";
import type {
	ArtifactClassification,
	ArtifactCurrentRecord,
	ArtifactId,
	ArtifactLineageRecord,
	ArtifactTransitionKind,
	BaselineDeleteResult,
	CursorCompareAndSetResult,
	CursorRecord,
	DoctorIntrospection,
	EventInsertResult,
	EventRecord,
	GatewayResult,
	InsertResult,
	LookupResult,
	MaterializationStoreGateway,
	OperationResult,
	ReconciliationErrorRecord,
	ReconciliationMode,
	ReconciliationPlanBaseline,
	RevisionRecord,
	StoreAccess,
	TargetMapping,
	TargetRowRecord,
} from "@nseng-ai/gitplane";
import { databaseError, quoteIdentifier, resolveDatabasePath, transaction } from "./database.ts";
import { inspectControlSchema } from "./schema.ts";

export interface CreateSqliteStoreOptions {
	readonly path: string;
	readonly baseDirectory: string;
	readonly access: StoreAccess;
	readonly clock: { now(): Date };
}

export function createSqliteStore(options: CreateSqliteStoreOptions): MaterializationStoreGateway {
	const database = new DatabaseSync(resolveDatabasePath(options.path, options.baseDirectory), {
		readOnly: options.access === "read-only",
	});
	return new SqliteMaterializationStore(database);
}

class SqliteMaterializationStore implements MaterializationStoreGateway {
	private readonly database: DatabaseSync;
	private closed = false;
	constructor(database: DatabaseSync) {
		this.database = database;
	}
	async readReconciliationPlanBaseline(request: {
		readonly sourceId: string;
	}): Promise<LookupResult<ReconciliationPlanBaseline>> {
		return this.lookup(() => {
			const header = this.database
				.prepare(
					"SELECT expected_cursor, target_commit, mode, event_reconstruction, plan_digest FROM gitplane_reconciliation_plans WHERE source_id = ?",
				)
				.get(request.sourceId) as
				| {
						expected_cursor: string | null;
						target_commit: string;
						mode: ReconciliationMode;
						event_reconstruction: ReconciliationPlanBaseline["eventReconstruction"];
						plan_digest: string;
				  }
				| undefined;
			if (header === undefined) return undefined;
			const entries = this.database
				.prepare(
					"SELECT artifact_id, transition_kind, prior_revision_id, current_revision_id, prior_path, current_path, prior_classification, current_classification, prior_schema_version, current_schema_version, target_mapping FROM gitplane_reconciliation_plan_entries WHERE source_id = ? ORDER BY artifact_id",
				)
				.all(request.sourceId) as {
				artifact_id: ArtifactId;
				transition_kind: ArtifactTransitionKind;
				prior_revision_id: string | null;
				current_revision_id: string | null;
				prior_path: string | null;
				current_path: string | null;
				prior_classification: string | null;
				current_classification: string | null;
				prior_schema_version: number | null;
				current_schema_version: number | null;
				target_mapping: string | null;
			}[];
			return {
				sourceId: request.sourceId,
				expectedCursor: header.expected_cursor,
				targetCommit: header.target_commit,
				mode: header.mode,
				eventReconstruction: header.event_reconstruction,
				planDigest: header.plan_digest,
				entries: entries.map((entry) => ({
					artifactId: entry.artifact_id,
					transition: entry.transition_kind,
					priorRevisionId: entry.prior_revision_id,
					currentRevisionId: entry.current_revision_id,
					priorPath: entry.prior_path,
					currentPath: entry.current_path,
					priorClassification: parseOptionalClassification(entry.prior_classification),
					currentClassification: parseOptionalClassification(entry.current_classification),
					priorSchemaVersion: entry.prior_schema_version,
					currentSchemaVersion: entry.current_schema_version,
					target: parseOptionalTarget(entry.target_mapping),
				})),
			};
		});
	}
	async insertReconciliationPlanBaseline(
		baseline: ReconciliationPlanBaseline,
	): Promise<InsertResult> {
		try {
			const existing = await this.readReconciliationPlanBaseline({ sourceId: baseline.sourceId });
			if (existing.type === "error") return { type: "error", error: existing.error };
			if (existing.type === "found")
				return deterministicJson(existing.value) === deterministicJson(baseline)
					? { type: "existing" }
					: {
							type: "conflict",
							message: "Source already has a different reconciliation plan baseline.",
						};
			transaction(this.database, () => {
				this.database
					.prepare(
						"INSERT INTO gitplane_reconciliation_plans (source_id, expected_cursor, target_commit, mode, event_reconstruction, plan_digest) VALUES (?, ?, ?, ?, ?, ?)",
					)
					.run(
						baseline.sourceId,
						baseline.expectedCursor,
						baseline.targetCommit,
						baseline.mode,
						baseline.eventReconstruction,
						baseline.planDigest,
					);
				const statement = this.database.prepare(
					"INSERT INTO gitplane_reconciliation_plan_entries (source_id, artifact_id, transition_kind, prior_revision_id, current_revision_id, prior_path, current_path, prior_classification, current_classification, prior_schema_version, current_schema_version, target_mapping) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
				);
				for (const entry of baseline.entries)
					statement.run(
						baseline.sourceId,
						entry.artifactId,
						entry.transition,
						entry.priorRevisionId,
						entry.currentRevisionId,
						entry.priorPath,
						entry.currentPath,
						stringifyNullable(entry.priorClassification),
						stringifyNullable(entry.currentClassification),
						entry.priorSchemaVersion,
						entry.currentSchemaVersion,
						stringifyNullable(entry.target),
					);
			});
			return { type: "inserted" };
		} catch (error) {
			return { type: "error", error: databaseError(error) };
		}
	}
	async deleteReconciliationPlanBaseline(request: {
		readonly sourceId: string;
		readonly planDigest: string;
	}): Promise<BaselineDeleteResult> {
		try {
			let result: BaselineDeleteResult = { type: "missing" };
			transaction(this.database, () => {
				const row = this.database
					.prepare("SELECT plan_digest FROM gitplane_reconciliation_plans WHERE source_id = ?")
					.get(request.sourceId) as { plan_digest: string } | undefined;
				if (row === undefined) return;
				if (row.plan_digest !== request.planDigest) {
					result = { type: "mismatch", actualDigest: row.plan_digest };
					return;
				}
				this.database
					.prepare("DELETE FROM gitplane_reconciliation_plan_entries WHERE source_id = ?")
					.run(request.sourceId);
				this.database
					.prepare(
						"DELETE FROM gitplane_reconciliation_plans WHERE source_id = ? AND plan_digest = ?",
					)
					.run(request.sourceId, request.planDigest);
				result = { type: "deleted" };
			});
			return result;
		} catch (error) {
			return { type: "error", error: databaseError(error) };
		}
	}
	async readCursor(request: { readonly sourceId: string }): Promise<LookupResult<CursorRecord>> {
		return this.lookup(() => {
			const row = this.database
				.prepare("SELECT commit_id FROM gitplane_cursors WHERE source_id = ?")
				.get(request.sourceId) as { commit_id: string } | undefined;
			return row === undefined ? undefined : { sourceId: request.sourceId, commit: row.commit_id };
		});
	}
	async compareAndSetCursor(request: {
		readonly sourceId: string;
		readonly expectedCommit: string | null;
		readonly nextCommit: string;
	}): Promise<CursorCompareAndSetResult> {
		try {
			let result: CursorCompareAndSetResult = { type: "updated" };
			transaction(this.database, () => {
				const row = this.database
					.prepare("SELECT commit_id FROM gitplane_cursors WHERE source_id = ?")
					.get(request.sourceId) as { commit_id: string } | undefined;
				const actual = row?.commit_id ?? null;
				if (actual !== request.expectedCommit) {
					result = { type: "mismatch", actual };
					return;
				}
				this.database
					.prepare(
						"INSERT INTO gitplane_cursors (source_id, commit_id) VALUES (?, ?) ON CONFLICT(source_id) DO UPDATE SET commit_id = excluded.commit_id",
					)
					.run(request.sourceId, request.nextCommit);
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
					"SELECT source_id, sequence, artifact_id, reconciled_commit, event_type, prior_revision_id, current_revision_id, prior_path, current_path FROM gitplane_events WHERE event_id = ?",
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
						"INSERT INTO gitplane_events (event_id, source_id, sequence, artifact_id, reconciled_commit, event_type, prior_revision_id, current_revision_id, prior_path, current_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
					)
					.run(
						record.eventId,
						record.sourceId,
						sequence,
						record.artifactId,
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
	}) {
		try {
			const result = this.database
				.prepare(
					"UPDATE gitplane_reconciliation_errors SET resolved = 1, last_observed_at = ? WHERE source_id = ? AND target_commit = ? AND resolved = 0",
				)
				.run(request.resolvedAt.toISOString(), request.sourceId, request.targetCommit);
			return { ok: true as const, count: Number(result.changes) };
		} catch (error) {
			return { ok: false as const, error: databaseError(error) };
		}
	}
	async inspectDoctor(request: {
		readonly sourceId: string;
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
function parseOptionalClassification(value: string | null): ArtifactClassification | null {
	return value === null ? null : parseClassification(value);
}
function parseOptionalTarget(value: string | null): TargetMapping | null {
	if (value === null) return null;
	const parsed: unknown = JSON.parse(value);
	if (
		typeof parsed !== "object" ||
		parsed === null ||
		typeof (parsed as { table?: unknown }).table !== "string" ||
		typeof (parsed as { lineage?: unknown }).lineage !== "object" ||
		(parsed as { lineage: unknown }).lineage === null
	)
		throw new Error("Persisted target mapping is invalid.");
	const lineage = (parsed as { lineage: Record<string, unknown> }).lineage;
	for (const key of [
		"sourceId",
		"artifactId",
		"revisionId",
		"path",
		"deleted",
		"deletedAtCommit",
	] as const)
		if (typeof lineage[key] !== "string") throw new Error("Persisted target mapping is invalid.");
	return parsed as TargetMapping;
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
