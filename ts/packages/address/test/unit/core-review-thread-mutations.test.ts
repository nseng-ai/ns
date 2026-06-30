import { describe, expect, test } from "vitest";

import {
	closeReviewThreads,
	replyReviewThread,
	resolveReviewThread,
} from "../../src/core/review-thread-mutations.ts";
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

	test("closeReviewThreads replies then resolves each thread in input order", async () => {
		const prFeedback = new InMemoryGithubPrFeedbackGateway();

		const result = await closeReviewThreads({
			prFeedback,
			gatewayOptions: GATEWAY_OPTIONS,
			threadIds: ["RT_one", "RT_two"],
			body: "Fixed.",
		});

		expect(result).toMatchObject({
			requested: 2,
			replied: 2,
			resolved: 2,
			failed: 0,
			summary: { succeeded: 2, failed: 0 },
			entries: [
				{
					thread_id: "RT_one",
					reply: { thread_id: "RT_one", comment: { body: "Fixed." } },
					resolution: { thread_id: "RT_one", is_resolved: true },
					error: null,
				},
				{
					thread_id: "RT_two",
					reply: { thread_id: "RT_two", comment: { body: "Fixed." } },
					resolution: { thread_id: "RT_two", is_resolved: true },
					error: null,
				},
			],
		});
		expect(prFeedback.replies).toEqual([
			{ threadId: "RT_one", body: "Fixed." },
			{ threadId: "RT_two", body: "Fixed." },
		]);
		expect(prFeedback.resolutions).toEqual([{ threadId: "RT_one" }, { threadId: "RT_two" }]);
	});

	test("closeReviewThreads can resolve without replying", async () => {
		const prFeedback = new InMemoryGithubPrFeedbackGateway();

		const result = await closeReviewThreads({
			prFeedback,
			gatewayOptions: GATEWAY_OPTIONS,
			threadIds: ["RT_one"],
		});

		expect(result).toMatchObject({
			requested: 1,
			replied: 0,
			resolved: 1,
			failed: 0,
			entries: [{ thread_id: "RT_one", reply: null, error: null }],
		});
		expect(prFeedback.replies).toEqual([]);
		expect(prFeedback.resolutions).toEqual([{ threadId: "RT_one" }]);
	});

	test("closeReviewThreads skips resolve after a reply failure and continues", async () => {
		const prFeedback = new InMemoryGithubPrFeedbackGateway({
			replyFailureThreadIds: new Set(["RT_fail"]),
		});

		const result = await closeReviewThreads({
			prFeedback,
			gatewayOptions: GATEWAY_OPTIONS,
			threadIds: ["RT_fail", "RT_ok"],
			body: "Fixed.",
		});

		expect(result).toMatchObject({
			requested: 2,
			replied: 1,
			resolved: 1,
			failed: 1,
			summary: { succeeded: 1, failed: 1 },
			entries: [
				{
					thread_id: "RT_fail",
					reply: null,
					resolution: null,
					error: {
						stage: "reply",
						message: "Failed to reply to review thread RT_fail",
						code: "reply-failed",
					},
				},
				{ thread_id: "RT_ok", error: null },
			],
		});
		expect(prFeedback.replies).toEqual([{ threadId: "RT_ok", body: "Fixed." }]);
		expect(prFeedback.resolutions).toEqual([{ threadId: "RT_ok" }]);
	});

	test("closeReviewThreads preserves a reply when resolve fails and continues", async () => {
		const prFeedback = new InMemoryGithubPrFeedbackGateway({
			resolveFailureThreadIds: new Set(["RT_fail"]),
		});

		const result = await closeReviewThreads({
			prFeedback,
			gatewayOptions: GATEWAY_OPTIONS,
			threadIds: ["RT_fail", "RT_ok"],
			body: "Fixed.",
		});

		expect(result).toMatchObject({
			requested: 2,
			replied: 2,
			resolved: 1,
			failed: 1,
			entries: [
				{
					thread_id: "RT_fail",
					reply: { thread_id: "RT_fail", comment: { body: "Fixed." } },
					resolution: null,
					error: {
						stage: "resolve",
						message: "Failed to resolve review thread RT_fail",
						code: "resolve-failed",
					},
				},
				{ thread_id: "RT_ok", error: null },
			],
		});
		expect(prFeedback.replies).toEqual([
			{ threadId: "RT_fail", body: "Fixed." },
			{ threadId: "RT_ok", body: "Fixed." },
		]);
		expect(prFeedback.resolutions).toEqual([{ threadId: "RT_ok" }]);
	});
});
