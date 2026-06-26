import type { z } from "zod";

import type {
	GithubPrDiscussionComment,
	GithubPrReview,
	GithubPrReviewComment,
	GithubPrReviewThread,
	GithubPrSummary,
} from "./types.ts";
import type {
	ghAuthorSchema,
	ghDiscussionCommentSchema,
	ghReviewCommentSchema,
	ghReviewSchema,
	ghReviewThreadSchema,
	prSummarySchema,
} from "./schemas.ts";

export function normalizePrSummary(summary: z.infer<typeof prSummarySchema>): GithubPrSummary {
	return {
		number: summary.number,
		title: summary.title,
		url: summary.url,
		headRefName: summary.headRefName,
		baseRefName: summary.baseRefName,
		state: summary.state,
		headRefOid: summary.headRefOid,
	};
}

export function normalizeReview(review: z.infer<typeof ghReviewSchema>): GithubPrReview {
	return {
		id: review.id,
		author: normalizeAuthor(review.author),
		body: review.body,
		state: review.state,
		submittedAt: review.submittedAt,
	};
}

export function normalizeReviewThread(
	thread: z.infer<typeof ghReviewThreadSchema>,
): GithubPrReviewThread {
	return {
		id: thread.id,
		path: thread.path,
		line: thread.line,
		startLine: thread.startLine ?? null,
		isResolved: thread.isResolved,
		isOutdated: thread.isOutdated,
		comments: thread.comments.nodes.map(normalizeReviewComment),
	};
}

export function normalizeReviewComment(
	comment: z.infer<typeof ghReviewCommentSchema>,
): GithubPrReviewComment {
	return {
		id: comment.numericId,
		body: comment.body,
		author: normalizeAuthor(comment.author),
		path: comment.path,
		line: comment.line,
		startLine: comment.startLine ?? null,
		createdAt: comment.createdAt,
		...(comment.url === undefined ? {} : { url: comment.url }),
	};
}

export function normalizeDiscussionComment(
	comment: z.infer<typeof ghDiscussionCommentSchema>,
): GithubPrDiscussionComment {
	return {
		id: comment.numericId,
		body: comment.body,
		author: normalizeAuthor(comment.user ?? comment.author),
		url: comment.html_url ?? comment.url,
	};
}

function normalizeAuthor(author: z.infer<typeof ghAuthorSchema>): string {
	if (typeof author === "string") return author;
	return author?.login ?? "";
}
