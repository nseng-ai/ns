import { objectiveCommandMetadata, objectiveNsCommand } from "../../../objective-command.ts";
import {
	renderTrackingGate,
	runTrackingGate,
	trackingGateRequestSchema,
	trackingGateResultSchema,
} from "../../../../core/operations/tracking-gate.ts";

export function metadata() {
	return objectiveCommandMetadata(
		"Collect deterministic Objective tracking gate evidence for one slug.",
	);
}

export async function command() {
	return objectiveNsCommand({
		schema: trackingGateRequestSchema,
		resultSchema: trackingGateResultSchema,
		positionals: { slug: { position: 0 } },
		handler: runTrackingGate,
		renderHuman: renderTrackingGate,
		renderMarkdown: renderTrackingGate,
	});
}
