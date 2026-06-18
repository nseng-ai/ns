import { describe, expect, test } from "vitest";

import { fetchFeedbackSnapshot, reviewsForRequest } from "../../src/core/feedback-snapshot.ts";
import { isAutomationLikeDiscussionComment } from "../../src/core/feedback-summary.ts";
import {
	InMemoryPrAddressGitHubGateway,
	discussionComment,
	review,
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
		const gateway = new InMemoryPrAddressGitHubGateway({ reviewsFailurePrNumbers: new Set([42]) });

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
			failure: { message: "gh auth failed", stderr: "gh auth failed", stdout: "", returncode: 4 },
		});
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
