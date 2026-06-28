import { z } from "zod";

import { failure, ok, type ClinkrExit } from "@sdl/clinkr";
import type { GithubPrFeedbackFailure, GithubPrSummary } from "./api.ts";
import type { Result } from "@sdl/core/result";

import {
	defineExecOperation,
	gatewayFailureExit,
	gatewayOptions,
	prFeedbackFailureExit,
	type ExecOperation,
	type PrAddressExecContext,
} from "./exec-operation.ts";
import {
	openPrsResultSchema,
	prDiscussionCommentsResultSchema,
	prChecksResultSchema,
	prLookupResultSchema,
	prReviewsResultSchema,
	prReviewThreadsResultSchema,
	replyReviewThreadResultSchema,
	resolveReviewThreadResultSchema,
} from "./operation-schemas/collection.ts";
import {
	discussionCommentsResult,
	lookupResult,
	prChecksResult,
	openPrsResult,
	replyReviewThreadResult,
	resolveReviewThreadResult,
	reviewsResult,
	reviewThreadsResult,
} from "./primitive-results.ts";

const prNumberSchema = z.object({ prNumber: z.int() });
const branchPrSchema = z.object({ branch: z.string() });
const emptySchema = z.object({});
const reviewThreadsSchema = z.object({
	prNumber: z.int(),
	includeResolved: z.boolean().default(false),
});
const replyReviewThreadSchema = z.object({
	threadId: z.string(),
	body: z.string(),
});
const resolveReviewThreadSchema = z.object({ threadId: z.string() });

type PrNumberRequest = z.output<typeof prNumberSchema>;
type BranchPrRequest = z.output<typeof branchPrSchema>;
type ReviewThreadsRequest = z.output<typeof reviewThreadsSchema>;
type ReplyReviewThreadRequest = z.output<typeof replyReviewThreadSchema>;
type ResolveReviewThreadRequest = z.output<typeof resolveReviewThreadSchema>;
type PrLookupResult = z.output<typeof prLookupResultSchema>;
type OpenPrsResult = z.output<typeof openPrsResultSchema>;
type PrReviewsResult = z.output<typeof prReviewsResultSchema>;
type PrReviewThreadsResult = z.output<typeof prReviewThreadsResultSchema>;
type PrDiscussionCommentsResult = z.output<typeof prDiscussionCommentsResultSchema>;
type PrChecksResult = z.output<typeof prChecksResultSchema>;
type ReplyReviewThreadResult = z.output<typeof replyReviewThreadResultSchema>;
type ResolveReviewThreadResult = z.output<typeof resolveReviewThreadResultSchema>;

