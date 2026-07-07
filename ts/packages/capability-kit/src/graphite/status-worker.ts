import { Worker, parentPort } from "node:worker_threads";

import { isRecord } from "@nseng-ai/foundation/primitives";
import { systemTimerScheduler } from "@nseng-ai/foundation/time";
import type { ScheduledTimer } from "@nseng-ai/foundation/timers";

import { loadGraphiteMetadataStatus } from "./status-loader.ts";
import type {
	GraphiteMetadataLookupInput,
	GraphiteMetadataStatus,
	GraphiteMetadataUnavailableReason,
	GraphiteMetadataWorkerDiagnostic,
	GraphiteMetadataWorkerFactory,
	GraphiteMetadataWorkerHandle,
	GraphiteMetadataWorkerRequest,
	GraphiteMetadataWorkerResponse,
	LoadGraphiteMetadataStatusInWorkerOptions,
} from "./status.ts";

const GRAPHITE_METADATA_LOOKUP_TIMEOUT_MS = 1_000;

const GRAPHITE_METADATA_UNAVAILABLE_REASONS = [
	"missing-db",
	"sqlite-unavailable",
	"read-failed",
	"read-timeout",
	"schema-mismatch",
	"not-a-git-repo",
	"no-current-branch",
	"branch-ref-read-failed",
] as const satisfies readonly GraphiteMetadataUnavailableReason[];

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

const port = parentPort;
if (port !== null) {
	port.on("message", (data: unknown) => {
		port.postMessage(handleGraphiteMetadataWorkerMessage(data));
	});
}

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
	const timers = options.timers ?? systemTimerScheduler;
	return new Promise((resolve) => {
		let finished = false;
		let timeout: ScheduledTimer | undefined;
		let abortListener: (() => void) | undefined;

		function finish(status: GraphiteMetadataStatus, mode: GraphiteMetadataWorkerFinishMode): void {
			if (finished) return;
			finished = true;
			if (timeout !== undefined) timeout.cancel();
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
		timeout = timers.setTimeout(() => {
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

function createGraphiteMetadataWorker(): GraphiteMetadataWorkerHandle {
	const worker = new Worker(new URL("./status-worker.ts", import.meta.url), {
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

function handleGraphiteMetadataWorkerMessage(data: unknown): GraphiteMetadataWorkerResponse {
	const request = graphiteMetadataWorkerRequestFromValue(data);
	if (request === undefined)
		return { type: "failure", message: "invalid graphite metadata request" };

	try {
		return {
			type: "success",
			status: loadGraphiteMetadataStatus(request.input),
		};
	} catch (error) {
		return {
			type: "failure",
			message: error instanceof Error ? error.message : "graphite metadata worker failed",
		};
	}
}
