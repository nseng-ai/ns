import { describe, expect, test } from "vitest";

import type { CommandRunner, ExecOptions } from "@asdl/core/exec";
import {
	RealGithubPrFeedbackGateway,
	replyToReviewThreadMutation,
	resolveReviewThreadMutation,
	reviewThreadCommentsQuery,
	reviewThreadsQuery,
} from "@asdl/core/github-pr-feedback";
import { ScriptedCommandRunner, step } from "@asdl/core/testing";

function reviewThreadsResponse(
	nodes: readonly unknown[],
	pageInfo: Record<string, unknown> = { hasNextPage: false, endCursor: null },
): string {
	return JSON.stringify({
		data: { repository: { pullRequest: { reviewThreads: { nodes, pageInfo } } } },
	});
}

function commentPageResponse(
	nodes: readonly unknown[],
	pageInfo: Record<string, unknown> = { hasNextPage: false, endCursor: null },
): string {
	return JSON.stringify({ data: { node: { comments: { nodes, pageInfo } } } });
}

function comment(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		databaseId: 42,
		body: "looks wrong",
		author: { login: "reviewer" },
		path: "src/app.ts",
		line: 10,
		startLine: 8,
		createdAt: "2026-06-01T00:00:00Z",
		url: "https://github.com/acme/repo/pull/1#discussion_r42",
		...overrides,
	};
}

function thread(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: "RT_thread1",
		isResolved: false,
		isOutdated: false,
		path: "src/app.ts",
		line: 12,
		startLine: 9,
		comments: { nodes: [comment()], pageInfo: { hasNextPage: false, endCursor: null } },
		...overrides,
	};
}

