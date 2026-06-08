import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const GRAPHITE_METADATA_DB_NAME = ".graphite_metadata.db";

export type GraphiteMetadataUnavailableReason =
	| "missing-db"
	| "sqlite-unavailable"
	| "read-failed"
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

interface BunSqliteStatement<ReturnType, ParamsType extends readonly unknown[]> {
	get(...params: ParamsType): ReturnType | null | undefined;
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
			isCurrentTrunk: metadataText(row.validation_result) === "TRUNK",
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

function parseGraphiteChildren(value: unknown): readonly string[] {
	if (value == null || value === "") return [];
	if (typeof value !== "string") return [];

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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
