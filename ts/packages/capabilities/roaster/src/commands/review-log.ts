import { defineExtension } from "@ns/kernel/sdk";

import {
	renderReviewLog,
	reviewLogRequestSchema,
	reviewLogResultSchema,
	runReviewLog,
	type ReviewLogRequest,
} from "../operations/cli-operations.ts";
import { roasterNsCommand } from "../ns/command.ts";

const REVIEW_LOG_DESCRIPTION = `List Branch Memory review log entries for this branch, optionally filtered by review key.`;

export const roasterReviewLogCommand = roasterNsCommand({
	name: "log",
	summary: "List Roaster review logs for this branch.",
	description: REVIEW_LOG_DESCRIPTION,
	schema: reviewLogRequestSchema,
	positionals: { key: { position: 0 } },
	resultSchema: reviewLogResultSchema,
	renderHuman: (data, _caps) => renderReviewLog(data),
	async handler(runtime, request) {
		return await runReviewLog(runtime, request);
	},
});

export default defineExtension({
	commands: [roasterReviewLogCommand],
});

export type RoasterReviewLogRequest = ReviewLogRequest;
