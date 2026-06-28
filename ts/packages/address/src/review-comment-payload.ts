import type { z } from "zod";

import type { GithubPrReviewComment } from "./api.ts";
import type { prReviewCommentSchema } from "./operation-schemas/collection.ts";

export type ReviewCommentPayload = z.output<typeof prReviewCommentSchema>;

export function reviewCommentPayload(comment: GithubPrReviewComment): ReviewCommentPayload {
	return {
		id: comment.id,
		body: comment.body,
		author: comment.author,
		path: comment.path,
		line: comment.line,
		start_line: comment.startLine,
		created_at: comment.createdAt,
		...(comment.url === undefined ? {} : { url: comment.url }),
	};
}
