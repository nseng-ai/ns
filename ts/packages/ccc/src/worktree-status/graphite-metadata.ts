import { existsSync } from "node:fs";
import { Worker as ThreadWorker } from "node:worker_threads";

import {
	classifySqliteJsonResult,
	createGraphiteSqliteJsonRunner,
	GRAPHITE_BRANCH_METADATA_QUERY,
	GRAPHITE_BRANCH_METADATA_SCHEMA_QUERY,
	graphiteMetadataDbPath,
	hasExpectedGraphiteBranchMetadataSchema,
	parseGraphiteBranchMetadataRows,
	sqliteTextLiteral,
} from "@asdl/core/graphite-metadata";
import { isRecord } from "@asdl/pi-extension-runtime/cmux/primitives";
const GRAPHITE_METADATA_UNAVAILABLE_REASONS = [
	"missing-db",
	"sqlite-unavailable",
	"read-failed",
	"read-timeout",
	"schema-mismatch",
	"not-a-git-repo",
	"no-current-branch",
] as const;
export type GraphiteMetadataUnavailableReason =
	(typeof GRAPHITE_METADATA_UNAVAILABLE_REASONS)[number];

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

export type GraphiteMetadataWorkerResponse =
	| { type: "success"; status: GraphiteMetadataStatus }
	| { type: "failure"; message: string };

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

export type GraphiteMetadataJsonQueryResult =
	| { type: "success"; data: unknown }
	| {
			type: "failure";
			reason: Extract<GraphiteMetadataUnavailableReason, "sqlite-unavailable" | "read-failed">;
	  };

export interface GraphiteMetadataDbAccess {
	exists(dbPath: string): boolean;
	queryJson(dbPath: string, query: string): GraphiteMetadataJsonQueryResult;
}

export interface LoadGraphiteMetadataStatusOptions {
	dbAccess?: GraphiteMetadataDbAccess | undefined;
}

const GRAPHITE_METADATA_LOOKUP_TIMEOUT_MS = 1_000;

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
				emitWorkerDiagnostic(options, {
					type: "worker-failure-response",
					message: response.message,
				});
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

export function graphiteMetadataWorkerRequestFromValue(
	value: unknown,
): GraphiteMetadataWorkerRequest | undefined {
	if (!isRecord(value)) return undefined;
	if (value.type !== "load_graphite_metadata") return undefined;
	if (!isGraphiteMetadataLookupInput(value.input)) return undefined;
	return { type: "load_graphite_metadata", input: value.input };
}

export function graphiteMetadataWorkerResponseFromValue(
	value: unknown,
): GraphiteMetadataWorkerResponse | undefined {
	if (!isRecord(value)) return undefined;
	if (value.type === "failure") {
		return typeof value.message === "string"
			? { type: "failure", message: value.message }
			: undefined;
	}
	if (value.type !== "success" || !isGraphiteMetadataStatus(value.status)) return undefined;
	return { type: "success", status: value.status };
}

export function loadGraphiteMetadataStatus(
	input: GraphiteMetadataLookupInput,
	options: LoadGraphiteMetadataStatusOptions = {},
): GraphiteMetadataStatus {
	const dbAccess = options.dbAccess ?? defaultGraphiteMetadataDbAccess;
	const dbPath = graphiteMetadataDbPath(input.commonGitDir);
	if (!dbAccess.exists(dbPath))
		return { type: "unavailable", reason: "missing-db", currentBranch: input.currentBranch };

	const schemaRows = dbAccess.queryJson(dbPath, GRAPHITE_BRANCH_METADATA_SCHEMA_QUERY);
	if (schemaRows.type === "failure") {
		return { type: "unavailable", reason: schemaRows.reason, currentBranch: input.currentBranch };
	}
	if (!hasExpectedGraphiteBranchMetadataSchema(schemaRows.data)) {
		return { type: "unavailable", reason: "schema-mismatch", currentBranch: input.currentBranch };
	}

	const rowQuery = [
		GRAPHITE_BRANCH_METADATA_QUERY,
		`WHERE branch_name = ${sqliteTextLiteral(input.currentBranch)}`,
		"LIMIT 1",
	].join(" ");
	const rowResult = dbAccess.queryJson(dbPath, rowQuery);
	if (rowResult.type === "failure") {
		return { type: "unavailable", reason: rowResult.reason, currentBranch: input.currentBranch };
	}

	const parsed = parseGraphiteBranchMetadataRows(rowResult.data);
	if (parsed.type !== "ok")
		return { type: "unavailable", reason: "read-failed", currentBranch: input.currentBranch };
	const row = parsed.topology.get(input.currentBranch);
	if (row === undefined) return { type: "untracked", currentBranch: input.currentBranch };

	return {
		type: "tracked",
		currentBranch: input.currentBranch,
		parent: row.parent,
		children: row.children,
		isCurrentTrunk: row.isTrunkMarked,
	};
}

function createGraphiteMetadataWorker(): GraphiteMetadataWorkerHandle {
	const worker = new ThreadWorker(new URL("./graphite-metadata-worker.ts", import.meta.url), {
		execArgv: [],
	});
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

function acquireGraphiteMetadataWorker(
	factory: GraphiteMetadataWorkerFactory,
): AcquiredGraphiteMetadataWorker {
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
	return (
		isRecord(value) &&
		typeof value.commonGitDir === "string" &&
		typeof value.currentBranch === "string"
	);
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
	if (value.type !== "unavailable" || !isGraphiteMetadataUnavailableReason(value.reason))
		return false;
	return value.currentBranch === undefined || typeof value.currentBranch === "string";
}

function isGraphiteMetadataUnavailableReason(
	value: unknown,
): value is GraphiteMetadataUnavailableReason {
	return GRAPHITE_METADATA_UNAVAILABLE_REASONS.some((reason) => reason === value);
}

const defaultGraphiteMetadataDbAccess: GraphiteMetadataDbAccess = {
	exists(dbPath) {
		return existsSync(dbPath);
	},
	queryJson(dbPath, query) {
		return runSqliteJsonQuery(dbPath, query);
	},
};

const graphiteSqliteJsonRunner = createGraphiteSqliteJsonRunner();

function runSqliteJsonQuery(dbPath: string, query: string): GraphiteMetadataJsonQueryResult {
	const outcome = classifySqliteJsonResult(graphiteSqliteJsonRunner.run(dbPath, query));
	switch (outcome.type) {
		case "success":
			return { type: "success", data: outcome.data };
		case "command-missing":
			return { type: "failure", reason: "sqlite-unavailable" };
		case "exec-error":
		case "nonzero-exit":
		case "invalid-json":
			return { type: "failure", reason: "read-failed" };
	}
}
