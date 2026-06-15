import { z } from "zod";

import { failure, ok, toMachineEnvelope, type ClinkrExit, type ClinkrFailureExit } from "@asdl/clinkr";
import { defineExecOperation, gatewayFailureExit, gatewayOptions, type PrAddressExecContext } from "./exec-operation.ts";
import type { PRDiscussionComment, PRReview, PRReviewThread, PrAddressGitHubGateway } from "./gateways.ts";
import { buildGetFeedbackPayloadManifest, type PayloadArtifactStore, type PayloadReference } from "./payload-store.ts";
import { openPayloadStoreFromContext } from "./payload-store-context.ts";
import { prArtifactDescriptor } from "./session-artifacts.ts";
import { compactOperationResult } from "./stdout-mode.ts";

const RESOLUTION_MARKER = "<!-- pr-address:resolved -->";
const SILENCEABLE_EMPTY_REVIEW_STATES = new Set(["COMMENTED", "APPROVED"]);

const getFeedbackParseSchema = z.object({
	pr_number: z.int(),
	include_resolved: z.boolean().default(false),
	include_empty_reviews: z.boolean().default(false),
	payload_mode: z.enum(["inline", "payload"]).default("payload"),
	harness_session_id: z.string().optional(),
});

type GetFeedbackRequest = z.output<typeof getFeedbackParseSchema>;

export interface FeedbackSnapshot {
	pr_number: number;
	reviews: readonly PRReview[];
	review_threads: readonly PRReviewThread[];
	counted_review_threads: readonly PRReviewThread[];
	discussion_comments: readonly PRDiscussionComment[];
}

interface GetFeedbackInlineResult {
	payload_mode: "inline";
	pr_number: number;
	reviews: readonly PRReview[];
	review_threads: readonly PRReviewThread[];
	discussion_comments: readonly PRDiscussionComment[];
}

export const getFeedbackOperation = defineExecOperation({
	isRepoContextRequired: true,
	spec: {
		name: "get-feedback",
		description: "Fetch all PR feedback (reviews, threads, discussion comments) in a single batch.",
		schema: getFeedbackParseSchema,
		positionals: { pr_number: { position: 0 } },
		handler: runGetFeedbackOperation,
	},
	compactOutput: {
		harnessSessionId: (request) => request.harness_session_id,
		buildCompact: async ({ data, store, fullOutput }) => await compactGetFeedbackResult(data, store, fullOutput),
	},
});

async function runGetFeedbackOperation(ctx: PrAddressExecContext, request: GetFeedbackRequest): Promise<ClinkrExit<unknown>> {
	// Python opens the payload store before any gateway fetch; preserve that ordering.
	let store: PayloadArtifactStore | undefined;
	if (request.payload_mode === "payload") {
		const storeResult = await openPayloadStoreFromContext({ ctx, harnessSessionId: request.harness_session_id });
		if (storeResult.type === "error") return failure(storeResult.errorType, storeResult.message);
		store = storeResult.value;
	}

	const snapshotResult = await fetchFeedbackSnapshot({
		gateway: ctx.context.github,
		prNumber: request.pr_number,
		shouldIncludeResolved: request.include_resolved,
		shouldIncludeEmptyReviews: request.include_empty_reviews,
		shouldCountAllReviewThreads: false,
		ctx,
	});
	if (snapshotResult.type === "error") return snapshotResult.exit;
	const snapshot = snapshotResult.snapshot;
	const inlineResult = {
		payload_mode: "inline",
		pr_number: snapshot.pr_number,
		reviews: snapshot.reviews,
		review_threads: snapshot.review_threads,
		discussion_comments: snapshot.discussion_comments,
	};
	if (request.payload_mode === "inline") return ok(inlineResult);
	if (store === undefined) return ok(inlineResult);

	const rawReference = await store.writeJsonArtifact({
		descriptor: prArtifactDescriptor({ prNumber: snapshot.pr_number, kind: "feedback" }),
		role: "raw",
		payload: toMachineEnvelope(ok(inlineResult)),
	});
	if (rawReference.type === "error") return failure(rawReference.errorType, rawReference.message);
	const manifest = buildGetFeedbackManifestFromSnapshot(snapshot, rawReference.value);
	return ok(manifest);
}

async function compactGetFeedbackResult(
	data: unknown,
	store: PayloadArtifactStore,
	fullOutput: PayloadReference,
): Promise<{ type: "ok"; value: Record<string, unknown> } | { type: "error"; errorType: string; message: string }> {
	if (isInlineFeedbackResult(data)) {
		const rawReference = await store.writeJsonArtifact({
			descriptor: prArtifactDescriptor({ prNumber: data.pr_number, kind: "feedback" }),
			role: "raw",
			payload: toMachineEnvelope(ok(data)),
		});
		if (rawReference.type === "error") return { type: "error", errorType: rawReference.errorType, message: rawReference.message };
		const manifest = buildGetFeedbackPayloadManifest({
			payload_reference: rawReference.value,
			pr_number: data.pr_number,
			reviews: data.reviews,
			review_threads: data.review_threads,
			discussion_comments: data.discussion_comments,
		});
		const manifestReference = await store.writeJsonArtifact({
			descriptor: prArtifactDescriptor({ prNumber: data.pr_number, kind: "manifest" }),
			role: "summary",
			payload: manifest,
		});
		if (manifestReference.type === "error") return { type: "error", errorType: manifestReference.errorType, message: manifestReference.message };
		return {
			type: "ok",
			value: compactOperationResult({
				operation: "get-feedback",
				counts: feedbackCounts({ ...data, counted_review_threads: data.review_threads }),
				artifacts: { full_output: fullOutput, produced: [{ kind: "manifest", reference: manifestReference.value }] },
				details: { pr_number: data.pr_number, manifest },
			}),
		};
	}
	const manifest = data as ReturnType<typeof buildGetFeedbackPayloadManifest>;
	const manifestReference = await store.writeJsonArtifact({
		descriptor: prArtifactDescriptor({ prNumber: manifest.pr_number, kind: "manifest" }),
		role: "summary",
		payload: manifest,
	});
	if (manifestReference.type === "error") return { type: "error", errorType: manifestReference.errorType, message: manifestReference.message };
	return {
		type: "ok",
		value: compactOperationResult({
			operation: "get-feedback",
			counts: manifest.counts,
			artifacts: { full_output: fullOutput, produced: [{ kind: "manifest", reference: manifestReference.value }] },
			details: { pr_number: manifest.pr_number, manifest },
		}),
	};
}

