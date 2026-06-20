import { z } from "zod";

import { failure, ok, type ClinkrExit } from "@asdl/clinkr";
import type {
	GithubPrDiscussionComment,
	GithubPrFeedbackFailure,
	GithubPrReview,
	GithubPrReviewComment,
	GithubPrReviewThread,
	GithubPrSummary,
} from "@asdl/core/github-pr-feedback";

import {
	defineExecOperation,
	gatewayOptions,
	type ExecOperation,
	type PrAddressExecContext,
} from "./exec-operation.ts";

const prNumberSchema = z.object({ pr_number: z.int() });
const branchPrSchema = z.object({ branch: z.string() });
const emptySchema = z.object({});
const reviewThreadsSchema = z.object({
	pr_number: z.int(),
	include_resolved: z.boolean().default(false),
});
const replyReviewThreadSchema = z.object({
	thread_id: z.string(),
	body: z.string(),
});
const resolveReviewThreadSchema = z.object({ thread_id: z.string() });

type PrNumberRequest = z.output<typeof prNumberSchema>;
type BranchPrRequest = z.output<typeof branchPrSchema>;
type ReviewThreadsRequest = z.output<typeof reviewThreadsSchema>;
type ReplyReviewThreadRequest = z.output<typeof replyReviewThreadSchema>;
type ResolveReviewThreadRequest = z.output<typeof resolveReviewThreadSchema>;

export const primitiveOperations: readonly ExecOperation[] = [
	defineExecOperation({
		isRepoContextRequired: true,
		spec: {
			name: "pr-details",
			description: "Return structured details for one GitHub PR.",
			schema: prNumberSchema,
			handler: runPrDetails,
		},
	}),
	defineExecOperation({
		isRepoContextRequired: true,
		spec: {
			name: "branch-pr",
			description: "Return the open GitHub PR for a branch.",
			schema: branchPrSchema,
			handler: runBranchPr,
		},
	}),
	defineExecOperation({
		isRepoContextRequired: true,
		spec: {
			name: "open-prs",
			description: "List open GitHub PRs.",
			schema: emptySchema,
			handler: runOpenPrs,
		},
	}),
	defineExecOperation({
		isRepoContextRequired: true,
		spec: {
			name: "pr-reviews",
			description: "Return PR-level review bodies for one GitHub PR.",
			schema: prNumberSchema,
			handler: runPrReviews,
		},
	}),
	defineExecOperation({
		isRepoContextRequired: true,
		spec: {
			name: "pr-review-threads",
			description: "Return hydrated review threads for one GitHub PR.",
			schema: reviewThreadsSchema,
			handler: runPrReviewThreads,
		},
	}),
	defineExecOperation({
		isRepoContextRequired: true,
		spec: {
			name: "pr-discussion-comments",
			description: "Return PR discussion comments for one GitHub PR.",
			schema: prNumberSchema,
			handler: runPrDiscussionComments,
		},
	}),
	defineExecOperation({
		isRepoContextRequired: true,
		spec: {
			name: "reply-review-thread",
			description: "Reply to one GitHub PR review thread.",
			schema: replyReviewThreadSchema,
			handler: runReplyReviewThread,
		},
	}),
	defineExecOperation({
		isRepoContextRequired: true,
		spec: {
			name: "resolve-review-thread",
			description: "Resolve one GitHub PR review thread.",
			schema: resolveReviewThreadSchema,
			handler: runResolveReviewThread,
		},
	}),
];

async function runPrDetails(
	ctx: PrAddressExecContext,
	request: PrNumberRequest,
): Promise<ClinkrExit<unknown>> {
	const result = await ctx.context.prFeedback.getPr({
		...gatewayOptions(ctx),
		prNumber: request.pr_number,
	});
	if (result.type === "failure")
		return prFeedbackFailureExit(`Failed to look up PR ${request.pr_number}`, result.failure);
	return ok(lookupResult(result));
}

async function runBranchPr(
	ctx: PrAddressExecContext,
	request: BranchPrRequest,
): Promise<ClinkrExit<unknown>> {
	const result = await ctx.context.prFeedback.getPrForBranch({
		...gatewayOptions(ctx),
		branch: request.branch,
	});
	if (result.type === "failure")
		return prFeedbackFailureExit(
			`Failed to look up PR for branch ${request.branch}`,
			result.failure,
		);
	return ok(lookupResult(result));
}

async function runOpenPrs(ctx: PrAddressExecContext): Promise<ClinkrExit<unknown>> {
	const result = await ctx.context.prFeedback.listOpenPrs(gatewayOptions(ctx));
	if (!result.ok) return prFeedbackFailureExit("Failed to list open PRs", result.error);
	return ok({ prs: result.value.map(prSummaryResult) });
}

