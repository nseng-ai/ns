import { getWritable } from "workflow";

import {
	emitDispatchWorkflowEvent,
	type DispatchWorkflowEvent,
} from "../src/dispatch/workflow-observability.ts";

export const DISPATCH_STATUS_STREAM_NAMESPACE = "status";

export type DispatchStatusStreamFactory = () => WritableStream<DispatchWorkflowEvent>;

/**
 * Publish one safe lifecycle event to both Function logs and the run's durable
 * status stream. The stream is operator-facing observability only: a storage
 * failure emits a value-free marker and never changes dispatch behavior.
 */
export async function writeDispatchWorkflowEvent(
	event: DispatchWorkflowEvent,
	createStream: DispatchStatusStreamFactory = () =>
		getWritable<DispatchWorkflowEvent>({ namespace: DISPATCH_STATUS_STREAM_NAMESPACE }),
	logSink: (serializedEvent: string) => void = console.info,
): Promise<void> {
	emitDispatchWorkflowEvent(event, logSink);

	let writer: WritableStreamDefaultWriter<DispatchWorkflowEvent> | undefined;
	try {
		writer = createStream().getWriter();
		await writer.write(event);
	} catch {
		emitDispatchWorkflowEvent(
			{ event: "observability_write_failed", operation: "status-stream" },
			logSink,
		);
	} finally {
		writer?.releaseLock();
	}
}