describe("RealGithubPrFeedbackGateway", () => {
	test("looks up PRs and preserves lookup misses", async () => {
		const foundArgs = [
			"pr",
			"view",
			"12",
			"--json",
			"number,title,url,headRefName,headRefOid,baseRefName,state",
		];
		const missArgs = [
			"pr",
			"view",
			"feature/missing",
			"--json",
			"number,title,url,headRefName,headRefOid,baseRefName,state",
		];
		const runner = new ScriptedCommandRunner([
			step("gh", foundArgs, {
				stdout: JSON.stringify({
					number: 12,
					title: "Title",
					url: "https://github.com/acme/repo/pull/12",
					headRefName: "feature/pr",
					headRefOid: "abc",
					baseRefName: "main",
					state: "OPEN",
				}),
			}),
			step("gh", missArgs, { exitCode: 1, stderr: "no pull requests found" }),
		]);
		const gateway = new RealGithubPrFeedbackGateway(runner.runner);

		expect(await gateway.getPr({ cwd: "/repo", prNumber: 12 })).toEqual({
			type: "found",
			pr: {
				number: 12,
				title: "Title",
				url: "https://github.com/acme/repo/pull/12",
				headRefName: "feature/pr",
				headRefOid: "abc",
				baseRefName: "main",
				state: "OPEN",
			},
		});
		expect(await gateway.getPrForBranch({ cwd: "/repo", branch: "feature/missing" })).toEqual({
			type: "miss",
			stderr: "no pull requests found",
			exitCode: 1,
		});
		runner.assertDone();
	});

	test("lists open PRs and reports malformed JSON", async () => {
		const args = [
			"pr",
			"list",
			"--state",
			"open",
			"--json",
			"number,title,url,headRefName,baseRefName,state",
			"--limit",
			"1000",
		];
		const runner = new ScriptedCommandRunner([
			step("gh", args, {
				stdout: JSON.stringify([
					{
						number: 1,
						title: "One",
						url: "https://github.com/acme/repo/pull/1",
						headRefName: "feature/one",
						baseRefName: "main",
						state: "OPEN",
					},
				]),
			}),
			step("gh", args, { stdout: "{" }),
		]);
		const gateway = new RealGithubPrFeedbackGateway(runner.runner);

		expect(await gateway.listOpenPrs({ cwd: "/repo" })).toMatchObject({
			ok: true,
			value: [{ number: 1, headRefName: "feature/one" }],
		});
		const malformed = await gateway.listOpenPrs({ cwd: "/repo" });
		expect(malformed).toMatchObject({
			ok: false,
			error: { code: "github_pr_feedback_json_parse_failed" },
		});
		runner.assertDone();
	});

	test("normalizes PR-level reviews", async () => {
		const args = ["pr", "view", "12", "--json", "reviews"];
		const runner = new ScriptedCommandRunner([
			step("gh", args, {
				stdout: JSON.stringify({
					reviews: [
						{ id: "R1", author: null, body: "", state: "APPROVED" },
						{
							id: "R2",
							author: { login: "reviewer" },
							body: "Please fix",
							state: "CHANGES_REQUESTED",
							submittedAt: "2026-06-01T00:00:00Z",
						},
					],
				}),
			}),
		]);
		const gateway = new RealGithubPrFeedbackGateway(runner.runner);

		expect(await gateway.getPrReviews({ cwd: "/repo", prNumber: 12 })).toEqual({
			ok: true,
			value: [
				{ id: "R1", author: "", body: "", state: "APPROVED", submittedAt: "" },
				{
					id: "R2",
					author: "reviewer",
					body: "Please fix",
					state: "CHANGES_REQUESTED",
					submittedAt: "2026-06-01T00:00:00Z",
				},
			],
		});
		runner.assertDone();
	});

	test("passes cwd, env, timeout, and review-thread query shape to gh", async () => {
		const calls: Array<{ command: string; args: readonly string[]; options: ExecOptions }> = [];
		const runner: CommandRunner = async (command, args, options = {}) => {
			calls.push({ command, args: [...args], options });
			return { stdout: reviewThreadsResponse([]), stderr: "", code: 0, killed: false };
		};
		const gateway = new RealGithubPrFeedbackGateway(runner);
		const env = { PATH: "/fake/bin" };

		expect(await gateway.getPrReviewThreads({ cwd: "/repo", env, prNumber: 1157 })).toEqual({
			ok: true,
			value: [],
		});

		expect(calls).toEqual([
			{
				command: "gh",
				args: [
					"api",
					"graphql",
					"-F",
					"owner={owner}",
					"-F",
					"repo={repo}",
					"-F",
					"number=1157",
					"-f",
					`query=${reviewThreadsQuery}`,
				],
				options: { cwd: "/repo", env, timeout: 30_000 },
			},
		]);
		expect(reviewThreadsQuery).toContain("reviewThreads(first: 100, after: $threadCursor)");
		expect(reviewThreadsQuery).toContain("pageInfo { hasNextPage endCursor }");
		expect(reviewThreadsQuery).toContain("comments(first: 100)");
		expect(reviewThreadsQuery).toContain("line: originalLine");
		expect(reviewThreadsQuery).toContain("startLine: originalStartLine");
		expect(reviewThreadsQuery).toContain("databaseId");
	});

	test("hydrates review threads across thread and nested comment pages", async () => {
		const firstThreadArgs = [
			"api",
			"graphql",
			"-F",
			"owner={owner}",
			"-F",
			"repo={repo}",
			"-F",
			"number=12",
			"-f",
			`query=${reviewThreadsQuery}`,
		];
		const secondThreadArgs = [
			"api",
			"graphql",
			"-F",
			"owner={owner}",
			"-F",
			"repo={repo}",
			"-F",
			"number=12",
			"-F",
			"threadCursor=THREAD_CURSOR",
			"-f",
			`query=${reviewThreadsQuery}`,
		];
		const commentsArgs = [
			"api",
			"graphql",
			"-f",
			"threadId=RT_thread1",
			"-F",
			"commentCursor=COMMENT_CURSOR",
			"-f",
			`query=${reviewThreadCommentsQuery}`,
		];
		const runner = new ScriptedCommandRunner([
			step("gh", firstThreadArgs, {
				stdout: reviewThreadsResponse(
					[
						thread({
							comments: {
								nodes: [comment({ databaseId: 1, body: "first" })],
								pageInfo: { hasNextPage: true, endCursor: "COMMENT_CURSOR" },
							},
						}),
					],
					{ hasNextPage: true, endCursor: "THREAD_CURSOR" },
				),
			}),
			step("gh", commentsArgs, {
				stdout: commentPageResponse([comment({ databaseId: 2, body: "second" })]),
			}),
			step("gh", secondThreadArgs, {
				stdout: reviewThreadsResponse([
					thread({ id: "RT_thread2", isResolved: true, comments: { nodes: [], pageInfo: {} } }),
				]),
			}),
		]);
		const gateway = new RealGithubPrFeedbackGateway(runner.runner);

		expect(await gateway.getPrReviewThreads({ cwd: "/repo", prNumber: 12 })).toEqual({
			ok: true,
			value: [
				expect.objectContaining({
					id: "RT_thread1",
					comments: expect.arrayContaining([
						expect.objectContaining({ id: 1 }),
						expect.objectContaining({ id: 2 }),
					]),
				}),
				expect.objectContaining({ id: "RT_thread2", isResolved: true }),
			],
		});
		runner.assertDone();
	});

	test("preserves command and GraphQL failure details for review threads", async () => {
		const args = [
			"api",
			"graphql",
			"-F",
			"owner={owner}",
			"-F",
			"repo={repo}",
			"-F",
			"number=12",
			"-f",
			`query=${reviewThreadsQuery}`,
		];
		const graphqlErrors = [{ message: "Could not resolve to a PullRequest" }];
		const graphqlStdout = JSON.stringify({ data: null, errors: graphqlErrors });
		const runner = new ScriptedCommandRunner([
			step("gh", args, { exitCode: 2, stdout: "partial", stderr: "gh: boom" }),
			step("gh", args, { stdout: graphqlStdout }),
		]);
		const gateway = new RealGithubPrFeedbackGateway(runner.runner);

		expect(await gateway.getPrReviewThreads({ cwd: "/repo", prNumber: 12 })).toMatchObject({
			ok: false,
			error: {
				code: "github_pr_feedback_gh_failed",
				details: { stdout: "partial", stderr: "gh: boom", exitCode: 2 },
			},
		});
		expect(await gateway.getPrReviewThreads({ cwd: "/repo", prNumber: 12 })).toMatchObject({
			ok: false,
			error: {
				code: "github_pr_feedback_graphql_failed",
				details: { stdout: graphqlStdout, graphqlErrors },
			},
		});
		runner.assertDone();
	});

	test("returns pagination and GraphQL failures for review threads", async () => {
		const args = [
			"api",
			"graphql",
			"-F",
			"owner={owner}",
			"-F",
			"repo={repo}",
			"-F",
			"number=12",
			"-f",
			`query=${reviewThreadsQuery}`,
		];
		const runner = new ScriptedCommandRunner([
			step("gh", args, {
				stdout: reviewThreadsResponse([], { hasNextPage: true, endCursor: null }),
			}),
			step("gh", args, { stdout: JSON.stringify({ errors: [{ message: "bad query" }] }) }),
		]);
		const gateway = new RealGithubPrFeedbackGateway(runner.runner);

		expect(await gateway.getPrReviewThreads({ cwd: "/repo", prNumber: 12 })).toMatchObject({
			ok: false,
			error: { code: "github_pr_feedback_pagination_invalid" },
		});
		expect(await gateway.getPrReviewThreads({ cwd: "/repo", prNumber: 12 })).toMatchObject({
			ok: false,
			error: { code: "github_pr_feedback_graphql_failed" },
		});
		runner.assertDone();
	});

	test("returns startup failures from the command runner", async () => {
		const runner: CommandRunner = async () => {
			throw new Error("spawn gh ENOENT");
		};
		const gateway = new RealGithubPrFeedbackGateway(runner);

		expect(await gateway.getPrReviewThreads({ cwd: "/repo", prNumber: 12 })).toMatchObject({
			ok: false,
			error: { code: "github_pr_feedback_startup_failed", message: "spawn gh ENOENT" },
		});
	});

	test("fetches discussion comments", async () => {
		const args = ["pr", "view", "12", "--json", "comments"];
		const runner = new ScriptedCommandRunner([
			step("gh", args, {
				stdout: JSON.stringify({
					comments: [
						{
							databaseId: 99,
							body: "discussion",
							user: { login: "human" },
							url: "ignored",
							html_url: "https://github.com/acme/repo/pull/12#issuecomment-99",
						},
					],
				}),
			}),
		]);
		const gateway = new RealGithubPrFeedbackGateway(runner.runner);

		expect(await gateway.getPrDiscussionComments({ cwd: "/repo", prNumber: 12 })).toEqual({
			ok: true,
			value: [
				{
					id: 99,
					body: "discussion",
					author: "human",
					url: "https://github.com/acme/repo/pull/12#issuecomment-99",
				},
			],
		});
		runner.assertDone();
	});

	test("replies to and resolves review threads as separate mutations", async () => {
		const replyArgs = [
			"api",
			"graphql",
			"-f",
			"threadId=RT_thread1",
			"-f",
			"body=Fixed in abc123.",
			"-f",
			`query=${replyToReviewThreadMutation}`,
		];
		const resolveArgs = [
			"api",
			"graphql",
			"-f",
			"threadId=RT_thread1",
			"-f",
			`query=${resolveReviewThreadMutation}`,
		];
		const runner = new ScriptedCommandRunner([
			step("gh", replyArgs, {
				stdout: JSON.stringify({
					data: { addPullRequestReviewThreadReply: { comment: comment({ databaseId: 77 }) } },
				}),
			}),
			step("gh", resolveArgs, {
				stdout: JSON.stringify({
					data: { resolveReviewThread: { thread: { id: "RT_thread1", isResolved: true } } },
				}),
			}),
		]);
		const gateway = new RealGithubPrFeedbackGateway(runner.runner);

		expect(
			await gateway.replyToReviewThread({
				cwd: "/repo",
				threadId: "RT_thread1",
				body: "Fixed in abc123.",
			}),
		).toMatchObject({ ok: true, value: { threadId: "RT_thread1", comment: { id: 77 } } });
		expect(await gateway.resolveReviewThread({ cwd: "/repo", threadId: "RT_thread1" })).toEqual({
			ok: true,
			value: { threadId: "RT_thread1", isResolved: true },
		});
		runner.assertDone();
	});

	test("lets callers preserve reply success when a following resolve fails", async () => {
		const runner = new ScriptedCommandRunner([
			step(
				"gh",
				[
					"api",
					"graphql",
					"-f",
					"threadId=RT_thread1",
					"-f",
					"body=Fixed.",
					"-f",
					`query=${replyToReviewThreadMutation}`,
				],
				{
					stdout: JSON.stringify({
						data: { addPullRequestReviewThreadReply: { comment: comment({ databaseId: 88 }) } },
					}),
				},
			),
			step(
				"gh",
				[
					"api",
					"graphql",
					"-f",
					"threadId=RT_thread1",
					"-f",
					`query=${resolveReviewThreadMutation}`,
				],
				{ exitCode: 1, stderr: "cannot resolve" },
			),
		]);
		const gateway = new RealGithubPrFeedbackGateway(runner.runner);

		async function replyThenResolve() {
			const reply = await gateway.replyToReviewThread({
				cwd: "/repo",
				threadId: "RT_thread1",
				body: "Fixed.",
			});
			if (!reply.ok) return { type: "reply_failed" as const, reply };
			const resolve = await gateway.resolveReviewThread({ cwd: "/repo", threadId: "RT_thread1" });
			return { type: resolve.ok ? "resolved" : "resolve_failed", reply, resolve } as const;
		}

		expect(await replyThenResolve()).toMatchObject({
			type: "resolve_failed",
			reply: { ok: true, value: { comment: { id: 88 } } },
			resolve: { ok: false, error: { code: "github_pr_feedback_gh_failed" } },
		});
		runner.assertDone();
	});
});
