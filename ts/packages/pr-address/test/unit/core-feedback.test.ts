import { describe, expect, test } from "vitest";

import type {
	GithubPrDiscussionComment,
	GithubPrFeedbackFailure,
	GithubPrFeedbackGateway,
	GithubPrLookupOutcome,
	GithubPrReview,
	GithubPrReviewThread,
	GithubPrSummary,
	GithubReviewThreadReply,
	GithubReviewThreadState,
} from "@asdl/core/github-pr-feedback";
import type { Result } from "@asdl/core/result";
import { createDeferred } from "@asdl/core/testing";

import { fetchFeedbackSnapshot, reviewsForRequest } from "../../src/core/feedback-snapshot.ts";
import { isAutomationLikeDiscussionComment } from "../../src/core/feedback-summary.ts";
import {
	InMemoryGithubPrFeedbackGateway,
	discussionComment,
	review,
	reviewThread,
} from "../support/in-memory-pr-address-gateways.ts";

const GATEWAY_OPTIONS = { cwd: "/repo" };

type FeedbackReadName = "reviews" | "reviewThreads" | "discussionComments";
type ReviewsResult = Result<readonly GithubPrReview[], GithubPrFeedbackFailure>;
type ReviewThreadsResult = Result<readonly GithubPrReviewThread[], GithubPrFeedbackFailure>;
type DiscussionCommentsResult = Result<
	readonly GithubPrDiscussionComment[],
	GithubPrFeedbackFailure
>;

class ControlledFeedbackGateway implements GithubPrFeedbackGateway {
	private readonly startedInternal: FeedbackReadName[] = [];
	private readonly reviews = createDeferred<ReviewsResult>();
	private readonly reviewThreads = createDeferred<ReviewThreadsResult>();
	private readonly discussionComments = createDeferred<DiscussionCommentsResult>();

	get started(): readonly FeedbackReadName[] {
		return [...this.startedInternal];
	}

	resolveReviews(result: ReviewsResult): void {
		this.reviews.resolve(result);
	}

	resolveReviewThreads(result: ReviewThreadsResult): void {
		this.reviewThreads.resolve(result);
	}

	resolveDiscussionComments(result: DiscussionCommentsResult): void {
		this.discussionComments.resolve(result);
	}

	async getPr(): Promise<Result<GithubPrLookupOutcome, GithubPrFeedbackFailure>> {
		throw new Error("Unexpected getPr call");
	}

	async getPrForBranch(): Promise<Result<GithubPrLookupOutcome, GithubPrFeedbackFailure>> {
		throw new Error("Unexpected getPrForBranch call");
	}

	async listOpenPrs(): Promise<Result<readonly GithubPrSummary[], GithubPrFeedbackFailure>> {
		throw new Error("Unexpected listOpenPrs call");
	}

	async getPrReviews(): Promise<ReviewsResult> {
		this.startedInternal.push("reviews");
		return await this.reviews.promise;
	}

	async getPrReviewThreads(): Promise<ReviewThreadsResult> {
		this.startedInternal.push("reviewThreads");
		return await this.reviewThreads.promise;
	}

	async getPrDiscussionComments(): Promise<DiscussionCommentsResult> {
		this.startedInternal.push("discussionComments");
		return await this.discussionComments.promise;
	}

	async replyToReviewThread(): Promise<Result<GithubReviewThreadReply, GithubPrFeedbackFailure>> {
		throw new Error("Unexpected replyToReviewThread call");
	}

	async resolveReviewThread(): Promise<Result<GithubReviewThreadState, GithubPrFeedbackFailure>> {
		throw new Error("Unexpected resolveReviewThread call");
	}
}

