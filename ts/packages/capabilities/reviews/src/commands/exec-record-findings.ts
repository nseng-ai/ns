import { reviewRunResultSchema } from "../core/models.ts";
import {
	recordFindingsRequestSchema,
	renderReviewRun,
	runRecordFindings,
	type RecordFindingsRequest,
} from "../operations/cli-operations.ts";
import { reviewsNsCommand } from "../ns/command.ts";

const EXEC_RECORD_FINDINGS_DESCRIPTION = `Record same-session Reviews findings from stdin.

This hidden ns automation command preserves Reviews record-findings JSON stdin contract, validates the findings payload inside Reviews-owned logic, and writes the same Branch Memory review log under namespace reviews and reviews/<review-key>/... keys. It intentionally does not publish findings to GitHub.`;

export const reviewsExecRecordFindingsCommand = reviewsNsCommand({
	name: "exec-record-findings",
	summary: "Record same-session Reviews findings from stdin.",
	description: EXEC_RECORD_FINDINGS_DESCRIPTION,
	schema: recordFindingsRequestSchema,
	resultSchema: reviewRunResultSchema,
	renderHuman: (data, _caps) => renderReviewRun(data),
	async handler(runtime, request) {
		return await runRecordFindings(runtime, request);
	},
});

export default reviewsExecRecordFindingsCommand;

export type ReviewsExecRecordFindingsRequest = RecordFindingsRequest;
