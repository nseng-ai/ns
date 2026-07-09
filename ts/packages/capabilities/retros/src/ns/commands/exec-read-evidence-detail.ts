import { retrosNsCommand } from "../command.ts";
import {
	readEvidenceDetailRequestSchema,
	readEvidenceDetailResultSchema,
	renderReadEvidenceDetail,
	runReadEvidenceDetail,
} from "../../operations/read-evidence-detail.ts";

export const retrosExecReadEvidenceDetailNsCommand = retrosNsCommand({
	name: "read-evidence-detail",
	summary: "Read Retro evidence detail from a payload pointer.",
	description: "Read Retro evidence detail from a payload pointer.",
	schema: readEvidenceDetailRequestSchema,
	resultSchema: readEvidenceDetailResultSchema,
	handler: runReadEvidenceDetail,
	renderHuman: renderReadEvidenceDetail,
});

export default retrosExecReadEvidenceDetailNsCommand;
