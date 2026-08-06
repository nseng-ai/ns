import type { DatabaseSync } from "node:sqlite";

export const SQLITE_SCHEMA_VERSION = 1;

interface ControlColumnDescriptor {
	readonly name: string;
	readonly type: "INTEGER" | "BLOB" | "TEXT";
	readonly nullable: boolean;
	readonly primaryKeyPosition: number;
}
interface ControlTableDescriptor {
	readonly name: string;
	readonly columns: readonly ControlColumnDescriptor[];
	readonly uniqueColumnSets: readonly (readonly string[])[];
	readonly statements: readonly string[];
}

export const CONTROL_SCHEMA = {
	metadata: {
		name: "gitplane_schema",
		columns: [column("schema_version", "INTEGER", false)],
		uniqueColumnSets: [],
		statements: [
			`CREATE TABLE gitplane_schema (schema_version INTEGER NOT NULL) STRICT`,
			`INSERT INTO gitplane_schema (schema_version) VALUES (1)`,
		],
	},
	// One of the engine's two reentry dispatch facts: a `gitplane_cursors` row equal to the
	// pending plan's Resulting Cursor (commit_id = targetCommit, generation =
	// expectedGeneration + 1; no row = generation 0) means materialization completed and only
	// cleanup remains. Any other cursor with a pending plan means Apply must resume.
	cursors: {
		name: "gitplane_cursors",
		columns: [
			column("source_id", "TEXT", false, 1),
			column("commit_id", "TEXT", false),
			column("generation", "INTEGER", false),
		],
		uniqueColumnSets: [["source_id"]],
		statements: [
			`CREATE TABLE gitplane_cursors (source_id TEXT PRIMARY KEY, commit_id TEXT NOT NULL, generation INTEGER NOT NULL CHECK (generation > 0)) STRICT`,
		],
	},
	// The other reentry dispatch fact: a `gitplane_reconciliation_plans` row is the Pending
	// Plan — retry authority for incomplete work. `source_id` as PRIMARY KEY mechanically
	// enforces one Pending Plan per source; no row means the cursor is a completed baseline
	// for new planning.
	plans: {
		name: "gitplane_reconciliation_plans",
		columns: [
			column("source_id", "TEXT", false, 1),
			column("attempt_id", "TEXT", false),
			column("reconciliation_plan", "TEXT", false),
		],
		uniqueColumnSets: [["attempt_id"], ["source_id"]],
		statements: [
			`CREATE TABLE gitplane_reconciliation_plans (source_id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL UNIQUE, reconciliation_plan TEXT NOT NULL) STRICT`,
		],
	},
	lineage: {
		name: "gitplane_lineage",
		columns: [
			column("source_id", "TEXT", false, 1),
			column("artifact_id", "TEXT", false, 2),
			column("established_classification", "TEXT", true),
			column("last_schema_version", "INTEGER", true),
		],
		uniqueColumnSets: [["source_id", "artifact_id"]],
		statements: [
			`CREATE TABLE gitplane_lineage (source_id TEXT NOT NULL, artifact_id TEXT NOT NULL, established_classification TEXT, last_schema_version INTEGER, PRIMARY KEY (source_id, artifact_id)) STRICT`,
		],
	},
	current: {
		name: "gitplane_current_artifacts",
		columns: [
			column("source_id", "TEXT", false, 1),
			column("artifact_id", "TEXT", false, 2),
			column("revision_id", "TEXT", false),
			column("artifact_path", "TEXT", false),
			column("classification", "TEXT", false),
			column("tombstoned", "INTEGER", false),
		],
		uniqueColumnSets: [["source_id", "artifact_id"]],
		statements: [
			`CREATE TABLE gitplane_current_artifacts (source_id TEXT NOT NULL, artifact_id TEXT NOT NULL, revision_id TEXT NOT NULL, artifact_path TEXT NOT NULL, classification TEXT NOT NULL, tombstoned INTEGER NOT NULL, PRIMARY KEY (source_id, artifact_id)) STRICT`,
		],
	},
	revisions: {
		name: "gitplane_revisions",
		columns: [
			column("revision_id", "TEXT", false, 1),
			column("source_id", "TEXT", false),
			column("artifact_id", "TEXT", false),
			column("digest", "TEXT", false),
			column("digest_bytes", "BLOB", false),
			column("manifest", "TEXT", false),
			column("envelope", "TEXT", false),
			column("first_observed_commit", "TEXT", false),
			column("first_observed_path", "TEXT", false),
		],
		uniqueColumnSets: [["revision_id"]],
		statements: [
			`CREATE TABLE gitplane_revisions (revision_id TEXT PRIMARY KEY, source_id TEXT NOT NULL, artifact_id TEXT NOT NULL, digest TEXT NOT NULL, digest_bytes BLOB NOT NULL, manifest TEXT NOT NULL, envelope TEXT NOT NULL, first_observed_commit TEXT NOT NULL, first_observed_path TEXT NOT NULL) STRICT`,
		],
	},
	events: {
		name: "gitplane_events",
		columns: [
			column("event_id", "TEXT", false, 1),
			column("source_id", "TEXT", false),
			column("sequence", "INTEGER", false),
			column("artifact_id", "TEXT", false),
			column("reconciliation_generation", "INTEGER", false),
			column("attempt_id", "TEXT", false),
			column("reconciled_commit", "TEXT", false),
			column("event_type", "TEXT", false),
			column("prior_revision_id", "TEXT", true),
			column("current_revision_id", "TEXT", true),
			column("prior_path", "TEXT", true),
			column("current_path", "TEXT", true),
		],
		uniqueColumnSets: [["event_id"], ["source_id", "sequence"]],
		statements: [
			`CREATE TABLE gitplane_events (event_id TEXT PRIMARY KEY, source_id TEXT NOT NULL, sequence INTEGER NOT NULL, artifact_id TEXT NOT NULL, reconciliation_generation INTEGER NOT NULL CHECK (reconciliation_generation > 0), attempt_id TEXT NOT NULL, reconciled_commit TEXT NOT NULL, event_type TEXT NOT NULL, prior_revision_id TEXT, current_revision_id TEXT, prior_path TEXT, current_path TEXT, UNIQUE (source_id, sequence)) STRICT`,
		],
	},
	errors: {
		name: "gitplane_reconciliation_errors",
		columns: [
			column("source_id", "TEXT", false, 1),
			column("target_commit", "TEXT", false, 2),
			column("subject", "TEXT", false, 3),
			column("operation", "TEXT", false, 4),
			column("category", "TEXT", false),
			column("diagnostic", "TEXT", false),
			column("first_observed_at", "TEXT", false),
			column("last_observed_at", "TEXT", false),
			column("attempt_count", "INTEGER", false),
			column("resolved", "INTEGER", false),
		],
		uniqueColumnSets: [["source_id", "target_commit", "subject", "operation"]],
		statements: [
			`CREATE TABLE gitplane_reconciliation_errors (source_id TEXT NOT NULL, target_commit TEXT NOT NULL, subject TEXT NOT NULL, operation TEXT NOT NULL, category TEXT NOT NULL, diagnostic TEXT NOT NULL, first_observed_at TEXT NOT NULL, last_observed_at TEXT NOT NULL, attempt_count INTEGER NOT NULL, resolved INTEGER NOT NULL, PRIMARY KEY (source_id, target_commit, subject, operation)) STRICT`,
		],
	},
} as const satisfies Record<string, ControlTableDescriptor>;

