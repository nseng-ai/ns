import { failure, ok } from "@sdl/clinkr";
import { defineExtension } from "sdl-sdk";

import { createRoasterClient } from "../api.ts";
import {
	renderReviewList,
	reviewListRequestSchema,
	reviewListResultSchema,
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
		const result = await createRoasterClient({
			cwd: runtime.runScope.cwd,
			env: runtime.runScope.env,
			runtime,
		}).listReviews(request);
		if (!result.ok) return failure(result.failure.errorType, result.failure.message);
		return ok(result.result);
	},
});

export default defineExtension({
	commands: [roasterReviewLsCommand],
});

export type RoasterReviewLsRequest = ReviewListRequest;
