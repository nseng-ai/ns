import { describe, expect, test } from "vitest";

import { fetchFeedbackSnapshot, reviewsForRequest } from "../../src/core/feedback-snapshot.ts";
import { isAutomationLikeDiscussionComment } from "../../src/core/feedback-summary.ts";
import {
	InMemoryGithubPrFeedbackGateway,
	discussionComment,
	review,
	reviewThread,
} from "../support/in-memory-pr-address-gateways.ts";

const GATEWAY_OPTIONS = { cwd: "/repo" };

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
		const gateway = new InMemoryGithubPrFeedbackGateway({ reviewsFailurePrNumbers: new Set([42]) });

		const result = await fetchFeedbackSnapshot({
			gateway,
			gatewayOptions: GATEWAY_OPTIONS,
			prNumber: 42,
			shouldIncludeResolved: false,
			shouldIncludeEmptyReviews: false,
			shouldCountAllReviewThreads: false,
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

	const snapshotThreadScenarios = [
		{
			shouldIncludeResolved: false,
			shouldCountAllReviewThreads: false,
			reviewThreadIds: ["unresolved"],
			countedThreadIds: ["unresolved"],
		},
		{
			shouldIncludeResolved: false,
			shouldCountAllReviewThreads: true,
			reviewThreadIds: ["unresolved"],
			countedThreadIds: ["unresolved", "resolved"],
		},
		{
			shouldIncludeResolved: true,
			shouldCountAllReviewThreads: false,
			reviewThreadIds: ["unresolved", "resolved"],
			countedThreadIds: ["unresolved", "resolved"],
		},
		{
			shouldIncludeResolved: true,
			shouldCountAllReviewThreads: true,
			reviewThreadIds: ["unresolved", "resolved"],
			countedThreadIds: ["unresolved", "resolved"],
		},
	] as const;

	test.each(snapshotThreadScenarios)(
		"snapshot thread include/count behavior %#",
		async (scenario) => {
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
				shouldIncludeResolved: scenario.shouldIncludeResolved,
				shouldIncludeEmptyReviews: false,
				shouldCountAllReviewThreads: scenario.shouldCountAllReviewThreads,
			});

			if (result.type !== "ok") throw new Error(result.message);
			expect(result.snapshot.review_threads.map((thread) => thread.id)).toEqual(
				scenario.reviewThreadIds,
			);
			expect(result.snapshot.counted_review_threads.map((thread) => thread.id)).toEqual(
				scenario.countedThreadIds,
			);
		},
	);

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
