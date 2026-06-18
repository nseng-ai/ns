import type {
	GatewayFailure,
	GatewayOptions,
	PRDiscussionComment,
	PRReview,
	PRReviewThread,
	PrAddressGitHubGateway,
} from "./gateways.ts";

const SILENCEABLE_EMPTY_REVIEW_STATES = new Set(["COMMENTED", "APPROVED"]);

export interface FeedbackSnapshot {
	pr_number: number;
	reviews: readonly PRReview[];
	review_threads: readonly PRReviewThread[];
	counted_review_threads: readonly PRReviewThread[];
	discussion_comments: readonly PRDiscussionComment[];
}

export type FeedbackSnapshotResult =
	| { type: "ok"; snapshot: FeedbackSnapshot }
	| { type: "failure"; message: string; failure: GatewayFailure };

export interface FetchFeedbackSnapshotOptions {
	gateway: PrAddressGitHubGateway;
	gatewayOptions: GatewayOptions;
	prNumber: number;
	shouldIncludeResolved: boolean;
	shouldIncludeEmptyReviews: boolean;
	shouldCountAllReviewThreads: boolean;
}

export async function fetchFeedbackSnapshot(
	options: FetchFeedbackSnapshotOptions,
): Promise<FeedbackSnapshotResult> {
	const reviewsResult = await options.gateway.getReviews(options.prNumber, options.gatewayOptions);
	if (!reviewsResult.ok)
		return snapshotFailure(
			`Failed to fetch reviews for PR ${options.prNumber}`,
			reviewsResult.error,
		);
	let countedReviewThreads: readonly PRReviewThread[];
	let reviewThreads: readonly PRReviewThread[];
	if (options.shouldCountAllReviewThreads) {
		const countedResult = await options.gateway.getReviewThreads(options.prNumber, {
			...options.gatewayOptions,
			shouldIncludeResolved: true,
		});
		if (!countedResult.ok)
			return snapshotFailure(
				`Failed to fetch review threads for PR ${options.prNumber}`,
				countedResult.error,
			);
		countedReviewThreads = countedResult.value;
		reviewThreads = options.shouldIncludeResolved
			? countedReviewThreads
			: countedReviewThreads.filter((thread) => !thread.is_resolved);
	} else {
		const threadsResult = await options.gateway.getReviewThreads(options.prNumber, {
			...options.gatewayOptions,
			shouldIncludeResolved: options.shouldIncludeResolved,
		});
		if (!threadsResult.ok)
			return snapshotFailure(
				`Failed to fetch review threads for PR ${options.prNumber}`,
				threadsResult.error,
			);
		reviewThreads = threadsResult.value;
		countedReviewThreads = reviewThreads;
	}
	const commentsResult = await options.gateway.getDiscussionComments(
		options.prNumber,
		options.gatewayOptions,
	);
	if (!commentsResult.ok)
		return snapshotFailure(
			`Failed to fetch discussion comments for PR ${options.prNumber}`,
			commentsResult.error,
		);
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

export function reviewsForRequest(
	reviews: readonly PRReview[],
	shouldIncludeEmptyReviews: boolean,
): readonly PRReview[] {
	if (shouldIncludeEmptyReviews) return reviews;
	return reviews.filter((review) => !isEmptyReview(review));
}

function isEmptyReview(review: PRReview): boolean {
	return SILENCEABLE_EMPTY_REVIEW_STATES.has(review.state) && review.body.trim() === "";
}

function snapshotFailure(message: string, failure: GatewayFailure): FeedbackSnapshotResult {
	return { type: "failure", message, failure };
}