function isInlineFeedbackResult(value: unknown): value is GetFeedbackInlineResult {
	return typeof value === "object" && value !== null && "pr_number" in value && "reviews" in value && "review_threads" in value && "discussion_comments" in value;
}

function feedbackCounts(snapshot: FeedbackSnapshot): Record<string, number> {
	const resolvedThreads = snapshot.review_threads.filter((thread) => thread.is_resolved).length;
	return {
		reviews: snapshot.reviews.length,
		review_threads: snapshot.review_threads.length,
		unresolved_review_threads: snapshot.review_threads.length - resolvedThreads,
		resolved_review_threads: resolvedThreads,
		thread_comments: snapshot.review_threads.reduce((total, thread) => total + thread.comments.length, 0),
		discussion_comments: snapshot.discussion_comments.length,
	};
}

export function buildGetFeedbackManifestFromSnapshot(snapshot: FeedbackSnapshot, payloadReference: PayloadReference): unknown {
	return buildGetFeedbackPayloadManifest({
		payload_reference: payloadReference,
		pr_number: snapshot.pr_number,
		reviews: snapshot.reviews,
		review_threads: snapshot.review_threads,
		discussion_comments: snapshot.discussion_comments,
	});
}

export async function fetchFeedbackSnapshot(options: {
	gateway: PrAddressGitHubGateway;
	prNumber: number;
	shouldIncludeResolved: boolean;
	shouldIncludeEmptyReviews: boolean;
	shouldCountAllReviewThreads: boolean;
	ctx: PrAddressExecContext;
}): Promise<{ type: "ok"; snapshot: FeedbackSnapshot } | { type: "error"; exit: ClinkrFailureExit }> {
	const gatewayOptionsValue = gatewayOptions(options.ctx);
	const reviewsResult = await options.gateway.getReviews(options.prNumber, gatewayOptionsValue);
	if (reviewsResult.type === "failure") return { type: "error", exit: gatewayFailureExit(`Failed to fetch reviews for PR ${options.prNumber}`, reviewsResult.failure) };
	let countedReviewThreads: readonly PRReviewThread[];
	let reviewThreads: readonly PRReviewThread[];
	if (options.shouldCountAllReviewThreads) {
		const countedResult = await options.gateway.getReviewThreads(options.prNumber, { ...gatewayOptionsValue, shouldIncludeResolved: true });
		if (countedResult.type === "failure") return { type: "error", exit: gatewayFailureExit(`Failed to fetch review threads for PR ${options.prNumber}`, countedResult.failure) };
		countedReviewThreads = countedResult.value;
		reviewThreads = options.shouldIncludeResolved ? countedReviewThreads : countedReviewThreads.filter((thread) => !thread.is_resolved);
	} else {
		const threadsResult = await options.gateway.getReviewThreads(options.prNumber, { ...gatewayOptionsValue, shouldIncludeResolved: options.shouldIncludeResolved });
		if (threadsResult.type === "failure") return { type: "error", exit: gatewayFailureExit(`Failed to fetch review threads for PR ${options.prNumber}`, threadsResult.failure) };
		reviewThreads = threadsResult.value;
		countedReviewThreads = reviewThreads;
	}
	const commentsResult = await options.gateway.getDiscussionComments(options.prNumber, gatewayOptionsValue);
	if (commentsResult.type === "failure") return { type: "error", exit: gatewayFailureExit(`Failed to fetch discussion comments for PR ${options.prNumber}`, commentsResult.failure) };
	return {
		type: "ok",
		snapshot: {
			pr_number: options.prNumber,
			reviews: reviewsForRequest(reviewsResult.value, options.shouldIncludeEmptyReviews),
			review_threads: reviewThreads,
			counted_review_threads: countedReviewThreads,
			discussion_comments: commentsResult.value,
		},
	};
}

export function reviewsForRequest(reviews: readonly PRReview[], shouldIncludeEmptyReviews: boolean): readonly PRReview[] {
	if (shouldIncludeEmptyReviews) return reviews;
	return reviews.filter((review) => !isEmptyReview(review));
}

function isEmptyReview(review: PRReview): boolean {
	return SILENCEABLE_EMPTY_REVIEW_STATES.has(review.state) && review.body.trim() === "";
}

export function contestedThreadIds(reviewThreads: readonly PRReviewThread[]): readonly string[] {
	const contested: string[] = [];
	for (const thread of reviewThreads) {
		if (!thread.is_resolved) continue;
		const markerIndexes: number[] = [];
		thread.comments.forEach((comment, index) => {
			if (comment.body.includes(RESOLUTION_MARKER)) markerIndexes.push(index);
		});
		const lastMarkerIndex = markerIndexes.at(-1);
		if (lastMarkerIndex !== undefined && lastMarkerIndex < thread.comments.length - 1) contested.push(thread.id);
	}
	return contested;
}
