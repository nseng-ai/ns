import type { GithubPrFeedbackFailure, GithubPrFeedbackGateway } from "../api.ts";
import { reviewCommentPayload, type ReviewCommentPayload } from "../review-comment-payload.ts";

import type { GatewayOptions } from "./gateways.ts";

export interface ReplyReviewThreadPayload {
	thread_id: string;
	comment: ReviewCommentPayload;
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

export type CloseReviewThreadsErrorStage = "reply" | "resolve";

export interface CloseReviewThreadsEntryError {
	stage: CloseReviewThreadsErrorStage;
	message: string;
	code: string;
}

export interface CloseReviewThreadsEntry {
	thread_id: string;
	reply: ReplyReviewThreadPayload | null;
	resolution: ResolveReviewThreadPayload | null;
	error: CloseReviewThreadsEntryError | null;
}

export interface CloseReviewThreadsResult {
	requested: number;
	replied: number;
	resolved: number;
	failed: number;
	entries: CloseReviewThreadsEntry[];
	summary: { succeeded: number; failed: number };
}

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

export interface CloseReviewThreadsOptions {
	prFeedback: GithubPrFeedbackGateway;
	gatewayOptions: GatewayOptions;
	threadIds: readonly string[];
	body?: string;
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

export async function closeReviewThreads(
	options: CloseReviewThreadsOptions,
): Promise<CloseReviewThreadsResult> {
	const entries: CloseReviewThreadsEntry[] = [];
	let replied = 0;
	let resolved = 0;
	let failed = 0;

	for (const threadId of options.threadIds) {
		let reply: ReplyReviewThreadPayload | null = null;
		if (options.body !== undefined) {
			const replyResult = await replyReviewThread({
				prFeedback: options.prFeedback,
				gatewayOptions: options.gatewayOptions,
				threadId,
				body: options.body,
			});
			if (replyResult.type === "pr_feedback_failure") {
				failed += 1;
				entries.push({
					thread_id: threadId,
					reply: null,
					resolution: null,
					error: closeReviewThreadsEntryError("reply", replyResult),
				});
				continue;
			}
			reply = replyResult.reply;
			replied += 1;
		}

		const resolutionResult = await resolveReviewThread({
			prFeedback: options.prFeedback,
			gatewayOptions: options.gatewayOptions,
			threadId,
		});
		if (resolutionResult.type === "pr_feedback_failure") {
			failed += 1;
			entries.push({
				thread_id: threadId,
				reply,
				resolution: null,
				error: closeReviewThreadsEntryError("resolve", resolutionResult),
			});
			continue;
		}
		resolved += 1;
		entries.push({
			thread_id: threadId,
			reply,
			resolution: resolutionResult.resolution,
			error: null,
		});
	}

	return {
		requested: options.threadIds.length,
		replied,
		resolved,
		failed,
		entries,
		summary: { succeeded: options.threadIds.length - failed, failed },
	};
}

function closeReviewThreadsEntryError(
	stage: CloseReviewThreadsErrorStage,
	result: Extract<
		ReplyReviewThreadMutationResult | ResolveReviewThreadMutationResult,
		{ type: "pr_feedback_failure" }
	>,
): CloseReviewThreadsEntryError {
	return { stage, message: result.message, code: `${stage}-failed` };
}
