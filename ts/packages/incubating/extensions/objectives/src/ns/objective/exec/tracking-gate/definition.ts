import { z } from "zod";

import { objectiveNsCommand } from "../../../objective-command.ts";
import {
	renderTrackingGate,
	runTrackingGate,
	trackingGateRequestSchema,
	trackingGateResultSchema,
} from "../../../../core/operations/tracking-gate.ts";

export async function command() {
	return objectiveNsCommand({
		schema: trackingGateRequestSchema,
		resultSchema: trackingGateResultSchema,
		negativeSchema: trackingGateResultSchema,
		usageErrorSchema: z.any(),
		positionals: { slug: { position: 0 } },
		handler: runTrackingGate,
		renderHuman: renderTrackingGate,
		renderMarkdown: renderTrackingGate,
	});
}
