import { defineExtension } from "sdl-sdk";

import {
	renderReviewList,
	reviewListRequestSchema,
	reviewListResultSchema,
	runReviewList,
	type ReviewListRequest,
} from "../operations/cli-operations.ts";
import { roasterSdlCommand } from "../sdl/command.ts";

const REVIEW_LS_DESCRIPTION = `Alias for sdl roaster review list.`;

export const roasterReviewLsCommand = roasterSdlCommand({
	name: "ls",
	summary: "Alias for review list.",
	description: REVIEW_LS_DESCRIPTION,
	schema: reviewListRequestSchema,
	resultSchema: reviewListResultSchema,
	renderHuman: (data, _caps) => renderReviewList(data),
	async handler(runtime, request) {
		return await runReviewList(runtime, request);
	},
});

export default defineExtension({
	commands: [roasterReviewLsCommand],
});

export type RoasterReviewLsRequest = ReviewListRequest;
