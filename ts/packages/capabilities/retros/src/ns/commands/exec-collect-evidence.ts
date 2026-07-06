import { defineExtension } from "@nseng-ai/kernel/sdk";

import { retrosNsCommand } from "../command.ts";
import {
	collectEvidenceRequestSchema,
	collectEvidenceResultSchema,
	renderCollectEvidence,
	runCollectEvidence,
} from "../../operations/collect-evidence.ts";

export const retrosExecCollectEvidenceNsCommand = retrosNsCommand({
	name: "exec-collect-evidence",
	summary: "Collect compact session evidence for a branch retrospective.",
	description: "Collect compact session evidence for a branch retrospective.",
	schema: collectEvidenceRequestSchema,
	resultSchema: collectEvidenceResultSchema,
	handler: runCollectEvidence,
	renderHuman: renderCollectEvidence,
});

export default defineExtension({
	commands: [retrosExecCollectEvidenceNsCommand],
});
