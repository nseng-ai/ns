import { setAttributes } from "workflow";

import {
	emitDispatchWorkflowEvent,
	type DispatchWorkflowAttributes,
} from "../src/dispatch/workflow-observability.ts";

export type DispatchAttributeWriter = (
	attributes: Record<string, string | undefined>,
) => Promise<void>;

export async function writeDispatchWorkflowAttributes(
	attributes: DispatchWorkflowAttributes,
	writer: DispatchAttributeWriter = setAttributes,
	logSink: (serializedEvent: string) => void = console.info,
): Promise<void> {
	try {
		await writer({ ...attributes });
	} catch {
		emitDispatchWorkflowEvent(
			{ event: "observability_write_failed", operation: "set-attributes" },
			logSink,
		);
	}
}
