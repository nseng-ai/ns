import { z } from "zod";

import { failure, negative, ok, type ClinkrExit } from "@ns/clinkr";
import { optionalEntry, type ExplicitUndefined } from "@ns/core/primitives";
import type { GithubPrFeedbackFailure } from "./api.ts";
import type { Result } from "@ns/core/result";

import {
	defineExecOperation,
	gatewayOptions,
	prFeedbackFailureExit,
	prTargetFailureExit,
	type ExecOperation,
	type PrAddressExecContext,
} from "./exec-operation.ts";
import {
	closeReviewThreadsResultSchema,
	openPrsResultSchema,
	prDiscussionCommentsResultSchema,
	prChecksResultSchema,
	prLookupResultSchema,
	prReviewsResultSchema,
	prReviewThreadsResultSchema,
	replyReviewThreadResultSchema,
	resolveReviewThreadResultSchema,
} from "./operation-schemas/collection.ts";
import { collectPrChecks } from "./core/pr-checks.ts";
import {
	closeReviewThreads,
	replyReviewThread,
	resolveReviewThread,
} from "./core/review-thread-mutations.ts";
import { nonEmptyStringCollectionValidationMessage } from "./string-collection-validation.ts";
import { loadJsonInput } from "./json-input.ts";
import {
	discussionCommentsResult,
	lookupResult,
	openPrsResult,
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
const closeReviewThreadsInputSchema = z.looseObject({ threadIds: z.array(z.string()) });
const closeReviewThreadsParseSchema = z.object({
	threadIdsJson: z.string().optional(),
	body: z.string().optional(),
});

type PrNumberRequest = z.output<typeof prNumberSchema>;
type BranchPrRequest = z.output<typeof branchPrSchema>;
type ReviewThreadsRequest = z.output<typeof reviewThreadsSchema>;
type ReplyReviewThreadRequest = z.output<typeof replyReviewThreadSchema>;
type ResolveReviewThreadRequest = z.output<typeof resolveReviewThreadSchema>;
type CloseReviewThreadsRequest = z.output<typeof closeReviewThreadsParseSchema>;
type PrLookupResult = z.output<typeof prLookupResultSchema>;
type OpenPrsResult = z.output<typeof openPrsResultSchema>;
type PrReviewsResult = z.output<typeof prReviewsResultSchema>;
type PrReviewThreadsResult = z.output<typeof prReviewThreadsResultSchema>;
type PrDiscussionCommentsResult = z.output<typeof prDiscussionCommentsResultSchema>;
type PrChecksResult = z.output<typeof prChecksResultSchema>;
type ReplyReviewThreadResult = z.output<typeof replyReviewThreadResultSchema>;
type ResolveReviewThreadResult = z.output<typeof resolveReviewThreadResultSchema>;
type CloseReviewThreadsResult = z.output<typeof closeReviewThreadsResultSchema>;

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
	defineExecOperation({
		isRepoContextRequired: true,
		resultSchema: closeReviewThreadsResultSchema,
		spec: {
			name: "close-review-threads",
			description: "Reply to and/or resolve GitHub PR review threads in bulk.",
			schema: closeReviewThreadsParseSchema,
			handler: runCloseReviewThreads,
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
	request: {
		prNumber?: ExplicitUndefined<"external-mirror", number>;
	},
): Promise<ClinkrExit<PrChecksResult>> {
	const result = await collectPrChecks({
		git: ctx.context.git,
		prFeedback: ctx.context.prFeedback,
		gatewayOptions: gatewayOptions(ctx),
		...optionalEntry("prNumber", request.prNumber),
	});
	switch (result.type) {
		case "ok":
			return ok(result.checks);
		case "git_failure":
		case "pr_feedback_failure":
		case "detached_head":
			return prTargetFailureExit(result);
	}
}

async function runReplyReviewThread(
	ctx: PrAddressExecContext,
	request: ReplyReviewThreadRequest,
): Promise<ClinkrExit<ReplyReviewThreadResult>> {
	const result = await replyReviewThread({
		prFeedback: ctx.context.prFeedback,
		gatewayOptions: gatewayOptions(ctx),
		threadId: request.threadId,
		body: request.body,
	});
	switch (result.type) {
		case "ok":
			return ok(result.reply);
		case "pr_feedback_failure":
			return prFeedbackFailureExit(result.message, result.failure);
	}
}

async function runResolveReviewThread(
	ctx: PrAddressExecContext,
	request: ResolveReviewThreadRequest,
): Promise<ClinkrExit<ResolveReviewThreadResult>> {
	const result = await resolveReviewThread({
		prFeedback: ctx.context.prFeedback,
		gatewayOptions: gatewayOptions(ctx),
		threadId: request.threadId,
	});
	switch (result.type) {
		case "ok":
			return ok(result.resolution);
		case "pr_feedback_failure":
			return prFeedbackFailureExit(result.message, result.failure);
	}
}

async function runCloseReviewThreads(
	ctx: PrAddressExecContext,
	request: CloseReviewThreadsRequest,
): Promise<ClinkrExit<CloseReviewThreadsResult>> {
	const payloadResult = await loadJsonInput({
		optionValue: request.threadIdsJson,
		commandName: "close-review-threads",
		inputDescription: "review-thread IDs JSON payload",
		optionName: "--thread-ids-json",
		schema: closeReviewThreadsInputSchema,
		stdin: ctx.stdin,
	});
	if (payloadResult.type === "error")
		return failure(payloadResult.error.errorType, payloadResult.error.message);

	const threadIds = payloadResult.value.threadIds.map((threadId) => threadId.trim());
	const validationMessage = closeReviewThreadsValidationMessage(threadIds, request.body);
	if (validationMessage !== null) return failure("invalid-request", validationMessage);

	const result = await closeReviewThreads({
		prFeedback: ctx.context.prFeedback,
		gatewayOptions: gatewayOptions(ctx),
		threadIds,
		...(request.body === undefined ? {} : { body: request.body }),
	});
	if (result.failed === 0) return ok(result);
	return negative(`Failed to close ${result.failed} of ${result.requested} review threads`, {
		data: result,
	});
}

function closeReviewThreadsValidationMessage(
	threadIds: readonly string[],
	body: string | undefined,
): string | null {
	const threadIdsMessage = nonEmptyStringCollectionValidationMessage(threadIds, {
		commandName: "close-review-threads",
		emptyItemLabel: "thread ID",
		itemLabel: "thread ID",
		duplicateCollectionLabel: "thread IDs",
	});
	if (threadIdsMessage !== null) return threadIdsMessage;
	if (body !== undefined && body.trim() === "")
		return "close-review-threads requires --body to be non-empty when supplied.";
	return null;
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