export const CONTROL_TABLES = Object.fromEntries(
	Object.entries(CONTROL_SCHEMA).map(([key, descriptor]) => [key, descriptor.name]),
) as { readonly [Key in keyof typeof CONTROL_SCHEMA]: (typeof CONTROL_SCHEMA)[Key]["name"] };

export type ControlSchemaInspection =
	| { readonly state: "compatible"; readonly version: typeof SQLITE_SCHEMA_VERSION }
	| { readonly state: "missing"; readonly missingTables: readonly string[] }
	| { readonly state: "incompatible"; readonly detail: string };

export function inspectControlSchema(database: DatabaseSync): ControlSchemaInspection {
	const ownedObjects = database
		.prepare(
			"SELECT name, type FROM sqlite_master WHERE name LIKE 'gitplane_%' AND name NOT LIKE 'sqlite_%' ORDER BY name, type",
		)
		.all() as { name: string; type: string }[];
	const expectedNames = new Set<string>(Object.values(CONTROL_SCHEMA).map((table) => table.name));
	const unexpectedObjects = ownedObjects.filter(
		(object) => object.type !== "table" || !expectedNames.has(object.name),
	);
	if (unexpectedObjects.length > 0)
		return {
			state: "incompatible",
			detail: `Unexpected Gitplane-owned objects: ${unexpectedObjects.map((object) => `${object.type} ${object.name}`).join(", ")}.`,
		};

	for (const descriptor of Object.values(CONTROL_SCHEMA)) {
		if (!ownedObjects.some((object) => object.type === "table" && object.name === descriptor.name))
			continue;
		const table = database
			.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
			.get(descriptor.name) as { sql: string | null } | undefined;
		if (table?.sql === null || !/\bSTRICT\s*$/iu.test(table?.sql ?? ""))
			return incompatibleTable(descriptor.name, "table is not STRICT");
		const actual = database.prepare(`PRAGMA table_info("${descriptor.name}")`).all() as {
			name: string;
			type: string;
			notnull: number;
			dflt_value: unknown;
			pk: number;
		}[];
		if (actual.length !== descriptor.columns.length)
			return incompatibleTable(descriptor.name, "column count differs from v1");
		for (const [index, expected] of descriptor.columns.entries()) {
			const found = actual[index];
			if (
				found === undefined ||
				found.name !== expected.name ||
				found.type.toUpperCase() !== expected.type ||
				(found.notnull === 0) !== expected.nullable ||
				found.pk !== expected.primaryKeyPosition ||
				found.dflt_value !== null
			)
				return incompatibleTable(descriptor.name, `column ${expected.name} differs from v1`);
		}
		const actualUniqueSets = inspectUniqueColumnSets(database, descriptor.name, actual);
		if (JSON.stringify(actualUniqueSets) !== JSON.stringify(descriptor.uniqueColumnSets))
			return incompatibleTable(descriptor.name, "unique keys differ from v1");
	}

	const metadataExists = ownedObjects.some(
		(object) => object.type === "table" && object.name === CONTROL_SCHEMA.metadata.name,
	);
	if (metadataExists) {
		const versions = database.prepare("SELECT schema_version FROM gitplane_schema").all() as {
			schema_version: unknown;
		}[];
		if (versions.length !== 1 || versions[0]?.schema_version !== SQLITE_SCHEMA_VERSION)
			return {
				state: "incompatible",
				detail: "Gitplane control schema marker is not exactly version 1.",
			};
	}
	const missingTables = Object.values(CONTROL_SCHEMA)
		.filter((descriptor) => !ownedObjects.some((object) => object.name === descriptor.name))
		.map((descriptor) => descriptor.name);
	if (missingTables.length > 0) return { state: "missing", missingTables };
	return { state: "compatible", version: SQLITE_SCHEMA_VERSION };
}

