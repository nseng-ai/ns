import { setAttributes } from "workflow";

import {
	emitDispatchWorkflowEvent,
	type DispatchWorkflowAttributes,
} from "../src/dispatch/workflow-observability.ts";

export type DispatchAttributeWriter = (
	attributes: Record<string, string | undefined>,
) => Promise<void>;

export interface DispatchAttributeWriterGateways {
	readonly writer: DispatchAttributeWriter;
	readonly logSink: (serializedEvent: string) => void;
}

function defaultDispatchAttributeWriterGateways(): DispatchAttributeWriterGateways {
	return { writer: setAttributes, logSink: console.info };
}

export async function writeDispatchWorkflowAttributes(
	attributes: DispatchWorkflowAttributes,
	gateways: DispatchAttributeWriterGateways = defaultDispatchAttributeWriterGateways(),
): Promise<void> {
	const { writer, logSink } = gateways;
	try {
		await writer({ ...attributes });
	} catch {
		emitDispatchWorkflowEvent(
			{ event: "observability_write_failed", operation: "set-attributes" },
			logSink,
		);
	}
}
