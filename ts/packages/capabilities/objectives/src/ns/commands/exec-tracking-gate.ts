import { defineExtension } from "@nseng-ai/kernel/sdk";

import { objectiveNsCommand } from "../command.ts";
import {
	renderTrackingGate,
	runTrackingGate,
	trackingGateRequestSchema,
	trackingGateResultSchema,
} from "../../core/operations/tracking-gate.ts";

export const objectiveExecTrackingGateNsCommand = objectiveNsCommand({
	name: "exec-tracking-gate",
	summary: "Collect deterministic Objective tracking gate evidence for one slug.",
	description: "Collect deterministic Objective tracking gate evidence for one slug.",
	schema: trackingGateRequestSchema,
	resultSchema: trackingGateResultSchema,
	positionals: { slug: { position: 0 } },
	handler: runTrackingGate,
	renderHuman: renderTrackingGate,
	renderMarkdown: renderTrackingGate,
});

export default defineExtension({
	commands: [objectiveExecTrackingGateNsCommand],
});
