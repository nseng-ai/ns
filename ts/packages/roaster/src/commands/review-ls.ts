import { defineExtension } from "@sdl/kernel/sdk";

import { type ReviewListRequest } from "../operations/cli-operations.ts";
import { createReviewListCommand } from "./review-list.ts";

const REVIEW_LS_DESCRIPTION = `Alias for sdl roaster review list.`;

export const roasterReviewLsCommand = createReviewListCommand({
	name: "ls",
	summary: "Alias for review list.",
	description: REVIEW_LS_DESCRIPTION,
});

export default defineExtension({
	commands: [roasterReviewLsCommand],
});

export type RoasterReviewLsRequest = ReviewListRequest;
