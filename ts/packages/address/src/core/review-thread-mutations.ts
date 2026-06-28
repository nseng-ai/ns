import type {
	GithubPrFeedbackFailure,
	GithubPrFeedbackGateway,
	GithubPrReviewComment,
} from "../api.ts";

import type { GatewayOptions } from "./gateways.ts";

export interface ReviewThreadCommentPayload {
	id: number;
	body: string;
	author: string;
	path: string;
	line: number | null;
	start_line: number | null;
	created_at: string;
	url?: string;
}

export interface ReplyReviewThreadPayload {
	thread_id: string;
	comment: ReviewThreadCommentPayload;
}

export interface ResolveReviewThreadPayload {
	thread_id: string;
	is_resolved: boolean;
}

export type ReplyReviewThreadMutationResult =
	| { type: "ok"; reply: ReplyReviewThreadPayload }
	| { type: "pr_feedback_failure"; message: string; failure: GithubPrFeedbackFailure };

export type ResolveReviewThreadMutationResult =
	| { type: "ok"; resolution: ResolveReviewThreadPayload }
	| { type: "pr_feedback_failure"; message: string; failure: GithubPrFeedbackFailure };

export interface ReplyReviewThreadOptions {
	prFeedback: GithubPrFeedbackGateway;
	gatewayOptions: GatewayOptions;
	threadId: string;
	body: string;
}

export interface ResolveReviewThreadOptions {
	prFeedback: GithubPrFeedbackGateway;
	gatewayOptions: GatewayOptions;
	threadId: string;
}

export async function replyReviewThread(
	options: ReplyReviewThreadOptions,
): Promise<ReplyReviewThreadMutationResult> {
	const result = await options.prFeedback.replyToReviewThread({
		...options.gatewayOptions,
		threadId: options.threadId,
		body: options.body,
	});
	if (!result.ok) {
		return {
			type: "pr_feedback_failure",
			message: `Failed to reply to review thread ${options.threadId}`,
			failure: result.error,
		};
	}
	return {
		type: "ok",
		reply: {
			thread_id: result.value.threadId,
			comment: reviewCommentPayload(result.value.comment),
		},
	};
}

export async function resolveReviewThread(
	options: ResolveReviewThreadOptions,
): Promise<ResolveReviewThreadMutationResult> {
	const result = await options.prFeedback.resolveReviewThread({
		...options.gatewayOptions,
		threadId: options.threadId,
	});
	if (!result.ok) {
		return {
			type: "pr_feedback_failure",
			message: `Failed to resolve review thread ${options.threadId}`,
			failure: result.error,
		};
	}
	return {
		type: "ok",
		resolution: {
			thread_id: result.value.threadId,
			is_resolved: result.value.isResolved,
		},
	};
}

function reviewCommentPayload(comment: GithubPrReviewComment): ReviewThreadCommentPayload {
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
