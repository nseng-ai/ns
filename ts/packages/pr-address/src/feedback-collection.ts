import { z } from "zod";

import { failure, ok, toMachineEnvelope } from "@asdl/clinkr";
import type { PRDiscussionComment, PRReview, PRReviewThread, PrAddressGitHubGateway } from "./gateways.ts";
import { gatewayFailureResult, gatewayOptions, githubGateway, parsePrNumberOperation } from "./operation-support.ts";
import { buildGetFeedbackPayloadManifest } from "./payload-manifest.ts";
import { PayloadStore } from "./payload-store.ts";
import type { ExecOperationDispatchResult, ExecOperationInvocation } from "./operation-registry.ts";

const SILENCEABLE_EMPTY_REVIEW_STATES = new Set(["COMMENTED", "APPROVED"]);
const resolutionMarker = "<!-- pr-address:resolved -->";

export interface FeedbackSnapshot {
	pr_number: number;
	reviews: readonly PRReview[];
	review_threads: readonly PRReviewThread[];
	counted_review_threads: readonly PRReviewThread[];
	discussion_comments: readonly PRDiscussionComment[];
}

export async function runGetFeedbackOperation(invocation: ExecOperationInvocation): Promise<ExecOperationDispatchResult> {
	const parsed = parsePrNumberOperation({
		args: invocation.args,
		commandName: "get-feedback",
		flagOptions: ["--include-resolved", "--include-empty-reviews"],
		valueOptions: ["--payload-mode", "--payload-session-id"],
	});
	if (parsed.type === "error") return parsed.result;
	const payloadMode = parsed.values.get("--payload-mode") ?? "payload";
	// Invalid --payload-mode values keep legacy click usage-error behavior.
	if (payloadMode !== "inline" && payloadMode !== "payload") return { type: "fallback" };

	// Python opens the payload store before any gateway fetch; preserve that ordering.
	let store: PayloadStore | undefined;
	if (payloadMode === "payload") {
		const storeResult = await PayloadStore.fromEnvironment({
			explicitSessionId: parsed.values.get("--payload-session-id") ?? null,
			env: invocation.deps.env,
			clock: invocation.deps.context.payloadClock,
		});
		if (storeResult.type === "error") return { type: "exit", exit: failure(storeResult.errorType, storeResult.message) };
		store = storeResult.value;
	}

	const gateway = githubGateway(invocation);
	if (gateway.type === "error") return gateway.result;
	const snapshotResult = await fetchFeedbackSnapshot({
		gateway: gateway.gateway,
		prNumber: parsed.prNumber,
		shouldIncludeResolved: parsed.flags.has("--include-resolved"),
		shouldIncludeEmptyReviews: parsed.flags.has("--include-empty-reviews"),
		shouldCountAllReviewThreads: false,
		invocation,
	});
	if (snapshotResult.type === "error") return snapshotResult.result;
	const snapshot = snapshotResult.snapshot;
	const inlineResult = {
		payload_mode: "inline",
		pr_number: snapshot.pr_number,
		reviews: snapshot.reviews,
		review_threads: snapshot.review_threads,
		discussion_comments: snapshot.discussion_comments,
	};
	if (store === undefined) return { type: "exit", exit: ok(inlineResult) };

	const rawReference = await store.writeJsonArtifact({
		descriptor: `pr-address-get-feedback-pr-${snapshot.pr_number}`,
		role: "raw",
		payload: toMachineEnvelope(ok(inlineResult)),
	});
	if (rawReference.type === "error") return { type: "exit", exit: failure(rawReference.errorType, rawReference.message) };
	return { type: "exit", exit: ok(buildGetFeedbackManifestFromSnapshot(snapshot, rawReference.value)) };
}

export function buildGetFeedbackManifestFromSnapshot(snapshot: FeedbackSnapshot, payloadReference: unknown): unknown {
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
	invocation: ExecOperationInvocation;
}): Promise<{ type: "ok"; snapshot: FeedbackSnapshot } | { type: "error"; result: ExecOperationDispatchResult }> {
	const gatewayOptionsValue = gatewayOptions(options.invocation);
	const reviewsResult = await options.gateway.getReviews(options.prNumber, gatewayOptionsValue);
	if (reviewsResult.type === "failure") return gatewayFailureResult(`Failed to fetch reviews for PR ${options.prNumber}`, reviewsResult.failure);
	let countedReviewThreads: readonly PRReviewThread[];
	let reviewThreads: readonly PRReviewThread[];
	if (options.shouldCountAllReviewThreads) {
		const countedResult = await options.gateway.getReviewThreads(options.prNumber, { ...gatewayOptionsValue, shouldIncludeResolved: true });
		if (countedResult.type === "failure") return gatewayFailureResult(`Failed to fetch review threads for PR ${options.prNumber}`, countedResult.failure);
		countedReviewThreads = countedResult.value;
		reviewThreads = options.shouldIncludeResolved ? countedReviewThreads : countedReviewThreads.filter((thread) => !thread.is_resolved);
	} else {
		const threadsResult = await options.gateway.getReviewThreads(options.prNumber, { ...gatewayOptionsValue, shouldIncludeResolved: options.shouldIncludeResolved });
		if (threadsResult.type === "failure") return gatewayFailureResult(`Failed to fetch review threads for PR ${options.prNumber}`, threadsResult.failure);
		reviewThreads = threadsResult.value;
		countedReviewThreads = reviewThreads;
	}
	const commentsResult = await options.gateway.getDiscussionComments(options.prNumber, gatewayOptionsValue);
	if (commentsResult.type === "failure") return gatewayFailureResult(`Failed to fetch discussion comments for PR ${options.prNumber}`, commentsResult.failure);
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
			if (comment.body.includes(resolutionMarker)) markerIndexes.push(index);
		});
		const lastMarkerIndex = markerIndexes.at(-1);
		if (lastMarkerIndex !== undefined && lastMarkerIndex < thread.comments.length - 1) contested.push(thread.id);
	}
	return contested;
}

export const getFeedbackInlineResultSchema = z.looseObject({
	payload_mode: z.literal("inline"),
	pr_number: z.number().int(),
	reviews: z.array(z.unknown()),
	review_threads: z.array(z.unknown()),
	discussion_comments: z.array(z.unknown()),
});
