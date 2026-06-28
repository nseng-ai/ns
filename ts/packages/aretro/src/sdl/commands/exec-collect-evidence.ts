import { defineExtension } from "sdl-sdk";

import { aretroSdlCommand } from "../command.ts";
import {
	collectEvidenceRequestSchema,
	collectEvidenceResultSchema,
	renderCollectEvidence,
	runCollectEvidence,
} from "../../operations/collect-evidence.ts";

export const aretroExecCollectEvidenceSdlCommand = aretroSdlCommand({
	name: "exec-collect-evidence",
	summary: "Collect compact session evidence for a branch retrospective.",
	description: "Collect compact session evidence for a branch retrospective.",
	schema: collectEvidenceRequestSchema,
	resultSchema: collectEvidenceResultSchema,
	handler: runCollectEvidence,
	renderHuman: renderCollectEvidence,
});

export default defineExtension({
	commands: [aretroExecCollectEvidenceSdlCommand],
});
