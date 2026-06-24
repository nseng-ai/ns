import type { z } from "zod";

import type { GithubStatusChecks } from "@sdl/core/github-status";
import type {
	GithubPrDiscussionComment,
	GithubPrLookupOutcome,
	GithubPrReview,
	GithubPrReviewComment,
	GithubPrReviewThread,
	GithubPrSummary,
} from "@sdl/core/github-pr-feedback";

import type {
	openPrsResultSchema,
	prDiscussionCommentSchema,
	prDiscussionCommentsResultSchema,
	prChecksResultSchema,
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
	return { review_threads: threads.map(reviewThreadResult) };
}

export function discussionCommentsResult(
	comments: readonly GithubPrDiscussionComment[],
): z.output<typeof prDiscussionCommentsResultSchema> {
	return { discussion_comments: comments.map(discussionCommentResult) };
}

export function prChecksResult(options: {
	readonly found: boolean;
	readonly pr: GithubPrSummary | null;
	readonly branch: string | null;
	readonly checks?: GithubStatusChecks | undefined;
}): z.output<typeof prChecksResultSchema> {
	return {
		found: options.found,
		target: {
			kind: "github_pr",
			pr_number: options.pr?.number ?? null,
			branch: options.branch,
			title: options.pr?.title ?? null,
			url: options.pr?.url ?? null,
			head_ref_name: options.pr?.headRefName ?? null,
			base_ref_name: options.pr?.baseRefName ?? null,
			head_ref_oid: options.pr?.headRefOid ?? null,
		},
		counts: {
			passing: options.checks?.counts.passing ?? 0,
			pending: options.checks?.counts.pending ?? 0,
			failing: options.checks?.counts.failing ?? 0,
			unknown: options.checks?.counts.unknown ?? 0,
			...(options.checks?.counts.hasMore === undefined
				? {}
				: { has_more: options.checks.counts.hasMore }),
		},
		checks:
			options.checks?.checks.map((check) => ({
				bucket: check.bucket,
				kind: check.kind,
				name: check.name,
				workflow_name: check.workflowName,
				status: check.status,
				conclusion: check.conclusion,
				state: check.state,
				started_at: check.startedAt,
				completed_at: check.completedAt,
				created_at: check.createdAt,
				details_url: check.detailsUrl,
				target_url: check.targetUrl,
				identity: check.identity,
			})) ?? [],
	};
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
