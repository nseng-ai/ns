import type { z } from "zod";

import type {
	GithubPrDiscussionComment,
	GithubPrLookupOutcome,
	GithubPrReview,
	GithubPrReviewThread,
	GithubPrSummary,
} from "./api.ts";

import { reviewCommentPayload } from "./review-comment-payload.ts";

import type {
	openPrsResultSchema,
	prDiscussionCommentSchema,
	prDiscussionCommentsResultSchema,
	prLookupResultSchema,
	prReviewsResultSchema,
	prReviewSchema,
	prReviewThreadsResultSchema,
	prReviewThreadSchema,
	prSummarySchema,
} from "./operation-schemas/collection.ts";

export function lookupResult(result: GithubPrLookupOutcome): z.output<typeof prLookupResultSchema> {
	if (!result.found) {
		return {
			found: false,
			pr: null,
			miss: { stderr: result.miss.stderr, returncode: result.miss.exitCode },
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
	return { reviewThreads: threads.map(reviewThreadResult) };
}

export function discussionCommentsResult(
	comments: readonly GithubPrDiscussionComment[],
): z.output<typeof prDiscussionCommentsResultSchema> {
	return { discussionComments: comments.map(discussionCommentResult) };
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
		comments: thread.comments.map(reviewCommentPayload),
	};
}

function discussionCommentResult(
	comment: GithubPrDiscussionComment,
): z.output<typeof prDiscussionCommentSchema> {
	return { id: comment.id, body: comment.body, author: comment.author, url: comment.url };
}
