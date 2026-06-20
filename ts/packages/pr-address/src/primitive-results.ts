import type { z } from "zod";

import type {
	GithubPrDiscussionComment,
	GithubPrLookupResult,
	GithubPrReview,
	GithubPrReviewComment,
	GithubPrReviewThread,
	GithubPrSummary,
} from "@asdl/core/github-pr-feedback";

import type {
	openPrsResultSchema,
	prDiscussionCommentSchema,
	prDiscussionCommentsResultSchema,
	prLookupResultSchema,
	prReviewCommentSchema,
	prReviewsResultSchema,
	prReviewSchema,
	prReviewThreadsResultSchema,
	prReviewThreadSchema,
	prSummarySchema,
	replyReviewThreadResultSchema,
	resolveReviewThreadResultSchema,
} from "./operation-schemas/collection.ts";

export function lookupResult(
	result: Exclude<GithubPrLookupResult, { readonly type: "failure" }>,
): z.output<typeof prLookupResultSchema> {
	if (result.type === "miss") {
		return {
			found: false,
			pr: null,
			miss: { stderr: result.stderr, returncode: result.exitCode },
		};
	}
	return { found: true, pr: prSummaryResult(result.pr), miss: null };
}

export function openPrsResult(
	prs: readonly GithubPrSummary[],
): z.output<typeof openPrsResultSchema> {
	return { prs: prs.map(prSummaryResult) };
}

export function reviewsResult(
	reviews: readonly GithubPrReview[],
): z.output<typeof prReviewsResultSchema> {
	return { reviews: reviews.map(reviewResult) };
}

export function reviewThreadsResult(
	threads: readonly GithubPrReviewThread[],
): z.output<typeof prReviewThreadsResultSchema> {
	return { review_threads: threads.map(reviewThreadResult) };
}

export function discussionCommentsResult(
	comments: readonly GithubPrDiscussionComment[],
): z.output<typeof prDiscussionCommentsResultSchema> {
	return { discussion_comments: comments.map(discussionCommentResult) };
}

export function replyReviewThreadResult(options: {
	readonly threadId: string;
	readonly comment: GithubPrReviewComment;
}): z.output<typeof replyReviewThreadResultSchema> {
	return { thread_id: options.threadId, comment: reviewCommentResult(options.comment) };
}

export function resolveReviewThreadResult(options: {
	readonly threadId: string;
	readonly isResolved: boolean;
}): z.output<typeof resolveReviewThreadResultSchema> {
	return { thread_id: options.threadId, is_resolved: options.isResolved };
}

function prSummaryResult(pr: GithubPrSummary): z.output<typeof prSummarySchema> {
	return {
		number: pr.number,
		title: pr.title,
		url: pr.url,
		head_ref_name: pr.headRefName,
		base_ref_name: pr.baseRefName,
		state: pr.state,
		head_ref_oid: pr.headRefOid ?? null,
	};
}

function reviewResult(review: GithubPrReview): z.output<typeof prReviewSchema> {
	return {
		id: review.id,
		author: review.author,
		body: review.body,
		state: review.state,
		submitted_at: review.submittedAt,
	};
}

function reviewThreadResult(thread: GithubPrReviewThread): z.output<typeof prReviewThreadSchema> {
	return {
		id: thread.id,
		path: thread.path,
		line: thread.line,
		start_line: thread.startLine,
		is_resolved: thread.isResolved,
		is_outdated: thread.isOutdated,
		comments: thread.comments.map(reviewCommentResult),
	};
}

function reviewCommentResult(
	comment: GithubPrReviewComment,
): z.output<typeof prReviewCommentSchema> {
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

function discussionCommentResult(
	comment: GithubPrDiscussionComment,
): z.output<typeof prDiscussionCommentSchema> {
	return { id: comment.id, body: comment.body, author: comment.author, url: comment.url };
}
