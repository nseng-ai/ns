import { describe, expect, test } from "vitest";

import { InMemoryGitGateway } from "@sdl/capability-kit/git/testing";

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
	test("repo-required primitive operations fail on repository probe failure", async () => {
		const run = runScenario(["exec", "open-prs", "--format", "json"], {
			git: new InMemoryGitGateway({
				isInsideWorkTree: {
					type: "failure",
					error: { code: "work_tree_probe_failed", message: "git probe exploded" },
				},
			}),
			prFeedback: new InMemoryGithubPrFeedbackGateway({ prs: [prSummary({ number: 12 })] }),
		});

		expect(await run.exit).toBe(2);
		expect(JSON.parse(run.stdout.join(""))).toMatchObject({
			errorType: "pr-gateway-failure",
			message: "Failed to determine repository context: git probe exploded",
		});
	});

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
			checks: {
				12: {
					counts: { passing: 1, pending: 0, failing: 1, unknown: 0, hasMore: false },
					checks: [
						{
							bucket: "failing",
							kind: "check_run",
							name: "test",
							workflowName: "CI",
							status: "COMPLETED",
							conclusion: "FAILURE",
							state: null,
							startedAt: null,
							completedAt: "2026-06-01T00:00:00Z",
							createdAt: null,
							detailsUrl: "https://github.com/acme/repo/actions/runs/1",
							targetUrl: null,
							identity: "check-run:CI:test",
						},
					],
				},
			},
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
			reviewThreads: [{ id: "RT_open" }],
		});

		const allThreads = runScenario(
			["exec", "pr-review-threads", "--pr-number", "12", "--include-resolved", "--format", "json"],
			{ prFeedback },
		);
		expect(await allThreads.exit).toBe(0);
		expect(dataFromJson(allThreads.stdout)).toMatchObject({
			reviewThreads: [{ id: "RT_open" }, { id: "RT_resolved" }],
		});

		const comments = runScenario(
			["exec", "pr-discussion-comments", "--pr-number", "12", "--format", "json"],
			{ prFeedback },
		);
		expect(await comments.exit).toBe(0);
		expect(dataFromJson(comments.stdout)).toMatchObject({ discussionComments: [{ id: 90 }] });

		const checks = runScenario(["exec", "pr-checks", "--pr-number", "12", "--format", "json"], {
			prFeedback,
		});
		expect(await checks.exit).toBe(0);
		expect(dataFromJson(checks.stdout)).toMatchObject({
			found: true,
			target: { pr_number: 12 },
			counts: { failing: 1, passing: 1 },
			checks: [{ bucket: "failing", kind: "check_run", workflow_name: "CI", name: "test" }],
		});
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

	test("bulk-closes review threads from --thread-ids-json and records fake side effects", async () => {
		const prFeedback = new InMemoryGithubPrFeedbackGateway();

		const run = runScenario(
			[
				"exec",
				"close-review-threads",
				"--thread-ids-json",
				JSON.stringify({ threadIds: [" RT_one ", "RT_two"] }),
				"--body",
				"Fixed.",
				"--format",
				"json",
			],
			{ prFeedback },
		);

		expect(await run.exit).toBe(0);
		expect(dataFromJson(run.stdout)).toMatchObject({
			requested: 2,
			replied: 2,
			resolved: 2,
			failed: 0,
			summary: { succeeded: 2, failed: 0 },
			entries: [
				{
					thread_id: "RT_one",
					reply: { comment: { body: "Fixed." } },
					resolution: { thread_id: "RT_one", is_resolved: true },
					error: null,
				},
				{
					thread_id: "RT_two",
					reply: { comment: { body: "Fixed." } },
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

	test("bulk-closes review threads from stdin without replying", async () => {
		const prFeedback = new InMemoryGithubPrFeedbackGateway();

		const run = runScenario(["exec", "close-review-threads", "--format", "json"], {
			prFeedback,
			stdin: JSON.stringify({ threadIds: ["RT_one"] }),
		});

		expect(await run.exit).toBe(0);
		expect(dataFromJson(run.stdout)).toMatchObject({
			requested: 1,
			replied: 0,
			resolved: 1,
			failed: 0,
			entries: [{ thread_id: "RT_one", reply: null, error: null }],
		});
		expect(prFeedback.replies).toEqual([]);
		expect(prFeedback.resolutions).toEqual([{ threadId: "RT_one" }]);
	});

	test("bulk close rejects duplicate thread IDs before side effects", async () => {
		const prFeedback = new InMemoryGithubPrFeedbackGateway();

		const run = runScenario(["exec", "close-review-threads", "--format", "json"], {
			prFeedback,
			stdin: JSON.stringify({ threadIds: ["RT_one", " RT_one "] }),
		});

		expect(await run.exit).toBe(2);
		expect(JSON.parse(run.stdout.join(""))).toMatchObject({
			errorType: "invalid-request",
			message: "close-review-threads thread IDs contain duplicates: RT_one",
		});
		expect(prFeedback.replies).toEqual([]);
		expect(prFeedback.resolutions).toEqual([]);
	});

	test("bulk close rejects whitespace body before side effects", async () => {
		const prFeedback = new InMemoryGithubPrFeedbackGateway();

		const run = runScenario(
			[
				"exec",
				"close-review-threads",
				"--thread-ids-json",
				JSON.stringify({ threadIds: ["RT_one"] }),
				"--body",
				"   ",
				"--format",
				"json",
			],
			{ prFeedback },
		);

		expect(await run.exit).toBe(2);
		expect(JSON.parse(run.stdout.join(""))).toMatchObject({
			errorType: "invalid-request",
			message: "close-review-threads requires --body to be non-empty when supplied.",
		});
		expect(prFeedback.replies).toEqual([]);
		expect(prFeedback.resolutions).toEqual([]);
	});

	test("bulk close returns semantic exit 1 with structured resolve-failure data", async () => {
		const prFeedback = new InMemoryGithubPrFeedbackGateway({
			resolveFailureThreadIds: new Set(["RT_fail"]),
		});

		const run = runScenario(
			["exec", "close-review-threads", "--body", "Fixed.", "--format", "json"],
			{
				prFeedback,
				stdin: JSON.stringify({ threadIds: ["RT_fail", "RT_ok"] }),
			},
		);

		expect(await run.exit).toBe(1);
		const envelope = JSON.parse(run.stdout.join(""));
		expect(envelope).toMatchObject({
			status: "negative",
			exitCode: 1,
			message: "Failed to close 1 of 2 review threads",
			data: {
				requested: 2,
				replied: 2,
				resolved: 1,
				failed: 1,
				summary: { succeeded: 1, failed: 1 },
				entries: [
					{
						thread_id: "RT_fail",
						reply: { comment: { body: "Fixed." } },
						resolution: null,
						error: {
							stage: "resolve",
							message: "Failed to resolve review thread RT_fail",
							code: "resolve-failed",
						},
					},
					{ thread_id: "RT_ok", error: null },
				],
			},
		});
		expect(prFeedback.replies).toEqual([
			{ threadId: "RT_fail", body: "Fixed." },
			{ threadId: "RT_ok", body: "Fixed." },
		]);
		expect(prFeedback.resolutions).toEqual([{ threadId: "RT_ok" }]);
	});

	test("bulk close returns semantic exit 1 with structured reply-failure data", async () => {
		const prFeedback = new InMemoryGithubPrFeedbackGateway({
			replyFailureThreadIds: new Set(["RT_fail"]),
		});

		const run = runScenario(
			["exec", "close-review-threads", "--body", "Fixed.", "--format", "json"],
			{
				prFeedback,
				stdin: JSON.stringify({ threadIds: ["RT_fail", "RT_ok"] }),
			},
		);

		expect(await run.exit).toBe(1);
		expect(JSON.parse(run.stdout.join(""))).toMatchObject({
			status: "negative",
			exitCode: 1,
			message: "Failed to close 1 of 2 review threads",
			data: {
				requested: 2,
				replied: 1,
				resolved: 1,
				failed: 1,
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
			},
		});
		expect(prFeedback.replies).toEqual([{ threadId: "RT_ok", body: "Fixed." }]);
		expect(prFeedback.resolutions).toEqual([{ threadId: "RT_ok" }]);
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
			errorType: "pr-gateway-failure",
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
			errorType: "pr-gateway-failure",
			message: "Failed to reply to review thread RT_fail: reply failed",
		});
		expect(prFeedback.replies).toEqual([]);
	});
});