function column(
	name: string,
	type: ControlColumnDescriptor["type"],
	nullable: boolean,
	primaryKeyPosition = 0,
): ControlColumnDescriptor {
	return { name, type, nullable, primaryKeyPosition };
}

function inspectUniqueColumnSets(
	database: DatabaseSync,
	table: string,
	columns: readonly { readonly name: string; readonly pk: number }[],
): readonly (readonly string[])[] {
	const sets: string[][] = [];
	const primary = columns
		.filter((column) => column.pk > 0)
		.sort((left, right) => left.pk - right.pk)
		.map((column) => column.name);
	if (primary.length > 0) sets.push(primary);
	const indexes = database.prepare(`PRAGMA index_list("${table}")`).all() as {
		name: string;
		origin: string;
		partial: number;
		unique: number;
	}[];
	for (const index of indexes.filter(
		(item) => item.unique !== 0 && item.origin !== "pk" && item.partial === 0,
	)) {
		const names = (
			database.prepare(`PRAGMA index_info("${index.name.replaceAll('"', '""')}")`).all() as {
				name: string;
				seqno: number;
			}[]
		)
			.sort((left, right) => left.seqno - right.seqno)
			.map((item) => item.name);
		if (!sets.some((set) => JSON.stringify(set) === JSON.stringify(names))) sets.push(names);
	}
	return sets.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function incompatibleTable(name: string, reason: string): ControlSchemaInspection {
	return {
		state: "incompatible",
		detail: `Gitplane control table ${name} is incompatible: ${reason}.`,
	};
}
