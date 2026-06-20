import { describe, expect, test } from "vitest";

import {
	InMemoryGithubPrFeedbackGateway,
	discussionComment,
	prSummary,
	review,
	reviewThread,
} from "../support/in-memory-pr-address-gateways.ts";
import { runScenario } from "../support/run-scenario.ts";

function dataFromJson(stdout: readonly string[]): unknown {
	return JSON.parse(stdout.join(""))?.data;
}

describe("pr-address primitive exec commands", () => {
	test("returns structured lookup results for PR details and branch PRs", async () => {
		const prFeedback = new InMemoryGithubPrFeedbackGateway({
			prs: [prSummary({ number: 12, headRefName: "feature/pr" })],
			missingPrNumbers: new Set([404]),
		});

		const found = runScenario(["exec", "pr-details", "--pr-number", "12", "--format", "json"], {
			prFeedback,
		});
		expect(await found.exit).toBe(0);
		expect(dataFromJson(found.stdout)).toMatchObject({
			found: true,
			pr: { number: 12, head_ref_name: "feature/pr" },
			miss: null,
		});

		const branch = runScenario(
			["exec", "branch-pr", "--branch", "feature/pr", "--format", "json"],
			{ prFeedback },
		);
		expect(await branch.exit).toBe(0);
		expect(dataFromJson(branch.stdout)).toMatchObject({ found: true, pr: { number: 12 } });

		const missing = runScenario(["exec", "pr-details", "--pr-number", "404", "--format", "json"], {
			prFeedback,
		});
		expect(await missing.exit).toBe(0);
		expect(dataFromJson(missing.stdout)).toEqual({
			found: false,
			pr: null,
			miss: { stderr: "no PR found for PR 404", returncode: 1 },
		});
	});

	test("returns structured read primitive payloads", async () => {
		const prFeedback = new InMemoryGithubPrFeedbackGateway({
			prs: [prSummary({ number: 12 })],
			reviews: { 12: [review({ id: "R1" })] },
			reviewThreads: {
				12: [
					reviewThread({ id: "RT_open" }),
					reviewThread({ id: "RT_resolved", isResolved: true }),
				],
			},
			discussionComments: { 12: [discussionComment({ id: 90 })] },
		});

		const openPrs = runScenario(["exec", "open-prs", "--format", "json"], { prFeedback });
		expect(await openPrs.exit).toBe(0);
		expect(dataFromJson(openPrs.stdout)).toMatchObject({ prs: [{ number: 12 }] });

		const reviews = runScenario(["exec", "pr-reviews", "--pr-number", "12", "--format", "json"], {
			prFeedback,
		});
		expect(await reviews.exit).toBe(0);
		expect(dataFromJson(reviews.stdout)).toMatchObject({ reviews: [{ id: "R1" }] });

		const openThreads = runScenario(
			["exec", "pr-review-threads", "--pr-number", "12", "--format", "json"],
			{ prFeedback },
		);
		expect(await openThreads.exit).toBe(0);
		expect(dataFromJson(openThreads.stdout)).toMatchObject({
			review_threads: [{ id: "RT_open" }],
		});

		const allThreads = runScenario(
			["exec", "pr-review-threads", "--pr-number", "12", "--include-resolved", "--format", "json"],
			{ prFeedback },
		);
		expect(await allThreads.exit).toBe(0);
		expect(dataFromJson(allThreads.stdout)).toMatchObject({
			review_threads: [{ id: "RT_open" }, { id: "RT_resolved" }],
		});

		const comments = runScenario(
			["exec", "pr-discussion-comments", "--pr-number", "12", "--format", "json"],
			{ prFeedback },
		);
		expect(await comments.exit).toBe(0);
		expect(dataFromJson(comments.stdout)).toMatchObject({ discussion_comments: [{ id: 90 }] });
	});

	test("returns structured mutation payloads and records fake side effects", async () => {
		const prFeedback = new InMemoryGithubPrFeedbackGateway();

		const reply = runScenario(
			[
				"exec",
				"reply-review-thread",
				"--thread-id",
				"RT_thread1",
				"--body",
				"Fixed.",
				"--format",
				"json",
			],
			{ prFeedback },
		);
		expect(await reply.exit).toBe(0);
		expect(dataFromJson(reply.stdout)).toMatchObject({
			thread_id: "RT_thread1",
			comment: { body: "Fixed.", author: "agent" },
		});
		expect(prFeedback.replies).toEqual([{ threadId: "RT_thread1", body: "Fixed." }]);

		const resolve = runScenario(
			["exec", "resolve-review-thread", "--thread-id", "RT_thread1", "--format", "json"],
			{ prFeedback },
		);
		expect(await resolve.exit).toBe(0);
		expect(dataFromJson(resolve.stdout)).toEqual({ thread_id: "RT_thread1", is_resolved: true });
		expect(prFeedback.resolutions).toEqual([{ threadId: "RT_thread1" }]);
	});

	test("maps primitive gateway failures to pr_gateway_failure", async () => {
		const lookupFailure = new InMemoryGithubPrFeedbackGateway({
			lookupFailurePrNumbers: new Set([500]),
		});
		const lookupRun = runScenario(
			["exec", "pr-details", "--pr-number", "500", "--format", "json"],
			{ prFeedback: lookupFailure },
		);
		expect(await lookupRun.exit).toBe(2);
		expect(JSON.parse(lookupRun.stdout.join(""))).toMatchObject({
			error_type: "pr_gateway_failure",
			message: "Failed to look up PR 500: gh auth failed",
		});

		const prFeedback = new InMemoryGithubPrFeedbackGateway({
			replyFailureThreadIds: new Set(["RT_fail"]),
		});

		const run = runScenario(
			[
				"exec",
				"reply-review-thread",
				"--thread-id",
				"RT_fail",
				"--body",
				"Fixed.",
				"--format",
				"json",
			],
			{ prFeedback },
		);
		expect(await run.exit).toBe(2);
		expect(JSON.parse(run.stdout.join(""))).toMatchObject({
			error_type: "pr_gateway_failure",
			message: "Failed to reply to review thread RT_fail: reply failed",
		});
		expect(prFeedback.replies).toEqual([]);
	});
});
