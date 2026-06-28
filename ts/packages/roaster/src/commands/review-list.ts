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

const REVIEW_LIST_DESCRIPTION = `List configured Roaster review definitions.

This SDL command adapts SDL execution context to Roaster's gateway-injected runtime, then delegates through the curated @sdl/roaster/api facade. Discovery and group help read only manifest metadata; selected help loads this command for its schema and detailed description without running git, Branch Memory, model, or GitHub operations.`;

export const roasterReviewListCommand = roasterSdlCommand({
	name: "list",
	summary: "List configured Roaster review definitions.",
	description: REVIEW_LIST_DESCRIPTION,
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
	commands: [roasterReviewListCommand],
});

export type RoasterReviewListRequest = ReviewListRequest;
