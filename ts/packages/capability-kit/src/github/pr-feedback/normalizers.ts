import type { z } from "zod";

import type {
	GithubPrChangedFile,
	GithubPrDiscussionComment,
	GithubPrRestReview,
	GithubPrRestReviewComment,
	GithubPrReview,
	GithubPrReviewCommentSummary,
	GithubPrReviewComment,
	GithubPrReviewThread,
	GithubPrSummary,
} from "./types.ts";
import type {
	ghAuthorSchema,
	ghChangedFileSchema,
	ghIssueCommentRestSchema,
	ghRestReviewSchema,
	ghReviewCommentRestSchema,
	ghReviewCommentSchema,
	ghReviewCommentSummaryRestSchema,
	ghReviewSchema,
	ghReviewThreadSchema,
	prSummarySchema,
} from "./schemas.ts";

export function normalizePrSummary(summary: z.infer<typeof prSummarySchema>): GithubPrSummary {
	if (summary.headRefOid !== undefined) {
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
	return {
		number: summary.number,
		title: summary.title,
		url: summary.url,
		headRefName: summary.headRefName,
		baseRefName: summary.baseRefName,
		state: summary.state,
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

export function normalizeChangedFile(
	file: z.infer<typeof ghChangedFileSchema>,
): GithubPrChangedFile {
	return {
		path: file.filename ?? file.path ?? "",
		status: file.status,
		patch: file.patch ?? null,
	};
}

export function normalizeReviewCommentSummary(
	comment: z.infer<typeof ghReviewCommentSummaryRestSchema>,
): GithubPrReviewCommentSummary {
	return {
		body: comment.body,
		author: normalizeAuthor(comment.user ?? comment.author ?? null),
	};
}

export function normalizeRestReviewComment(
	comment: z.infer<typeof ghReviewCommentRestSchema>,
): GithubPrRestReviewComment {
	return {
		id: comment.numericId,
		reviewId: numericOptional(comment.pull_request_review_id),
		body: comment.body,
		author: normalizeAuthor(comment.user ?? comment.author ?? null),
		path: comment.path,
		line: comment.line ?? null,
		createdAt: comment.created_at ?? "",
		updatedAt: comment.updated_at ?? null,
		inReplyToId: numericOptional(comment.in_reply_to_id),
	};
}

export function normalizeRestReview(
	review: z.infer<typeof ghRestReviewSchema>,
): GithubPrRestReview {
	return {
		id: review.numericId,
		nodeId: review.node_id,
		state: review.state,
		submittedAt: review.submitted_at ?? null,
		commitId: review.commit_id ?? null,
		author: normalizeAuthor(review.user ?? review.author ?? null),
	};
}

export function normalizeDiscussionComment(
	comment: z.infer<typeof ghIssueCommentRestSchema>,
): GithubPrDiscussionComment {
	const url = comment.html_url ?? comment.url ?? "";
	return {
		id: comment.numericId,
		body: comment.body,
		author: normalizeAuthor(comment.user ?? comment.author ?? null),
		url,
		...(comment.created_at === undefined ? {} : { createdAt: comment.created_at }),
		...(comment.updated_at === undefined ? {} : { updatedAt: comment.updated_at }),
	};
}

function numericOptional(value: string | number | null | undefined): number | null {
	if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? value : null;
	if (typeof value !== "string") return null;
	const numeric = Number(value.trim());
	return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

export function normalizeAuthor(author: z.infer<typeof ghAuthorSchema>): string {
	if (typeof author === "string") return author;
	return author?.login ?? "";
}
