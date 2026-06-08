import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { isRecord } from "../cmux/primitives.ts";

const GRAPHITE_METADATA_DB_NAME = ".graphite_metadata.db";
const BRANCH_METADATA_REQUIRED_COLUMNS = ["branch_name", "parent_branch_name", "children", "validation_result"] as const;

export type GraphiteMetadataUnavailableReason =
	| "missing-db"
	| "sqlite-unavailable"
	| "read-failed"
	| "schema-mismatch"
	| "not-a-git-repo"
	| "no-current-branch";

export interface GraphiteMetadataLookupInput {
	commonGitDir: string;
	currentBranch: string;
}

export type GraphiteMetadataStatus =
	| {
			type: "tracked";
			currentBranch: string;
			parent: string | undefined;
			children: readonly string[];
			isCurrentTrunk: boolean;
		}
	| { type: "untracked"; currentBranch: string }
	| { type: "unavailable"; reason: GraphiteMetadataUnavailableReason; currentBranch?: string };

interface GraphiteMetadataSqlRow {
	parent_branch_name: unknown;
	children: unknown;
	validation_result: unknown;
}

interface GraphiteMetadataColumnRow {
	name: unknown;
}

interface BunSqliteStatement<ReturnType, ParamsType extends readonly unknown[]> {
	get(...params: ParamsType): ReturnType | null | undefined;
	all(...params: ParamsType): ReturnType[];
}

interface BunSqliteDatabase {
	query<ReturnType, ParamsType extends readonly unknown[]>(sql: string): BunSqliteStatement<ReturnType, ParamsType>;
	close(): void;
}

type BunSqliteDatabaseConstructor = new (filename: string, options: { readonly: true }) => BunSqliteDatabase;

const requireRuntimeModule = createRequire(import.meta.url);

export function loadGraphiteMetadataStatus(input: GraphiteMetadataLookupInput): GraphiteMetadataStatus {
	const dbPath = join(input.commonGitDir, GRAPHITE_METADATA_DB_NAME);
	if (!existsSync(dbPath)) return { type: "unavailable", reason: "missing-db", currentBranch: input.currentBranch };

	const Database = loadBunSqliteDatabaseConstructor();
	if (Database === undefined) {
		return { type: "unavailable", reason: "sqlite-unavailable", currentBranch: input.currentBranch };
	}

	let db: BunSqliteDatabase | undefined;
	try {
		db = new Database(dbPath, { readonly: true });
		if (!hasExpectedBranchMetadataSchema(db)) {
			return { type: "unavailable", reason: "schema-mismatch", currentBranch: input.currentBranch };
		}

		const row = db
			.query<GraphiteMetadataSqlRow, [string]>(
				"SELECT parent_branch_name, children, validation_result FROM branch_metadata WHERE branch_name = ? LIMIT 1",
			)
			.get(input.currentBranch);
		if (row == null) return { type: "untracked", currentBranch: input.currentBranch };

		return {
			type: "tracked",
			currentBranch: input.currentBranch,
			parent: metadataText(row.parent_branch_name),
			children: parseGraphiteChildren(row.children),
			isCurrentTrunk: isGraphiteTrunkValidationResult(row.validation_result),
		};
	} catch {
		return { type: "unavailable", reason: "read-failed", currentBranch: input.currentBranch };
	} finally {
		if (db !== undefined) {
			try {
				db.close();
			} catch {
				// Closing a read-only status probe must not throw through passive UI refresh.
			}
		}
	}
}

function loadBunSqliteDatabaseConstructor(): BunSqliteDatabaseConstructor | undefined {
	try {
		const sqliteModule = requireRuntimeModule("bun:sqlite") as unknown;
		if (!isRecord(sqliteModule) || typeof sqliteModule.Database !== "function") return undefined;
		return sqliteModule.Database as BunSqliteDatabaseConstructor;
	} catch {
		return undefined;
	}
}

function hasExpectedBranchMetadataSchema(db: BunSqliteDatabase): boolean {
	const rows = db.query<GraphiteMetadataColumnRow, []>("PRAGMA table_info(branch_metadata)").all();
	const columnNames = new Set<string>();
	for (const row of rows) {
		const name = metadataText(row.name);
		if (name !== undefined) columnNames.add(name);
	}
	return BRANCH_METADATA_REQUIRED_COLUMNS.every((columnName) => columnNames.has(columnName));
}

function parseGraphiteChildren(value: unknown): readonly string[] {
	if (typeof value !== "string" || value === "") return [];

	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		return [];
	}

	if (!Array.isArray(parsed)) return [];
	return parsed.filter((item): item is string => typeof item === "string");
}

function metadataText(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const text = value.trim();
	return text.length > 0 ? text : undefined;
}

function isGraphiteTrunkValidationResult(value: unknown): boolean {
	// Graphite's private metadata DB currently marks the configured trunk with this validation result.
	// Keep the sentinel isolated so future schema drift is visible through the schema-mismatch path above.
	return metadataText(value)?.toUpperCase() === "TRUNK";
}
