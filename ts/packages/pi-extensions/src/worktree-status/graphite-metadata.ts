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
	| "read-timeout"
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

export interface GraphiteMetadataWorkerRequest {
	type: "load_graphite_metadata";
	requestId: number;
	input: GraphiteMetadataLookupInput;
}

export type GraphiteMetadataWorkerResponse =
	| { type: "success"; requestId: number; status: GraphiteMetadataStatus }
	| { type: "failure"; requestId: number; message: string };

export interface GraphiteMetadataWorkerHandle {
	onmessage: ((event: { data: unknown }) => void) | null;
	onerror: ((event: { message?: string; error?: unknown }) => void) | null;
	postMessage(message: GraphiteMetadataWorkerRequest): void;
	terminate(): unknown;
}

export type GraphiteMetadataWorkerFactory = () => GraphiteMetadataWorkerHandle;

export interface LoadGraphiteMetadataStatusInWorkerOptions {
	signal?: AbortSignal;
	timeoutMs?: number;
	workerFactory?: GraphiteMetadataWorkerFactory;
}

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

type GraphiteMetadataWorkerConstructor = new (specifier: URL, options: { type: "module" }) => GraphiteMetadataWorkerHandle;

declare const Worker: GraphiteMetadataWorkerConstructor;

const GRAPHITE_METADATA_LOOKUP_TIMEOUT_MS = 1_000;

const requireRuntimeModule = createRequire(import.meta.url);
let nextGraphiteMetadataWorkerRequestId = 0;

export async function loadGraphiteMetadataStatusInWorker(
	input: GraphiteMetadataLookupInput,
	options: LoadGraphiteMetadataStatusInWorkerOptions = {},
): Promise<GraphiteMetadataStatus> {
	if (options.signal?.aborted) return unavailableFromWorker(input, "read-timeout");

	let worker: GraphiteMetadataWorkerHandle;
	try {
		worker = (options.workerFactory ?? createGraphiteMetadataWorker)();
	} catch {
		return unavailableFromWorker(input, "read-failed");
	}

	const requestId = ++nextGraphiteMetadataWorkerRequestId;
	const timeoutMs = options.timeoutMs ?? GRAPHITE_METADATA_LOOKUP_TIMEOUT_MS;
	return new Promise((resolve) => {
		let finished = false;
		let timeout: ReturnType<typeof setTimeout> | undefined;
		let abortListener: (() => void) | undefined;

		function finish(status: GraphiteMetadataStatus): void {
			if (finished) return;
			finished = true;
			if (timeout !== undefined) clearTimeout(timeout);
			if (abortListener !== undefined) options.signal?.removeEventListener("abort", abortListener);
			worker.onmessage = null;
			worker.onerror = null;
			try {
				worker.terminate();
			} catch {
				// Termination is best-effort cleanup after a degraded passive status lookup.
			}
			resolve(status);
		}

		worker.onmessage = (event) => {
			const response = graphiteMetadataWorkerResponseFromValue(event.data);
			if (response === undefined || response.requestId !== requestId || response.type === "failure") {
				finish(unavailableFromWorker(input, "read-failed"));
				return;
			}

			finish(response.status);
		};
		worker.onerror = () => finish(unavailableFromWorker(input, "read-failed"));

		abortListener = () => finish(unavailableFromWorker(input, "read-timeout"));
		options.signal?.addEventListener("abort", abortListener, { once: true });
		if (options.signal?.aborted) {
			finish(unavailableFromWorker(input, "read-timeout"));
			return;
		}
		timeout = setTimeout(() => finish(unavailableFromWorker(input, "read-timeout")), timeoutMs);

		try {
			worker.postMessage({ type: "load_graphite_metadata", requestId, input });
		} catch {
			finish(unavailableFromWorker(input, "read-failed"));
		}
	});
}

export function graphiteMetadataWorkerRequestFromValue(value: unknown): GraphiteMetadataWorkerRequest | undefined {
	if (!isRecord(value)) return undefined;
	if (value.type !== "load_graphite_metadata") return undefined;
	if (typeof value.requestId !== "number" || !Number.isInteger(value.requestId)) return undefined;
	if (!isGraphiteMetadataLookupInput(value.input)) return undefined;
	return { type: "load_graphite_metadata", requestId: value.requestId, input: value.input };
}

export function graphiteMetadataWorkerResponseFromValue(value: unknown): GraphiteMetadataWorkerResponse | undefined {
	if (!isRecord(value)) return undefined;
	if (typeof value.requestId !== "number" || !Number.isInteger(value.requestId)) return undefined;
	if (value.type === "failure") {
		return typeof value.message === "string" ? { type: "failure", requestId: value.requestId, message: value.message } : undefined;
	}
	if (value.type !== "success" || !isGraphiteMetadataStatus(value.status)) return undefined;
	return { type: "success", requestId: value.requestId, status: value.status };
}

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

function createGraphiteMetadataWorker(): GraphiteMetadataWorkerHandle {
	return new Worker(new URL("./graphite-metadata-worker.ts", import.meta.url), { type: "module" });
}

function unavailableFromWorker(
	input: GraphiteMetadataLookupInput,
	reason: Extract<GraphiteMetadataUnavailableReason, "read-failed" | "read-timeout">,
): GraphiteMetadataStatus {
	return { type: "unavailable", reason, currentBranch: input.currentBranch };
}

function isGraphiteMetadataLookupInput(value: unknown): value is GraphiteMetadataLookupInput {
	return isRecord(value) && typeof value.commonGitDir === "string" && typeof value.currentBranch === "string";
}

function isGraphiteMetadataStatus(value: unknown): value is GraphiteMetadataStatus {
	if (!isRecord(value) || typeof value.type !== "string") return false;
	if (value.type === "tracked") {
		return (
			typeof value.currentBranch === "string" &&
			(value.parent === undefined || typeof value.parent === "string") &&
			Array.isArray(value.children) &&
			value.children.every((child) => typeof child === "string") &&
			typeof value.isCurrentTrunk === "boolean"
		);
	}
	if (value.type === "untracked") return typeof value.currentBranch === "string";
	if (value.type !== "unavailable" || !isGraphiteMetadataUnavailableReason(value.reason)) return false;
	return value.currentBranch === undefined || typeof value.currentBranch === "string";
}

function isGraphiteMetadataUnavailableReason(value: unknown): value is GraphiteMetadataUnavailableReason {
	return (
		value === "missing-db" ||
		value === "sqlite-unavailable" ||
		value === "read-failed" ||
		value === "read-timeout" ||
		value === "schema-mismatch" ||
		value === "not-a-git-repo" ||
		value === "no-current-branch"
	);
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
