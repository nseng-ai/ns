import {
	renderReviewLog,
	reviewLogRequestSchema,
	reviewLogResultSchema,
	runReviewLog,
	type ReviewLogRequest,
} from "../operations/cli-operations.ts";
import { reviewsNsCommand } from "../ns/command.ts";

const REVIEW_LOG_DESCRIPTION = `List Branch Memory review log entries for this branch, optionally filtered by review key.`;

export const reviewLogCommand = reviewsNsCommand({
	name: "log",
	summary: "List Reviews review logs for this branch.",
	description: REVIEW_LOG_DESCRIPTION,
	schema: reviewLogRequestSchema,
	positionals: { key: { position: 0 } },
	resultSchema: reviewLogResultSchema,
	renderHuman: (data, _caps) => renderReviewLog(data),
	async handler(runtime, request) {
		return await runReviewLog(runtime, request);
	},
});

export default reviewLogCommand;

export type ReviewLogCommandRequest = ReviewLogRequest;
