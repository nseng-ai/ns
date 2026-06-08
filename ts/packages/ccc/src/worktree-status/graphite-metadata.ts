import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Worker as ThreadWorker } from "node:worker_threads";

import { isRecord } from "@asdl/pi-extension-runtime/cmux/primitives";

const GRAPHITE_METADATA_DB_NAME = ".graphite_metadata.db";
const BRANCH_METADATA_REQUIRED_COLUMNS = ["branch_name", "parent_branch_name", "children", "validation_result"] as const;
const GRAPHITE_METADATA_UNAVAILABLE_REASONS = [
	"missing-db",
	"sqlite-unavailable",
	"read-failed",
	"read-timeout",
	"schema-mismatch",
	"not-a-git-repo",
	"no-current-branch",
] as const;
export type GraphiteMetadataUnavailableReason = (typeof GRAPHITE_METADATA_UNAVAILABLE_REASONS)[number];

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
	input: GraphiteMetadataLookupInput;
}

export type GraphiteMetadataWorkerResponse = { type: "success"; status: GraphiteMetadataStatus } | { type: "failure"; message: string };

export interface GraphiteMetadataWorkerHandle {
	onmessage: ((event: { data: unknown }) => void) | null;
	onerror: ((event: { message?: string; error?: unknown }) => void) | null;
	postMessage(message: GraphiteMetadataWorkerRequest): void;
	terminate(): unknown;
}

export type GraphiteMetadataWorkerFactory = () => GraphiteMetadataWorkerHandle;

export type GraphiteMetadataWorkerDiagnostic =
	| { type: "worker-create-failed"; error: unknown }
	| { type: "worker-malformed-response"; data: unknown }
	| { type: "worker-failure-response"; message: string }
	| { type: "worker-error"; message?: string; error?: unknown }
	| { type: "worker-post-message-failed"; error: unknown }
	| { type: "worker-timeout"; timeoutMs: number };

export interface LoadGraphiteMetadataStatusInWorkerOptions {
	signal?: AbortSignal | undefined;
	timeoutMs?: number | undefined;
	workerFactory?: GraphiteMetadataWorkerFactory | undefined;
	onDiagnostic?: ((diagnostic: GraphiteMetadataWorkerDiagnostic) => void) | undefined;
}

interface GraphiteMetadataSqlRow {
	parent_branch_name: unknown;
	children: unknown;
	validation_result: unknown;
}

interface GraphiteMetadataColumnRow {
	name: unknown;
}

interface SqliteCliResult {
	type: "success";
	data: unknown;
}

interface SqliteCliFailure {
	type: "failure";
	reason: Extract<GraphiteMetadataUnavailableReason, "sqlite-unavailable" | "read-failed">;
}

const GRAPHITE_METADATA_LOOKUP_TIMEOUT_MS = 1_000;
const SQLITE_QUERY_TIMEOUT_MS = 1_000;

interface CachedGraphiteMetadataWorker {
	worker: GraphiteMetadataWorkerHandle;
	factory: GraphiteMetadataWorkerFactory;
	isBusy: boolean;
	shouldTerminateWhenIdle: boolean;
}

interface AcquiredGraphiteMetadataWorker {
	worker: GraphiteMetadataWorkerHandle;
	cached: CachedGraphiteMetadataWorker | undefined;
	shouldTerminateOnSuccess: boolean;
}

type GraphiteMetadataWorkerFinishMode = "reuse" | "terminate";

let cachedGraphiteMetadataWorker: CachedGraphiteMetadataWorker | undefined;

