import { defineExtension } from "@nseng-ai/kernel/sdk";

import { type ReviewListRequest } from "../operations/cli-operations.ts";
import { createReviewListCommand } from "./list.ts";

const REVIEW_LS_DESCRIPTION = `Alias for ns reviews list.`;

export const reviewsReviewLsCommand = createReviewListCommand({
	name: "ls",
	summary: "Alias for reviews list.",
	description: REVIEW_LS_DESCRIPTION,
});

export default defineExtension({
	commands: [reviewsReviewLsCommand],
});

export type ReviewsReviewLsRequest = ReviewListRequest;
