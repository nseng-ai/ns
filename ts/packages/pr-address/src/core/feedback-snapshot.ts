import type { GatewayFailure, GatewayOptions, PRDiscussionComment, PRReview, PRReviewThread, PrAddressGitHubGateway } from "./gateways.ts";

const RESOLUTION_MARKER = "<!-- pr-address:resolved -->";
const SILENCEABLE_EMPTY_REVIEW_STATES = new Set(["COMMENTED", "APPROVED"]);

export interface FeedbackSnapshot {
	pr_number: number;
	reviews: readonly PRReview[];
	review_threads: readonly PRReviewThread[];
	counted_review_threads: readonly PRReviewThread[];
	discussion_comments: readonly PRDiscussionComment[];
}

export type FeedbackSnapshotResult = { type: "ok"; snapshot: FeedbackSnapshot } | { type: "failure"; message: string; failure: GatewayFailure };

export interface FetchFeedbackSnapshotOptions {
	gateway: PrAddressGitHubGateway;
	gatewayOptions: GatewayOptions;
	prNumber: number;
	shouldIncludeResolved: boolean;
	shouldIncludeEmptyReviews: boolean;
	shouldCountAllReviewThreads: boolean;
}

export async function fetchFeedbackSnapshot(options: FetchFeedbackSnapshotOptions): Promise<FeedbackSnapshotResult> {
	const reviewsResult = await options.gateway.getReviews(options.prNumber, options.gatewayOptions);
	if (!reviewsResult.ok) return snapshotFailure(`Failed to fetch reviews for PR ${options.prNumber}`, reviewsResult.error);
	let countedReviewThreads: readonly PRReviewThread[];
	let reviewThreads: readonly PRReviewThread[];
	if (options.shouldCountAllReviewThreads) {
		const countedResult = await options.gateway.getReviewThreads(options.prNumber, { ...options.gatewayOptions, shouldIncludeResolved: true });
		if (!countedResult.ok) return snapshotFailure(`Failed to fetch review threads for PR ${options.prNumber}`, countedResult.error);
		countedReviewThreads = countedResult.value;
		reviewThreads = options.shouldIncludeResolved ? countedReviewThreads : countedReviewThreads.filter((thread) => !thread.is_resolved);
	} else {
		const threadsResult = await options.gateway.getReviewThreads(options.prNumber, {
			...options.gatewayOptions,
			shouldIncludeResolved: options.shouldIncludeResolved,
		});
		if (!threadsResult.ok) return snapshotFailure(`Failed to fetch review threads for PR ${options.prNumber}`, threadsResult.error);
		reviewThreads = threadsResult.value;
		countedReviewThreads = reviewThreads;
	}
	const commentsResult = await options.gateway.getDiscussionComments(options.prNumber, options.gatewayOptions);
	if (!commentsResult.ok) return snapshotFailure(`Failed to fetch discussion comments for PR ${options.prNumber}`, commentsResult.error);
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

export function feedbackCounts(snapshot: FeedbackSnapshot): Record<string, number> {
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

function isEmptyReview(review: PRReview): boolean {
	return SILENCEABLE_EMPTY_REVIEW_STATES.has(review.state) && review.body.trim() === "";
}

function snapshotFailure(message: string, failure: GatewayFailure): FeedbackSnapshotResult {
	return { type: "failure", message, failure };
}