describe("pr-address core feedback helpers", () => {
	test("filters silenceable empty reviews while preserving empty changes-requested reviews", () => {
		const filtered = reviewsForRequest(
			[
				review({ id: "approved-empty", state: "APPROVED", body: "" }),
				review({ id: "commented-whitespace", state: "COMMENTED", body: " \n\t " }),
				review({ id: "changes-requested-empty", state: "CHANGES_REQUESTED", body: "" }),
				review({ id: "approved-with-body", state: "APPROVED", body: "Looks good" }),
			],
			false,
		);

		expect(filtered.map((item) => item.id)).toEqual([
			"changes-requested-empty",
			"approved-with-body",
		]);
	});

	test("returns gateway-shaped failures when snapshot collection fails", async () => {
		const gateway = new InMemoryGithubPrFeedbackGateway({ reviewFailurePrNumbers: new Set([42]) });

		const result = await fetchFeedbackSnapshot({
			gateway,
			gatewayOptions: GATEWAY_OPTIONS,
			prNumber: 42,
		});

		expect(result).toMatchObject({
			type: "failure",
			message: "Failed to fetch reviews for PR 42",
			failure: {
				message: "gh auth failed",
				details: { stderr: "gh auth failed", stdout: "", exitCode: 4 },
			},
		});
	});

	test("starts snapshot gateway reads before awaiting any result", async () => {
		const gateway = new ControlledFeedbackGateway();
		const resultPromise = fetchFeedbackSnapshot({
			gateway,
			gatewayOptions: GATEWAY_OPTIONS,
			prNumber: 123,
		});

		expect(gateway.started).toEqual(["reviews", "reviewThreads", "discussionComments"]);

		gateway.resolveReviews({ ok: true, value: [review({ id: "review-1" })] });
		gateway.resolveReviewThreads({
			ok: true,
			value: [reviewThread({ id: "thread-1", isResolved: false })],
		});
		gateway.resolveDiscussionComments({
			ok: true,
			value: [discussionComment({ id: 50 })],
		});

		await expect(resultPromise).resolves.toMatchObject({
			type: "ok",
			snapshot: {
				reviews: [expect.objectContaining({ id: "review-1" })],
				review_threads: [expect.objectContaining({ id: "thread-1" })],
				discussion_comments: [expect.objectContaining({ id: 50 })],
			},
		});
	});

	const failurePriorityScenarios = [
		{
			name: "reviews beat review threads",
			shouldFailReviews: true,
			shouldFailReviewThreads: true,
			shouldFailDiscussionComments: false,
			expectedMessage: "Failed to fetch reviews for PR 42",
			expectedOperation: "getPrReviews",
		},
		{
			name: "review threads beat discussion comments",
			shouldFailReviews: false,
			shouldFailReviewThreads: true,
			shouldFailDiscussionComments: true,
			expectedMessage: "Failed to fetch review threads for PR 42",
			expectedOperation: "getPrReviewThreads",
		},
		{
			name: "discussion comments are returned after earlier successes",
			shouldFailReviews: false,
			shouldFailReviewThreads: false,
			shouldFailDiscussionComments: true,
			expectedMessage: "Failed to fetch discussion comments for PR 42",
			expectedOperation: "getPrDiscussionComments",
		},
	] as const;

	test.each(failurePriorityScenarios)(
		"preserves snapshot failure priority: $name",
		async (scenario) => {
			const gateway = new InMemoryGithubPrFeedbackGateway({
				reviewFailurePrNumbers: scenario.shouldFailReviews ? new Set([42]) : new Set(),
				reviewThreadsFailurePrNumbers: scenario.shouldFailReviewThreads ? new Set([42]) : new Set(),
				discussionCommentsFailurePrNumbers: scenario.shouldFailDiscussionComments
					? new Set([42])
					: new Set(),
			});

			const result = await fetchFeedbackSnapshot({
				gateway,
				gatewayOptions: GATEWAY_OPTIONS,
				prNumber: 42,
			});

			expect(result).toMatchObject({
				type: "failure",
				message: scenario.expectedMessage,
				failure: { details: { operation: scenario.expectedOperation } },
			});
		},
	);

	test("returns raw snapshot review threads without filtering or duplicate counted collections", async () => {
		const gateway = new InMemoryGithubPrFeedbackGateway({
			reviewThreads: {
				123: [
					reviewThread({ id: "unresolved", isResolved: false }),
					reviewThread({ id: "resolved", isResolved: true }),
				],
			},
		});

		const result = await fetchFeedbackSnapshot({
			gateway,
			gatewayOptions: GATEWAY_OPTIONS,
			prNumber: 123,
		});

		if (result.type !== "ok") throw new Error(result.message);
		expect(result.snapshot.review_threads.map((thread) => thread.id)).toEqual([
			"unresolved",
			"resolved",
		]);
		expect(Object.hasOwn(result.snapshot, `counted_${"review_threads"}`)).toBe(false);
	});

	test("identifies automation-like discussion comments", () => {
		expect(
			isAutomationLikeDiscussionComment(
				discussionComment({ author: "vercel[bot]", body: "[vc]: deployment ready" }),
			),
		).toBe(true);
		expect(
			isAutomationLikeDiscussionComment(
				discussionComment({ author: "octocat", body: "Could you take another look?" }),
			),
		).toBe(false);
	});
});
