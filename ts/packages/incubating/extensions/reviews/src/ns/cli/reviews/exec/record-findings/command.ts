import { reviewRunResultSchema } from "../../../../../core/models.ts";
import {
	recordFindingsRequestSchema,
	renderReviewRun,
	runRecordFindings,
} from "../../../../../operations/cli-operations.ts";
import { reviewsNsCommand } from "../../../../command.ts";

const reviewsExecRecordFindingsCommand = reviewsNsCommand({
	schema: recordFindingsRequestSchema,
	resultSchema: reviewRunResultSchema,
	renderHuman: (data, _caps) => renderReviewRun(data),
	async handler(runtime, request) {
		return await runRecordFindings(runtime, request);
	},
});

export async function command() {
	return reviewsExecRecordFindingsCommand;
}
