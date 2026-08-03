import {
	renderReviewLog,
	reviewLogRequestSchema,
	reviewLogResultSchema,
	runReviewLog,
} from "../../../../operations/cli-operations.ts";
import { reviewsNsCommand } from "../../../command.ts";

const reviewLogCommand = reviewsNsCommand({
	schema: reviewLogRequestSchema,
	positionals: { key: { position: 0 } },
	resultSchema: reviewLogResultSchema,
	renderHuman: (data, _caps) => renderReviewLog(data),
	async handler(runtime, request) {
		return await runReviewLog(runtime, request);
	},
});

export async function command() {
	return reviewLogCommand;
}