export async function loadGraphiteMetadataStatusInWorker(
	input: GraphiteMetadataLookupInput,
	options: LoadGraphiteMetadataStatusInWorkerOptions = {},
): Promise<GraphiteMetadataStatus> {
	if (options.signal?.aborted) return unavailableFromWorker(input, "read-timeout");

	let acquired: AcquiredGraphiteMetadataWorker;
	try {
		acquired = acquireGraphiteMetadataWorker(options.workerFactory ?? createGraphiteMetadataWorker);
	} catch (error) {
		emitWorkerDiagnostic(options, { type: "worker-create-failed", error });
		return unavailableFromWorker(input, "read-failed");
	}
	const worker = acquired.worker;

	const timeoutMs = options.timeoutMs ?? GRAPHITE_METADATA_LOOKUP_TIMEOUT_MS;
	return new Promise((resolve) => {
		let finished = false;
		let timeout: ReturnType<typeof setTimeout> | undefined;
		let abortListener: (() => void) | undefined;

		function finish(status: GraphiteMetadataStatus, mode: GraphiteMetadataWorkerFinishMode): void {
			if (finished) return;
			finished = true;
			if (timeout !== undefined) clearTimeout(timeout);
			if (abortListener !== undefined) options.signal?.removeEventListener("abort", abortListener);
			worker.onmessage = null;
			worker.onerror = null;
			releaseGraphiteMetadataWorker(acquired, mode);
			resolve(status);
		}

		worker.onmessage = (event) => {
			const response = graphiteMetadataWorkerResponseFromValue(event.data);
			if (response === undefined) {
				emitWorkerDiagnostic(options, { type: "worker-malformed-response", data: event.data });
				finish(unavailableFromWorker(input, "read-failed"), "terminate");
				return;
			}
			if (response.type === "failure") {
				emitWorkerDiagnostic(options, { type: "worker-failure-response", message: response.message });
				finish(unavailableFromWorker(input, "read-failed"), "terminate");
				return;
			}

			finish(response.status, acquired.shouldTerminateOnSuccess ? "terminate" : "reuse");
		};
		worker.onerror = (event) => {
			const diagnostic: GraphiteMetadataWorkerDiagnostic = { type: "worker-error" };
			if (event.message !== undefined) diagnostic.message = event.message;
			if (event.error !== undefined) diagnostic.error = event.error;
			emitWorkerDiagnostic(options, diagnostic);
			finish(unavailableFromWorker(input, "read-failed"), "terminate");
		};

		abortListener = () => finish(unavailableFromWorker(input, "read-timeout"), "terminate");
		options.signal?.addEventListener("abort", abortListener, { once: true });
		if (options.signal?.aborted) {
			finish(unavailableFromWorker(input, "read-timeout"), "terminate");
			return;
		}
		timeout = setTimeout(() => {
			emitWorkerDiagnostic(options, { type: "worker-timeout", timeoutMs });
			finish(unavailableFromWorker(input, "read-timeout"), "terminate");
		}, timeoutMs);

		try {
			worker.postMessage({ type: "load_graphite_metadata", input });
		} catch (error) {
			emitWorkerDiagnostic(options, { type: "worker-post-message-failed", error });
			finish(unavailableFromWorker(input, "read-failed"), "terminate");
		}
	});
}

export function shutdownGraphiteMetadataWorker(): void {
	const cached = cachedGraphiteMetadataWorker;
	if (cached === undefined) return;
	if (cached.isBusy) {
		cached.shouldTerminateWhenIdle = true;
		return;
	}

	cachedGraphiteMetadataWorker = undefined;
	terminateGraphiteMetadataWorker(cached.worker);
}

export function graphiteMetadataWorkerRequestFromValue(value: unknown): GraphiteMetadataWorkerRequest | undefined {
	if (!isRecord(value)) return undefined;
	if (value.type !== "load_graphite_metadata") return undefined;
	if (!isGraphiteMetadataLookupInput(value.input)) return undefined;
	return { type: "load_graphite_metadata", input: value.input };
}

export function graphiteMetadataWorkerResponseFromValue(value: unknown): GraphiteMetadataWorkerResponse | undefined {
	if (!isRecord(value)) return undefined;
	if (value.type === "failure") {
		return typeof value.message === "string" ? { type: "failure", message: value.message } : undefined;
	}
	if (value.type !== "success" || !isGraphiteMetadataStatus(value.status)) return undefined;
	return { type: "success", status: value.status };
}

export function loadGraphiteMetadataStatus(input: GraphiteMetadataLookupInput): GraphiteMetadataStatus {
	const dbPath = join(input.commonGitDir, GRAPHITE_METADATA_DB_NAME);
	if (!existsSync(dbPath)) return { type: "unavailable", reason: "missing-db", currentBranch: input.currentBranch };

	const schemaRows = runSqliteJsonQuery(dbPath, "PRAGMA table_info(branch_metadata)");
	if (schemaRows.type === "failure") {
		return { type: "unavailable", reason: schemaRows.reason, currentBranch: input.currentBranch };
	}
	if (!hasExpectedBranchMetadataSchema(schemaRows.data)) {
		return { type: "unavailable", reason: "schema-mismatch", currentBranch: input.currentBranch };
	}

	const rowQuery = [
		"SELECT parent_branch_name, children, validation_result",
		"FROM branch_metadata",
		`WHERE branch_name = ${sqliteTextLiteral(input.currentBranch)}`,
		"LIMIT 1",
	].join(" ");
	const rowResult = runSqliteJsonQuery(dbPath, rowQuery);
	if (rowResult.type === "failure") {
		return { type: "unavailable", reason: rowResult.reason, currentBranch: input.currentBranch };
	}

	const rows = graphiteMetadataSqlRowsFromValue(rowResult.data);
	const row = rows[0];
	if (row === undefined) return { type: "untracked", currentBranch: input.currentBranch };

	return {
		type: "tracked",
		currentBranch: input.currentBranch,
		parent: metadataText(row.parent_branch_name),
		children: parseGraphiteChildren(row.children),
		isCurrentTrunk: isGraphiteTrunkValidationResult(row.validation_result),
	};
}

