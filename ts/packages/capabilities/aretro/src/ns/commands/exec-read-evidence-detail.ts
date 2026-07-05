import { defineExtension } from "@ns/kernel/sdk";

import { aretroNsCommand } from "../command.ts";
import {
	readEvidenceDetailRequestSchema,
	readEvidenceDetailResultSchema,
	renderReadEvidenceDetail,
	runReadEvidenceDetail,
} from "../../operations/read-evidence-detail.ts";

export const aretroExecReadEvidenceDetailNsCommand = aretroNsCommand({
	name: "exec-read-evidence-detail",
	summary: "Read Aretro evidence detail from a payload pointer.",
	description: "Read Aretro evidence detail from a payload pointer.",
	schema: readEvidenceDetailRequestSchema,
	resultSchema: readEvidenceDetailResultSchema,
	handler: runReadEvidenceDetail,
	renderHuman: renderReadEvidenceDetail,
});

export default defineExtension({
	commands: [aretroExecReadEvidenceDetailNsCommand],
});
