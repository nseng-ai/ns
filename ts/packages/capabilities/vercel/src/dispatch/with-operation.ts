import type { Clock } from "@nseng-ai/foundation/clock";
import { systemClock } from "@nseng-ai/foundation/time";

import { normalizeDispatchFailure, type DispatchFailureDiagnostic } from "./failure-diagnostic.ts";

export type OperationLogSink = (serializedEvent: string) => void;

export interface OperationContext {
	readonly [key: string]: string | number | boolean;
}

export interface OperationFailure {
	readonly diagnostic: DispatchFailureDiagnostic;
}

export interface WithOperationOptions<T> {
	readonly operation: string;
	readonly context?: OperationContext;
	readonly clock?: Clock;
	readonly logSink?: OperationLogSink;
	readonly failure?: (result: T) => OperationFailure | undefined;
	readonly failureMessage?: (result: T) => string | undefined;
	readonly normalizeThrownFailure?: (error: unknown) => DispatchFailureDiagnostic;
}

/** Emits only normalized, bounded diagnostic data; raw external errors never cross this boundary. */
export async function withOperation<T>(
	options: WithOperationOptions<T>,
	run: () => Promise<T>,
): Promise<T> {
	const clock = options.clock ?? systemClock;
	const logSink = options.logSink ?? console.info;
	const startedAtMs = clock.nowMs();
	writeBestEffort(logSink, {
		...options.context,
		event: "operation_started",
		operation: options.operation,
	});

	let result: T;
	try {
		result = await run();
	} catch (error) {
		const diagnostic =
			options.normalizeThrownFailure?.(error) ??
			normalizeDispatchFailure({
				operation: options.operation,
				reason: "unexpected-exception",
				error,
			});
		writeBestEffort(logSink, {
			...options.context,
			event: "operation_failed",
			operation: options.operation,
			durationMs: elapsedMs(startedAtMs, clock.nowMs()),
			diagnostic,
		});
		throw error;
	}

	const failure = classifyFailureBestEffort(options, result);
	const durationMs = elapsedMs(startedAtMs, clock.nowMs());
	if (failure !== undefined) {
		writeBestEffort(logSink, {
			...options.context,
			event: "operation_failed",
			operation: options.operation,
			durationMs,
			diagnostic: failure.diagnostic,
		});
		return result;
	}
	writeBestEffort(logSink, {
		...options.context,
		event: "operation_succeeded",
		operation: options.operation,
		durationMs,
	});
	return result;
}

function classifyFailureBestEffort<T>(
	options: WithOperationOptions<T>,
	result: T,
): OperationFailure | undefined {
	let inspectedFailure: OperationFailure | undefined;
	try {
		inspectedFailure = options.failure?.(result);
	} catch {
		// Result classification is observational and cannot change operation behavior.
	}

	let legacyDiagnostic: string | undefined;
	try {
		legacyDiagnostic = options.failureMessage?.(result);
	} catch {
		// Legacy result classification has the same observational contract.
	}

	return (
		inspectedFailure ??
		(legacyDiagnostic === undefined
			? undefined
			: {
					diagnostic: normalizeDispatchFailure({
						operation: options.operation,
						reason: "operation-returned-failure",
						message: legacyDiagnostic,
					}),
				})
	);
}

function elapsedMs(startedAtMs: number, finishedAtMs: number): number {
	return Math.max(0, finishedAtMs - startedAtMs);
}

function writeBestEffort(
	logSink: OperationLogSink,
	event: Readonly<Record<string, unknown>>,
): void {
	try {
		logSink(JSON.stringify(event));
	} catch {
		// Operational logging must not change dispatch results or retry behavior.
	}
}
