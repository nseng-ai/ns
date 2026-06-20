import type {
	GithubPrDiscussionComment,
	GithubPrFeedbackFailure,
	GithubPrFeedbackGateway,
	GithubPrReview,
	GithubPrReviewThread,
} from "@asdl/core/github-pr-feedback";

import type { GatewayOptions } from "./gateways.ts";

const SILENCEABLE_EMPTY_REVIEW_STATES = new Set(["COMMENTED", "APPROVED"]);

export interface FeedbackSnapshot {
	pr_number: number;
	reviews: readonly GithubPrReview[];
	review_threads: readonly GithubPrReviewThread[];
	counted_review_threads: readonly GithubPrReviewThread[];
	discussion_comments: readonly GithubPrDiscussionComment[];
}

export type FeedbackSnapshotResult =
	| { type: "ok"; snapshot: FeedbackSnapshot }
	| { type: "failure"; message: string; failure: GithubPrFeedbackFailure };

export interface FetchFeedbackSnapshotOptions {
	gateway: GithubPrFeedbackGateway;
	gatewayOptions: GatewayOptions;
	prNumber: number;
	shouldIncludeResolved: boolean;
	shouldIncludeEmptyReviews: boolean;
	shouldCountAllReviewThreads: boolean;
}

export async function fetchFeedbackSnapshot(
	options: FetchFeedbackSnapshotOptions,
): Promise<FeedbackSnapshotResult> {
	const reviewsResult = await options.gateway.getPrReviews({
		...options.gatewayOptions,
		prNumber: options.prNumber,
	});
	if (!reviewsResult.ok)
		return snapshotFailure(
			`Failed to fetch reviews for PR ${options.prNumber}`,
			reviewsResult.error,
		);
	let countedReviewThreads: readonly GithubPrReviewThread[];
	let reviewThreads: readonly GithubPrReviewThread[];
	if (options.shouldCountAllReviewThreads) {
		const countedResult = await options.gateway.getPrReviewThreads({
			...options.gatewayOptions,
			prNumber: options.prNumber,
		});
		if (!countedResult.ok)
			return snapshotFailure(
				`Failed to fetch review threads for PR ${options.prNumber}`,
				countedResult.error,
			);
		countedReviewThreads = countedResult.value;
		reviewThreads = options.shouldIncludeResolved
			? countedReviewThreads
			: unresolvedThreads(countedReviewThreads);
	} else {
		const threadsResult = await options.gateway.getPrReviewThreads({
			...options.gatewayOptions,
			prNumber: options.prNumber,
		});
		if (!threadsResult.ok)
			return snapshotFailure(
				`Failed to fetch review threads for PR ${options.prNumber}`,
				threadsResult.error,
			);
		reviewThreads = options.shouldIncludeResolved
			? threadsResult.value
			: unresolvedThreads(threadsResult.value);
		countedReviewThreads = reviewThreads;
	}
	const commentsResult = await options.gateway.getPrDiscussionComments({
		...options.gatewayOptions,
		prNumber: options.prNumber,
	});
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
	reviews: readonly GithubPrReview[],
	shouldIncludeEmptyReviews: boolean,
): readonly GithubPrReview[] {
	if (shouldIncludeEmptyReviews) return reviews;
	return reviews.filter((review) => !isEmptyReview(review));
}

function unresolvedThreads(
	threads: readonly GithubPrReviewThread[],
): readonly GithubPrReviewThread[] {
	return threads.filter((thread) => !thread.isResolved);
}

function isEmptyReview(review: GithubPrReview): boolean {
	return SILENCEABLE_EMPTY_REVIEW_STATES.has(review.state) && review.body.trim() === "";
}

function snapshotFailure(
	message: string,
	failure: GithubPrFeedbackFailure,
): FeedbackSnapshotResult {
	return { type: "failure", message, failure };
}
