import type { Clock } from "@nseng-ai/foundation/clock";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import { systemClock } from "@nseng-ai/foundation/time";

export type OperationLogSink = (serializedEvent: string) => void;

export interface OperationContext {
	readonly [key: string]: string | number | boolean;
}

export interface OperationFailure {
	readonly reason: string;
	readonly diagnostic?: string;
}

export interface WithOperationOptions<T> {
	readonly operation: string;
	readonly context?: OperationContext;
	readonly clock?: Clock;
	readonly logSink?: OperationLogSink;
	readonly failure?: (result: T) => OperationFailure | undefined;
	readonly failureMessage?: (result: T) => string | undefined;
}

/**
 * Follow-up direction: Workflow step callers could adapt these operation
 * events to the existing named `status` stream, rendering a detailed durable
 * timeline in Workflow CLI/Web UI. Keep this helper Workflow-SDK-independent
 * and put that adapter at the workflow edge. This slice intentionally emits
 * only Vercel Function logs.
 */
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

	try {
		const result = await run();
		const inspectedFailure = options.failure?.(result);
		const legacyDiagnostic = options.failureMessage?.(result);
		const failure =
			inspectedFailure ??
			(legacyDiagnostic === undefined
				? undefined
				: { reason: "operation-returned-failure", diagnostic: legacyDiagnostic });
		const durationMs = elapsedMs(startedAtMs, clock.nowMs());
		if (failure !== undefined) {
			writeBestEffort(logSink, {
				...options.context,
				event: "operation_failed",
				operation: options.operation,
				durationMs,
				reason: failure.reason,
				...(failure.diagnostic === undefined ? {} : { diagnostic: failure.diagnostic }),
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
	} catch (error) {
		writeBestEffort(logSink, {
			...options.context,
			event: "operation_failed",
			operation: options.operation,
			durationMs: elapsedMs(startedAtMs, clock.nowMs()),
			reason: "unexpected-exception",
			diagnostic: formatErrorMessage(error),
		});
		throw error;
	}
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
