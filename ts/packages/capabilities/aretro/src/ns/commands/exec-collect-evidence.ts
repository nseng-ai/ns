import { defineExtension } from "@ns/kernel/sdk";

import { aretroNsCommand } from "../command.ts";
import {
	collectEvidenceRequestSchema,
	collectEvidenceResultSchema,
	renderCollectEvidence,
	runCollectEvidence,
} from "../../operations/collect-evidence.ts";

export const aretroExecCollectEvidenceNsCommand = aretroNsCommand({
	name: "exec-collect-evidence",
	summary: "Collect compact session evidence for a branch retrospective.",
	description: "Collect compact session evidence for a branch retrospective.",
	schema: collectEvidenceRequestSchema,
	resultSchema: collectEvidenceResultSchema,
	handler: runCollectEvidence,
	renderHuman: renderCollectEvidence,
});

export default defineExtension({
	commands: [aretroExecCollectEvidenceNsCommand],
});
