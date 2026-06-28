import { describe, expect, test } from "vitest";

import { replyReviewThread, resolveReviewThread } from "../../src/core/review-thread-mutations.ts";
import { InMemoryGithubPrFeedbackGateway } from "../support/in-memory-pr-address-gateways.ts";

const GATEWAY_OPTIONS = { cwd: "/repo" };

describe("review thread mutations", () => {
	test("replyReviewThread records the fake side effect and returns the compatible payload", async () => {
		const prFeedback = new InMemoryGithubPrFeedbackGateway();

		const result = await replyReviewThread({
			prFeedback,
			gatewayOptions: GATEWAY_OPTIONS,
			threadId: "RT_thread1",
			body: "Fixed.",
		});

		expect(result).toEqual({
			type: "ok",
			reply: {
				thread_id: "RT_thread1",
				comment: {
					id: 1,
					body: "Fixed.",
					author: "agent",
					path: "",
					line: null,
					start_line: null,
					created_at: "2026-06-01T00:00:00Z",
					url: "https://github.com/acme/repo/pull/1#discussion_r1",
				},
			},
		});
		expect(prFeedback.replies).toEqual([{ threadId: "RT_thread1", body: "Fixed." }]);
	});

	test("replyReviewThread returns a PR feedback failure and records no side effect", async () => {
		const prFeedback = new InMemoryGithubPrFeedbackGateway({
			replyFailureThreadIds: new Set(["RT_fail"]),
		});

		const result = await replyReviewThread({
			prFeedback,
			gatewayOptions: GATEWAY_OPTIONS,
			threadId: "RT_fail",
			body: "Fixed.",
		});

		expect(result).toMatchObject({
			type: "pr_feedback_failure",
			message: "Failed to reply to review thread RT_fail",
			failure: { details: { operation: "replyToReviewThread" } },
		});
		expect(prFeedback.replies).toEqual([]);
	});

	test("resolveReviewThread records the fake side effect and returns the compatible payload", async () => {
		const prFeedback = new InMemoryGithubPrFeedbackGateway();

		const result = await resolveReviewThread({
			prFeedback,
			gatewayOptions: GATEWAY_OPTIONS,
			threadId: "RT_thread1",
		});

		expect(result).toEqual({
			type: "ok",
			resolution: { thread_id: "RT_thread1", is_resolved: true },
		});
		expect(prFeedback.resolutions).toEqual([{ threadId: "RT_thread1" }]);
	});

	test("resolveReviewThread returns a PR feedback failure and records no side effect", async () => {
		const prFeedback = new InMemoryGithubPrFeedbackGateway({
			resolveFailureThreadIds: new Set(["RT_fail"]),
		});

		const result = await resolveReviewThread({
			prFeedback,
			gatewayOptions: GATEWAY_OPTIONS,
			threadId: "RT_fail",
		});

		expect(result).toMatchObject({
			type: "pr_feedback_failure",
			message: "Failed to resolve review thread RT_fail",
			failure: { details: { operation: "resolveReviewThread" } },
		});
		expect(prFeedback.resolutions).toEqual([]);
	});
});
