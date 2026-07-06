import type {
	GithubPrFeedbackFailure,
	PrFeedbackGithubGateway,
	GithubReviewThreadState,
} from "../api.ts";
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
	failure: GithubPrFeedbackFailure;
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

export interface ReviewThreadMutationContext {
	prFeedback: PrFeedbackGithubGateway;
	gatewayOptions: GatewayOptions;
}

export interface ReplyReviewThreadOptions extends ReviewThreadMutationContext {
	threadId: string;
	body: string;
}

export interface ResolveReviewThreadOptions extends ReviewThreadMutationContext {
	threadId: string;
}

export interface CloseReviewThreadsOptions extends ReviewThreadMutationContext {
	threadIds: readonly string[];
	body?: string;
}

const REVIEW_THREAD_RESOLVE_BATCH_SIZE = 25;

interface CloseReviewThreadsPendingEntry {
	threadId: string;
	reply: ReplyReviewThreadPayload | null;
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
	const entriesByThreadId = new Map<string, CloseReviewThreadsEntry>();
	const resolveCandidates: CloseReviewThreadsPendingEntry[] = [];
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
				entriesByThreadId.set(threadId, {
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
		resolveCandidates.push({ threadId, reply });
	}

	const resolveEntries = await closeReviewThreadsResolveEntries(options, resolveCandidates);
	for (const entry of resolveEntries) {
		if (entry.error === null) resolved += 1;
		else failed += 1;
		entriesByThreadId.set(entry.thread_id, entry);
	}

	const entries = options.threadIds.map((threadId) => {
		const entry = entriesByThreadId.get(threadId);
		if (entry === undefined) throw new Error(`Missing close result for review thread ${threadId}`);
		return entry;
	});

	return {
		requested: options.threadIds.length,
		replied,
		resolved,
		failed,
		entries,
		summary: { succeeded: options.threadIds.length - failed, failed },
	};
}

async function closeReviewThreadsResolveEntries(
	options: CloseReviewThreadsOptions,
	candidates: readonly CloseReviewThreadsPendingEntry[],
): Promise<CloseReviewThreadsEntry[]> {
	const entries: CloseReviewThreadsEntry[] = [];
	for (let index = 0; index < candidates.length; index += REVIEW_THREAD_RESOLVE_BATCH_SIZE) {
		const chunk = candidates.slice(index, index + REVIEW_THREAD_RESOLVE_BATCH_SIZE);
		entries.push(...(await closeReviewThreadsResolveChunk(options, chunk)));
	}
	return entries;
}

async function closeReviewThreadsResolveChunk(
	options: CloseReviewThreadsOptions,
	candidates: readonly CloseReviewThreadsPendingEntry[],
): Promise<CloseReviewThreadsEntry[]> {
	if (options.prFeedback.resolveReviewThreads === undefined) {
		return await closeReviewThreadsResolveSingly(options, candidates);
	}
	const bulkResult = await options.prFeedback.resolveReviewThreads({
		...options.gatewayOptions,
		threadIds: candidates.map((candidate) => candidate.threadId),
	});
	if (!bulkResult.ok) return await closeReviewThreadsResolveSingly(options, candidates);

	const statesByThreadId = new Map(
		bulkResult.value.map((state) => [state.threadId, state] as const),
	);
	if (statesByThreadId.size !== candidates.length) {
		return await closeReviewThreadsResolveSingly(options, candidates);
	}

	const entries: CloseReviewThreadsEntry[] = [];
	for (const candidate of candidates) {
		const state = statesByThreadId.get(candidate.threadId);
		if (state === undefined) return await closeReviewThreadsResolveSingly(options, candidates);
		entries.push(closeReviewThreadsSuccessEntry(candidate, state));
	}
	return entries;
}

async function closeReviewThreadsResolveSingly(
	options: CloseReviewThreadsOptions,
	candidates: readonly CloseReviewThreadsPendingEntry[],
): Promise<CloseReviewThreadsEntry[]> {
	const entries: CloseReviewThreadsEntry[] = [];
	for (const candidate of candidates) {
		const resolutionResult = await resolveReviewThread({
			prFeedback: options.prFeedback,
			gatewayOptions: options.gatewayOptions,
			threadId: candidate.threadId,
		});
		if (resolutionResult.type === "pr_feedback_failure") {
			entries.push({
				thread_id: candidate.threadId,
				reply: candidate.reply,
				resolution: null,
				error: closeReviewThreadsEntryError("resolve", resolutionResult),
			});
			continue;
		}
		entries.push({
			thread_id: candidate.threadId,
			reply: candidate.reply,
			resolution: resolutionResult.resolution,
			error: null,
		});
	}
	return entries;
}

function closeReviewThreadsSuccessEntry(
	candidate: CloseReviewThreadsPendingEntry,
	state: GithubReviewThreadState,
): CloseReviewThreadsEntry {
	return {
		thread_id: candidate.threadId,
		reply: candidate.reply,
		resolution: { thread_id: state.threadId, is_resolved: state.isResolved },
		error: null,
	};
}

function closeReviewThreadsEntryError(
	stage: CloseReviewThreadsErrorStage,
	result: Extract<
		ReplyReviewThreadMutationResult | ResolveReviewThreadMutationResult,
		{ type: "pr_feedback_failure" }
	>,
): CloseReviewThreadsEntryError {
	return { stage, message: result.message, code: `${stage}-failed`, failure: result.failure };
}
