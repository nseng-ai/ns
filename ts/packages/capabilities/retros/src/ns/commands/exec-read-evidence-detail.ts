import { defineExtension } from "@nseng-ai/kernel/sdk";

import { retrosNsCommand } from "../command.ts";
import {
	readEvidenceDetailRequestSchema,
	readEvidenceDetailResultSchema,
	renderReadEvidenceDetail,
	runReadEvidenceDetail,
} from "../../operations/read-evidence-detail.ts";

export const retrosExecReadEvidenceDetailNsCommand = retrosNsCommand({
	name: "exec-read-evidence-detail",
	summary: "Read Retros evidence detail from a payload pointer.",
	description: "Read Retros evidence detail from a payload pointer.",
	schema: readEvidenceDetailRequestSchema,
	resultSchema: readEvidenceDetailResultSchema,
	handler: runReadEvidenceDetail,
	renderHuman: renderReadEvidenceDetail,
});

export default defineExtension({
	commands: [retrosExecReadEvidenceDetailNsCommand],
});
