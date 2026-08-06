import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

export function resolveDatabasePath(value: string, baseDirectory: string): string {
	return path.resolve(baseDirectory, value);
}
export function quoteIdentifier(value: string): string {
	return `"${value.replaceAll('"', '""')}"`;
}
export function databaseError(error: unknown): { readonly code: string; readonly message: string } {
	return {
		code: "sqlite-operation-failed",
		message: error instanceof Error ? error.message : "SQLite operation failed.",
	};
}
export function readTransaction(database: DatabaseSync, operation: () => void): void {
	database.exec("BEGIN");
	try {
		operation();
		database.exec("COMMIT");
	} catch (error) {
		database.exec("ROLLBACK");
		throw error;
	}
}
export function transaction(database: DatabaseSync, operation: () => void): void {
	database.exec("BEGIN IMMEDIATE");
	try {
		operation();
		database.exec("COMMIT");
	} catch (error) {
		database.exec("ROLLBACK");
		throw error;
	}
}