async function runPrReviews(
	ctx: PrAddressExecContext,
	request: PrNumberRequest,
): Promise<ClinkrExit<unknown>> {
	const result = await ctx.context.prFeedback.getPrReviews({
		...gatewayOptions(ctx),
		prNumber: request.pr_number,
	});
	if (!result.ok)
		return prFeedbackFailureExit(
			`Failed to fetch reviews for PR ${request.pr_number}`,
			result.error,
		);
	return ok({ reviews: result.value.map(reviewResult) });
}

async function runPrReviewThreads(
	ctx: PrAddressExecContext,
	request: ReviewThreadsRequest,
): Promise<ClinkrExit<unknown>> {
	const result = await ctx.context.prFeedback.getPrReviewThreads({
		...gatewayOptions(ctx),
		prNumber: request.pr_number,
	});
	if (!result.ok)
		return prFeedbackFailureExit(
			`Failed to fetch review threads for PR ${request.pr_number}`,
			result.error,
		);
	const threads = request.include_resolved
		? result.value
		: result.value.filter((thread) => !thread.isResolved);
	return ok({ review_threads: threads.map(reviewThreadResult) });
}

async function runPrDiscussionComments(
	ctx: PrAddressExecContext,
	request: PrNumberRequest,
): Promise<ClinkrExit<unknown>> {
	const result = await ctx.context.prFeedback.getPrDiscussionComments({
		...gatewayOptions(ctx),
		prNumber: request.pr_number,
	});
	if (!result.ok)
		return prFeedbackFailureExit(
			`Failed to fetch discussion comments for PR ${request.pr_number}`,
			result.error,
		);
	return ok({ discussion_comments: result.value.map(discussionCommentResult) });
}

async function runReplyReviewThread(
	ctx: PrAddressExecContext,
	request: ReplyReviewThreadRequest,
): Promise<ClinkrExit<unknown>> {
	const result = await ctx.context.prFeedback.replyToReviewThread({
		...gatewayOptions(ctx),
		threadId: request.thread_id,
		body: request.body,
	});
	if (!result.ok)
		return prFeedbackFailureExit(
			`Failed to reply to review thread ${request.thread_id}`,
			result.error,
		);
	return ok({
		thread_id: result.value.threadId,
		comment: reviewCommentResult(result.value.comment),
	});
}

async function runResolveReviewThread(
	ctx: PrAddressExecContext,
	request: ResolveReviewThreadRequest,
): Promise<ClinkrExit<unknown>> {
	const result = await ctx.context.prFeedback.resolveReviewThread({
		...gatewayOptions(ctx),
		threadId: request.thread_id,
	});
	if (!result.ok)
		return prFeedbackFailureExit(
			`Failed to resolve review thread ${request.thread_id}`,
			result.error,
		);
	return ok({ thread_id: result.value.threadId, is_resolved: result.value.isResolved });
}

function prFeedbackFailureExit(prefix: string, gatewayFailure: GithubPrFeedbackFailure) {
	return failure("pr_gateway_failure", `${prefix}: ${failureDetail(gatewayFailure)}`);
}

function failureDetail(gatewayFailure: GithubPrFeedbackFailure): string {
	const details = gatewayFailure.details ?? {};
	const stderr = typeof details.stderr === "string" ? details.stderr : null;
	const stdout = typeof details.stdout === "string" ? details.stdout : null;
	if (stderr !== null && stderr.trim() !== "") return stderr;
	if (stdout !== null && stdout.trim() !== "") return stdout;
	if (gatewayFailure.message.trim() !== "") return gatewayFailure.message;
	return gatewayFailure.code;
}

function lookupResult(
	result: Exclude<
		Awaited<ReturnType<PrAddressExecContext["context"]["prFeedback"]["getPr"]>>,
		{ type: "failure" }
	>,
) {
	if (result.type === "miss") {
		return {
			found: false,
			pr: null,
			miss: { stderr: result.stderr, returncode: result.exitCode },
		};
	}
	return { found: true, pr: prSummaryResult(result.pr), miss: null };
}

function prSummaryResult(pr: GithubPrSummary) {
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

function reviewResult(review: GithubPrReview) {
	return {
		id: review.id,
		author: review.author,
		body: review.body,
		state: review.state,
		submitted_at: review.submittedAt,
	};
}

function reviewThreadResult(thread: GithubPrReviewThread) {
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

function reviewCommentResult(comment: GithubPrReviewComment) {
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

function discussionCommentResult(comment: GithubPrDiscussionComment) {
	return { id: comment.id, body: comment.body, author: comment.author, url: comment.url };
}
