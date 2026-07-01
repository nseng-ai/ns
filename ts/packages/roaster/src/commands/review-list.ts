import { defineExtension } from "sdl-sdk";

import {
	renderReviewList,
	reviewListRequestSchema,
	reviewListResultSchema,
	runReviewList,
	type ReviewListRequest,
} from "../operations/cli-operations.ts";
import { roasterSdlCommand } from "../sdl/command.ts";

const REVIEW_LIST_DESCRIPTION = `List configured Roaster review definitions.

This SDL command adapts SDL execution context to Roaster's gateway-injected runtime, then delegates through the curated @sdl/roaster/api facade. Discovery and group help read only manifest metadata; selected help loads this command for its schema and detailed description without running git, Branch Memory, model, or GitHub operations.`;

export interface ReviewListCommandMetadata {
	readonly name: string;
	readonly summary: string;
	readonly description: string;
}

export function createReviewListCommand(metadata: ReviewListCommandMetadata) {
	return roasterSdlCommand({
		...metadata,
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
}

export const roasterReviewListCommand = createReviewListCommand({
	name: "list",
	summary: "List configured Roaster review definitions.",
	description: REVIEW_LIST_DESCRIPTION,
});

export default defineExtension({
	commands: [roasterReviewListCommand],
});

export type RoasterReviewListRequest = ReviewListRequest;