export const primitiveOperations: readonly ExecOperation[] = [
	defineExecOperation({
		isRepoContextRequired: true,
		resultSchema: prLookupResultSchema,
		spec: {
			name: "pr-details",
			description: "Return structured details for one GitHub PR.",
			schema: prNumberSchema,
			handler: runPrDetails,
		},
	}),
	defineExecOperation({
		isRepoContextRequired: true,
		resultSchema: prLookupResultSchema,
		spec: {
			name: "branch-pr",
			description: "Return the open GitHub PR for a branch.",
			schema: branchPrSchema,
			handler: runBranchPr,
		},
	}),
	defineExecOperation({
		isRepoContextRequired: true,
		resultSchema: openPrsResultSchema,
		spec: {
			name: "open-prs",
			description: "List open GitHub PRs.",
			schema: emptySchema,
			handler: runOpenPrs,
		},
	}),
	defineExecOperation({
		isRepoContextRequired: true,
		resultSchema: prReviewsResultSchema,
		spec: {
			name: "pr-reviews",
			description: "Return PR-level review bodies for one GitHub PR.",
			schema: prNumberSchema,
			handler: runPrReviews,
		},
	}),
	defineExecOperation({
		isRepoContextRequired: true,
		resultSchema: prReviewThreadsResultSchema,
		spec: {
			name: "pr-review-threads",
			description: "Return hydrated review threads for one GitHub PR.",
			schema: reviewThreadsSchema,
			handler: runPrReviewThreads,
		},
	}),
	defineExecOperation({
		isRepoContextRequired: true,
		resultSchema: prDiscussionCommentsResultSchema,
		spec: {
			name: "pr-discussion-comments",
			description: "Return PR discussion comments for one GitHub PR.",
			schema: prNumberSchema,
			handler: runPrDiscussionComments,
		},
	}),
	defineExecOperation({
		isRepoContextRequired: true,
		resultSchema: prChecksResultSchema,
		spec: {
			name: "pr-checks",
			description: "Return normalized GitHub PR checks for one PR or the current branch PR.",
			schema: z.object({ prNumber: z.int().optional() }),
			handler: runPrChecks,
		},
	}),
	defineExecOperation({
		isRepoContextRequired: true,
		resultSchema: replyReviewThreadResultSchema,
		spec: {
			name: "reply-review-thread",
			description: "Reply to one GitHub PR review thread.",
			schema: replyReviewThreadSchema,
			handler: runReplyReviewThread,
		},
	}),
	defineExecOperation({
		isRepoContextRequired: true,
		resultSchema: resolveReviewThreadResultSchema,
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
): Promise<ClinkrExit<PrLookupResult>> {
	return await prFeedbackResultExit({
		result: ctx.context.prFeedback.getPr({
			...gatewayOptions(ctx),
			prNumber: request.prNumber,
		}),
		failurePrefix: `Failed to look up PR ${request.prNumber}`,
		toPayload: lookupResult,
	});
}

async function runBranchPr(
	ctx: PrAddressExecContext,
	request: BranchPrRequest,
): Promise<ClinkrExit<PrLookupResult>> {
	return await prFeedbackResultExit({
		result: ctx.context.prFeedback.getPrForBranch({
			...gatewayOptions(ctx),
			branch: request.branch,
		}),
		failurePrefix: `Failed to look up PR for branch ${request.branch}`,
		toPayload: lookupResult,
	});
}

async function runOpenPrs(ctx: PrAddressExecContext): Promise<ClinkrExit<OpenPrsResult>> {
	return await prFeedbackResultExit({
		result: ctx.context.prFeedback.listOpenPrs(gatewayOptions(ctx)),
		failurePrefix: "Failed to list open PRs",
		toPayload: openPrsResult,
	});
}

async function runPrReviews(
	ctx: PrAddressExecContext,
	request: PrNumberRequest,
): Promise<ClinkrExit<PrReviewsResult>> {
	return await prFeedbackResultExit({
		result: ctx.context.prFeedback.getPrReviews({
			...gatewayOptions(ctx),
			prNumber: request.prNumber,
		}),
		failurePrefix: `Failed to fetch reviews for PR ${request.prNumber}`,
		toPayload: reviewsResult,
	});
}

async function runPrReviewThreads(
	ctx: PrAddressExecContext,
	request: ReviewThreadsRequest,
): Promise<ClinkrExit<PrReviewThreadsResult>> {
	return await prFeedbackResultExit({
		result: ctx.context.prFeedback.getPrReviewThreads({
			...gatewayOptions(ctx),
			prNumber: request.prNumber,
		}),
		failurePrefix: `Failed to fetch review threads for PR ${request.prNumber}`,
		toPayload: (threads) =>
			reviewThreadsResult(
				request.includeResolved ? threads : threads.filter((thread) => !thread.isResolved),
			),
	});
}

async function runPrDiscussionComments(
	ctx: PrAddressExecContext,
	request: PrNumberRequest,
): Promise<ClinkrExit<PrDiscussionCommentsResult>> {
	return await prFeedbackResultExit({
		result: ctx.context.prFeedback.getPrDiscussionComments({
			...gatewayOptions(ctx),
			prNumber: request.prNumber,
		}),
		failurePrefix: `Failed to fetch discussion comments for PR ${request.prNumber}`,
		toPayload: discussionCommentsResult,
	});
}

async function runPrChecks(
	ctx: PrAddressExecContext,
	request: { prNumber?: number | undefined },
): Promise<ClinkrExit<PrChecksResult>> {
	const target = await resolveChecksTarget(ctx, request.prNumber);
	if (target.type === "failure") return target.exit;
	if (target.type === "miss")
		return ok(prChecksResult({ found: false, pr: null, branch: target.branch }));
	const checks = await ctx.context.prFeedback.getPrChecks({
		...gatewayOptions(ctx),
		prNumber: target.pr.number,
	});
	if (!checks.ok)
		return prFeedbackFailureExit(`Failed to fetch checks for PR ${target.pr.number}`, checks.error);
	return ok(
		prChecksResult({ found: true, pr: target.pr, branch: target.branch, checks: checks.value }),
	);
}

async function resolveChecksTarget(
	ctx: PrAddressExecContext,
	prNumber: number | undefined,
): Promise<
	| { type: "found"; pr: GithubPrSummary; branch: string | null }
	| { type: "miss"; branch: string | null }
	| { type: "failure"; exit: ClinkrExit<PrChecksResult> }
> {
	if (prNumber !== undefined) {
		const lookup = await ctx.context.prFeedback.getPr({ ...gatewayOptions(ctx), prNumber });
		if (!lookup.ok)
			return {
				type: "failure",
				exit: prFeedbackFailureExit(`Failed to look up PR ${prNumber}`, lookup.error),
			};
		if (!lookup.value.found) return { type: "miss", branch: null };
		return { type: "found", pr: lookup.value.pr, branch: null };
	}
	const branch = await ctx.context.git.currentBranch(gatewayOptions(ctx));
	if (branch.type === "failure")
		return {
			type: "failure",
			exit: gatewayFailureExit("Failed to determine current branch", branch.error),
		};
	if (branch.type === "detached")
		return {
			type: "failure",
			exit: failure(
				"detached_head",
				"Detached HEAD: pr-checks requires a checked-out branch or --pr-number.",
			),
		};
	const lookup = await ctx.context.prFeedback.getPrForBranch({
		...gatewayOptions(ctx),
		branch: branch.branch,
	});
	if (!lookup.ok)
		return {
			type: "failure",
			exit: prFeedbackFailureExit(`Failed to look up PR for branch ${branch.branch}`, lookup.error),
		};
	if (!lookup.value.found) return { type: "miss", branch: branch.branch };
	return { type: "found", pr: lookup.value.pr, branch: branch.branch };
}

async function runReplyReviewThread(
	ctx: PrAddressExecContext,
	request: ReplyReviewThreadRequest,
): Promise<ClinkrExit<ReplyReviewThreadResult>> {
	return await prFeedbackResultExit({
		result: ctx.context.prFeedback.replyToReviewThread({
			...gatewayOptions(ctx),
			threadId: request.threadId,
			body: request.body,
		}),
		failurePrefix: `Failed to reply to review thread ${request.threadId}`,
		toPayload: (reply) =>
			replyReviewThreadResult({ threadId: reply.threadId, comment: reply.comment }),
	});
}

async function runResolveReviewThread(
	ctx: PrAddressExecContext,
	request: ResolveReviewThreadRequest,
): Promise<ClinkrExit<ResolveReviewThreadResult>> {
	return await prFeedbackResultExit({
		result: ctx.context.prFeedback.resolveReviewThread({
			...gatewayOptions(ctx),
			threadId: request.threadId,
		}),
		failurePrefix: `Failed to resolve review thread ${request.threadId}`,
		toPayload: (state) =>
			resolveReviewThreadResult({ threadId: state.threadId, isResolved: state.isResolved }),
	});
}

async function prFeedbackResultExit<TValue, TPayload>(options: {
	readonly result: Promise<Result<TValue, GithubPrFeedbackFailure>>;
	readonly failurePrefix: string;
	readonly toPayload: (value: TValue) => TPayload;
}): Promise<ClinkrExit<TPayload>> {
	const result = await options.result;
	if (!result.ok) return prFeedbackFailureExit(options.failurePrefix, result.error);
	return ok(options.toPayload(result.value));
}
