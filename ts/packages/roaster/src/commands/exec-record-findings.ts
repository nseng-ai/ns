import { defineExtension } from "@sdl/kernel/sdk";

import { reviewRunResultSchema } from "../models.ts";
import {
	recordFindingsRequestSchema,
	renderReviewRun,
	runRecordFindings,
	type RecordFindingsRequest,
} from "../operations/cli-operations.ts";
import { roasterSdlCommand } from "../sdl/command.ts";

const EXEC_RECORD_FINDINGS_DESCRIPTION = `Record same-session Roaster findings from stdin.

This hidden SDL automation command preserves Roaster's record-findings JSON stdin contract, validates the findings payload inside Roaster-owned logic, and writes the same Branch Memory review log under namespace roaster and reviews/<review-key>/... keys. It intentionally does not publish findings to GitHub.`;

export const roasterExecRecordFindingsCommand = roasterSdlCommand({
	name: "exec-record-findings",
	summary: "Record same-session Roaster findings from stdin.",
	description: EXEC_RECORD_FINDINGS_DESCRIPTION,
	schema: recordFindingsRequestSchema,
	resultSchema: reviewRunResultSchema,
	renderHuman: (data, _caps) => renderReviewRun(data),
	async handler(runtime, request) {
		return await runRecordFindings(runtime, request);
	},
});

export default defineExtension({
	commands: [roasterExecRecordFindingsCommand],
});

export type RoasterExecRecordFindingsRequest = RecordFindingsRequest;
