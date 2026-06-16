import { describe, expect, test } from "vitest";

import { fetchFeedbackSnapshot, reviewsForRequest } from "../../src/core/feedback-snapshot.ts";
import { buildSummarizeFeedbackResult } from "../../src/core/feedback-summary.ts";
import { InMemoryPrAddressGitHubGateway, discussionComment, prSummary, review, reviewComment, reviewThread } from "../support/in-memory-pr-address-gateways.ts";

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

		expect(filtered.map((item) => item.id)).toEqual(["changes-requested-empty", "approved-with-body"]);
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

	test("builds compact feedback summaries from a snapshot", async () => {
		const gateway = new InMemoryPrAddressGitHubGateway({
			reviews: { 42: [review({ id: "review-1", body: "First line\nsecond line" })] },
			reviewThreads: { 42: [reviewThread({ id: "thread-1", comments: [reviewComment()] })] },
			discussionComments: { 42: [discussionComment({ id: 7, author: "vercel[bot]", body: "[vc]: deployment ready" })] },
		});
		const snapshotResult = await fetchFeedbackSnapshot({
			gateway,
			gatewayOptions: GATEWAY_OPTIONS,
			prNumber: 42,
			shouldIncludeResolved: true,
			shouldIncludeEmptyReviews: true,
			shouldCountAllReviewThreads: true,
		});
		if (snapshotResult.type !== "ok") throw new Error("expected snapshot collection to succeed");

		const summary = buildSummarizeFeedbackResult(prSummary({ number: 42 }), snapshotResult.snapshot, 12);

		expect(summary.counts).toEqual({ reviews: 1, review_threads: 1, unresolved_review_threads: 1, resolved_review_threads: 0, discussion_comments: 1 });
		expect(summary.reviews[0]?.body_first_line_excerpt).toBe("First line");
		expect(summary.discussion_comments[0]?.source_evidence).toEqual(["bot_author", "vercel_marker"]);
	});
});