function createGraphiteMetadataWorker(): GraphiteMetadataWorkerHandle {
	const worker = new ThreadWorker(new URL("./graphite-metadata-worker.ts", import.meta.url), { execArgv: [] });
	const handle: GraphiteMetadataWorkerHandle = {
		onmessage: null,
		onerror: null,
		postMessage(message) {
			worker.postMessage(message);
		},
		terminate() {
			return worker.terminate();
		},
	};
	worker.on("message", (data: unknown) => handle.onmessage?.({ data }));
	worker.on("error", (error: unknown) => {
		const event: { message?: string; error?: unknown } = {};
		if (error instanceof Error) event.message = error.message;
		event.error = error;
		handle.onerror?.(event);
	});
	return handle;
}

function acquireGraphiteMetadataWorker(factory: GraphiteMetadataWorkerFactory): AcquiredGraphiteMetadataWorker {
	const cached = cachedGraphiteMetadataWorker;
	if (cached !== undefined) {
		if (cached.isBusy) {
			return { worker: factory(), cached: undefined, shouldTerminateOnSuccess: true };
		}
		if (cached.factory === factory) {
			cached.isBusy = true;
			return { worker: cached.worker, cached, shouldTerminateOnSuccess: false };
		}

		cachedGraphiteMetadataWorker = undefined;
		terminateGraphiteMetadataWorker(cached.worker);
	}

	const worker = factory();
	const nextCached: CachedGraphiteMetadataWorker = {
		worker,
		factory,
		isBusy: true,
		shouldTerminateWhenIdle: false,
	};
	cachedGraphiteMetadataWorker = nextCached;
	return { worker, cached: nextCached, shouldTerminateOnSuccess: false };
}

function releaseGraphiteMetadataWorker(
	acquired: AcquiredGraphiteMetadataWorker,
	mode: GraphiteMetadataWorkerFinishMode,
): void {
	const cached = acquired.cached;
	if (cached === undefined) {
		terminateGraphiteMetadataWorker(acquired.worker);
		return;
	}

	if (mode === "reuse" && !cached.shouldTerminateWhenIdle) {
		cached.isBusy = false;
		return;
	}

	if (cachedGraphiteMetadataWorker === cached) cachedGraphiteMetadataWorker = undefined;
	cached.isBusy = false;
	terminateGraphiteMetadataWorker(cached.worker);
}

function terminateGraphiteMetadataWorker(worker: GraphiteMetadataWorkerHandle): void {
	try {
		worker.terminate();
	} catch {
		// Termination is best-effort cleanup after a degraded passive status lookup.
	}
}

function emitWorkerDiagnostic(
	options: LoadGraphiteMetadataStatusInWorkerOptions,
	diagnostic: GraphiteMetadataWorkerDiagnostic,
): void {
	try {
		options.onDiagnostic?.(diagnostic);
	} catch {
		// Diagnostics are best-effort; a reporting failure must not block worker cleanup.
	}
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
	return GRAPHITE_METADATA_UNAVAILABLE_REASONS.some((reason) => reason === value);
}

function runSqliteJsonQuery(dbPath: string, query: string): SqliteCliResult | SqliteCliFailure {
	const result = spawnSync("sqlite3", ["-json", dbPath, query], {
		encoding: "utf8",
		timeout: SQLITE_QUERY_TIMEOUT_MS,
	});

	if (result.error !== undefined) {
		const errorCode = errorCodeFromValue(result.error);
		return { type: "failure", reason: errorCode === "ENOENT" ? "sqlite-unavailable" : "read-failed" };
	}
	if (result.status !== 0) return { type: "failure", reason: "read-failed" };

	try {
		return { type: "success", data: JSON.parse(result.stdout.trim() || "[]") };
	} catch {
		return { type: "failure", reason: "read-failed" };
	}
}

function errorCodeFromValue(value: unknown): string | undefined {
	return isRecord(value) && typeof value.code === "string" ? value.code : undefined;
}

function sqliteTextLiteral(value: string): string {
	return `'${value.replaceAll("'", "''")}'`;
}

function hasExpectedBranchMetadataSchema(value: unknown): boolean {
	const rows = graphiteMetadataColumnRowsFromValue(value);
	const columnNames = new Set<string>();
	for (const row of rows) {
		const name = metadataText(row.name);
		if (name !== undefined) columnNames.add(name);
	}
	return BRANCH_METADATA_REQUIRED_COLUMNS.every((columnName) => columnNames.has(columnName));
}

function isGraphiteTrunkValidationResult(value: unknown): boolean {
	// Graphite's private metadata DB currently marks the configured trunk with this validation result.
	// Keep the sentinel isolated so future schema drift is visible through the schema-mismatch path above.
	return metadataText(value)?.toUpperCase() === "TRUNK";
}

function graphiteMetadataColumnRowsFromValue(value: unknown): GraphiteMetadataColumnRow[] {
	if (!Array.isArray(value)) return [];
	return value.filter((row): row is GraphiteMetadataColumnRow => isRecord(row) && "name" in row);
}

function graphiteMetadataSqlRowsFromValue(value: unknown): GraphiteMetadataSqlRow[] {
	if (!Array.isArray(value)) return [];
	return value.filter(
		(row): row is GraphiteMetadataSqlRow =>
			isRecord(row) && "parent_branch_name" in row && "children" in row && "validation_result" in row,
	);
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
