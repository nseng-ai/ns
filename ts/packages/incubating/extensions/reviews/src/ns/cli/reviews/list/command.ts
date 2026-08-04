import {
	renderReviewList,
	reviewListRequestSchema,
	reviewListResultSchema,
	runReviewList,
} from "../../../../operations/cli-operations.ts";
import { reviewsNsCommand } from "../../../command.ts";

const reviewListCommand = reviewsNsCommand({
	schema: reviewListRequestSchema,
	options: {
		applicable: { short: "-a" },
		ci: { short: "-c" },
		baseRef: { short: "-b" },
	},
	resultSchema: reviewListResultSchema,
	renderHuman: (data, _caps) => renderReviewList(data),
	async handler(runtime, request) {
		return await runReviewList(runtime, request);
	},
});

export async function command() {
	return reviewListCommand;
}
