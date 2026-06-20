import { describe, expect, test } from "vitest";

import type { CommandRunner, ExecOptions } from "@asdl/core/exec";
import { RealGithubPrFeedbackGateway } from "@asdl/core/github-pr-feedback";
import { ScriptedCommandRunner, step } from "@asdl/core/testing";

import {
	discussionCommentsQuery,
	replyToReviewThreadMutation,
	resolveReviewThreadMutation,
	reviewThreadCommentsQuery,
	reviewThreadsQuery,
} from "../src/github-pr-feedback/queries.ts";

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

function discussionCommentsResponse(
	nodes: readonly unknown[],
	pageInfo: Record<string, unknown> = { hasNextPage: false, endCursor: null },
): string {
	return JSON.stringify({
		data: { repository: { pullRequest: { comments: { nodes, pageInfo } } } },
	});
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

function withoutKey(record: Record<string, unknown>, key: string): Record<string, unknown> {
	const copy = { ...record };
	delete copy[key];
	return copy;
}

interface InvalidResponseDetails {
	readonly prNumber?: number | undefined;
	readonly threadId?: string | undefined;
	readonly cursorContext?: string | undefined;
}

async function expectInvalidResponse(
	resultPromise: Promise<unknown>,
	details: InvalidResponseDetails,
): Promise<void> {
	await expect(resultPromise).resolves.toMatchObject({
		ok: false,
		error: {
			code: "github_pr_feedback_response_invalid",
			details,
		},
	});
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
			ok: true,
			value: {
				found: true,
				pr: {
					number: 12,
					title: "Title",
					url: "https://github.com/acme/repo/pull/12",
					headRefName: "feature/pr",
					headRefOid: "abc",
					baseRefName: "main",
					state: "OPEN",
				},
			},
		});
		expect(await gateway.getPrForBranch({ cwd: "/repo", branch: "feature/missing" })).toEqual({
			ok: true,
			value: {
				found: false,
				miss: { stderr: "no pull requests found", exitCode: 1 },
			},
		});
		runner.assertDone();
	});

	test("treats generic not found lookup output as a gateway failure", async () => {
		const branchArgs = [
			"pr",
			"view",
			"feature/auth",
			"--json",
			"number,title,url,headRefName,headRefOid,baseRefName,state",
		];
		const prArgs = [
			"pr",
			"view",
			"404",
			"--json",
			"number,title,url,headRefName,headRefOid,baseRefName,state",
		];
		const runner = new ScriptedCommandRunner([
			step("gh", branchArgs, { exitCode: 1, stderr: "repository not found" }),
			step("gh", prArgs, { exitCode: 1, stderr: "not found" }),
		]);
		const gateway = new RealGithubPrFeedbackGateway(runner.runner);

		expect(await gateway.getPrForBranch({ cwd: "/repo", branch: "feature/auth" })).toMatchObject({
			ok: false,
			error: { code: "github_pr_feedback_gh_failed" },
		});
		expect(await gateway.getPr({ cwd: "/repo", prNumber: 404 })).toMatchObject({
			ok: false,
			error: { code: "github_pr_feedback_gh_failed" },
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
						{
							id: "R1",
							author: null,
							body: "",
							state: "APPROVED",
							submittedAt: "2026-06-01T00:00:00Z",
						},
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
				{
					id: "R1",
					author: "",
					body: "",
					state: "APPROVED",
					submittedAt: "2026-06-01T00:00:00Z",
				},
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

	test("rejects missing requested PR-level review fields", async () => {
		const args = ["pr", "view", "12", "--json", "reviews"];
		const runner = new ScriptedCommandRunner([
			step("gh", args, {
				stdout: JSON.stringify({
					reviews: [
						{
							id: "R1",
							author: { login: "reviewer" },
							state: "COMMENTED",
							submittedAt: "2026-06-01T00:00:00Z",
						},
					],
				}),
			}),
			step("gh", args, {
				stdout: JSON.stringify({
					reviews: [
						{ id: "R2", author: { login: "reviewer" }, body: "Looks good", state: "APPROVED" },
					],
				}),
			}),
		]);
		const gateway = new RealGithubPrFeedbackGateway(runner.runner);

		await expectInvalidResponse(gateway.getPrReviews({ cwd: "/repo", prNumber: 12 }), {
			prNumber: 12,
		});
		await expectInvalidResponse(gateway.getPrReviews({ cwd: "/repo", prNumber: 12 }), {
			prNumber: 12,
		});
		runner.assertDone();
	});

	test("rejects missing requested review-thread and comment fields", async () => {
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
			step("gh", args, { stdout: reviewThreadsResponse([withoutKey(thread(), "path")]) }),
			step("gh", args, { stdout: reviewThreadsResponse([withoutKey(thread(), "isResolved")]) }),
			step("gh", args, {
				stdout: reviewThreadsResponse([
					thread({
						comments: {
							nodes: [withoutKey(comment(), "body")],
							pageInfo: { hasNextPage: false, endCursor: null },
						},
					}),
				]),
			}),
			step("gh", args, {
				stdout: reviewThreadsResponse([
					thread({
						comments: {
							nodes: [withoutKey(comment(), "path")],
							pageInfo: { hasNextPage: false, endCursor: null },
						},
					}),
				]),
			}),
		]);
		const gateway = new RealGithubPrFeedbackGateway(runner.runner);

		await expectInvalidResponse(gateway.getPrReviewThreads({ cwd: "/repo", prNumber: 12 }), {
			prNumber: 12,
			cursorContext: "reviewThreads",
		});
		await expectInvalidResponse(gateway.getPrReviewThreads({ cwd: "/repo", prNumber: 12 }), {
			prNumber: 12,
			cursorContext: "reviewThreads",
		});
		await expectInvalidResponse(gateway.getPrReviewThreads({ cwd: "/repo", prNumber: 12 }), {
			prNumber: 12,
			cursorContext: "reviewThreads",
		});
		await expectInvalidResponse(gateway.getPrReviewThreads({ cwd: "/repo", prNumber: 12 }), {
			prNumber: 12,
			cursorContext: "reviewThreads",
		});
		runner.assertDone();
	});

	test("rejects missing requested discussion comment fields", async () => {
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
			`query=${discussionCommentsQuery}`,
		];
		const discussion: Record<string, unknown> = {
			databaseId: 99,
			body: "discussion",
			author: { login: "human" },
			url: "https://github.com/acme/repo/pull/12#issuecomment-99",
		};
		const runner = new ScriptedCommandRunner([
			step("gh", args, { stdout: discussionCommentsResponse([withoutKey(discussion, "body")]) }),
			step("gh", args, { stdout: discussionCommentsResponse([withoutKey(discussion, "url")]) }),
		]);
		const gateway = new RealGithubPrFeedbackGateway(runner.runner);

		await expectInvalidResponse(gateway.getPrDiscussionComments({ cwd: "/repo", prNumber: 12 }), {
			prNumber: 12,
			cursorContext: "discussionComments",
		});
		await expectInvalidResponse(gateway.getPrDiscussionComments({ cwd: "/repo", prNumber: 12 }), {
			prNumber: 12,
			cursorContext: "discussionComments",
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
					thread({
						id: "RT_thread2",
						isResolved: true,
						comments: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
					}),
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
			error: {
				code: "github_pr_feedback_pagination_invalid",
				details: { prNumber: 12, cursorContext: "reviewThreads" },
			},
		});
		expect(await gateway.getPrReviewThreads({ cwd: "/repo", prNumber: 12 })).toMatchObject({
			ok: false,
			error: { code: "github_pr_feedback_graphql_failed" },
		});
		runner.assertDone();
	});

	test("returns pagination failures for review thread comments", async () => {
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
				stdout: reviewThreadsResponse([
					thread({
						comments: {
							nodes: [comment({ databaseId: 1 })],
							pageInfo: { hasNextPage: true, endCursor: null },
						},
					}),
				]),
			}),
		]);
		const gateway = new RealGithubPrFeedbackGateway(runner.runner);

		expect(await gateway.getPrReviewThreads({ cwd: "/repo", prNumber: 12 })).toMatchObject({
			ok: false,
			error: {
				code: "github_pr_feedback_pagination_invalid",
				details: {
					prNumber: 12,
					threadId: "RT_thread1",
					cursorContext: "reviewThreadComments",
				},
			},
		});
		runner.assertDone();
	});

	test("normalizes null review-thread comment authors and empty comment nodes", async () => {
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
				stdout: reviewThreadsResponse([
					thread({
						comments: {
							nodes: [comment({ author: null })],
							pageInfo: { hasNextPage: false, endCursor: null },
						},
					}),
					thread({
						id: "RT_empty",
						comments: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
					}),
				]),
			}),
		]);
		const gateway = new RealGithubPrFeedbackGateway(runner.runner);

		expect(await gateway.getPrReviewThreads({ cwd: "/repo", prNumber: 12 })).toMatchObject({
			ok: true,
			value: [
				expect.objectContaining({ comments: [expect.objectContaining({ author: "" })] }),
				expect.objectContaining({ id: "RT_empty", comments: [] }),
			],
		});
		runner.assertDone();
	});

	// This test pins the intentional hard-fail behavior for malformed identity fields:
	// a review/comment response with no usable numeric identity invalidates the whole response.
	test("rejects malformed review thread and review comment identities", async () => {
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
			step("gh", args, { stdout: reviewThreadsResponse([thread({ id: undefined })]) }),
			step("gh", args, { stdout: reviewThreadsResponse([thread({ id: null })]) }),
			step("gh", args, {
				stdout: reviewThreadsResponse([
					thread({
						comments: {
							nodes: [comment({ databaseId: undefined })],
							pageInfo: { hasNextPage: false, endCursor: null },
						},
					}),
				]),
			}),
			step("gh", args, {
				stdout: reviewThreadsResponse([
					thread({
						comments: {
							nodes: [comment({ databaseId: 1 })],
							pageInfo: { hasNextPage: true, endCursor: "COMMENT_CURSOR" },
						},
					}),
				]),
			}),
			step("gh", commentsArgs, {
				stdout: commentPageResponse([comment({ databaseId: undefined })]),
			}),
		]);
		const gateway = new RealGithubPrFeedbackGateway(runner.runner);

		await expectInvalidResponse(gateway.getPrReviewThreads({ cwd: "/repo", prNumber: 12 }), {
			prNumber: 12,
			cursorContext: "reviewThreads",
		});
		await expectInvalidResponse(gateway.getPrReviewThreads({ cwd: "/repo", prNumber: 12 }), {
			prNumber: 12,
			cursorContext: "reviewThreads",
		});
		await expectInvalidResponse(gateway.getPrReviewThreads({ cwd: "/repo", prNumber: 12 }), {
			prNumber: 12,
			cursorContext: "reviewThreads",
		});
		await expectInvalidResponse(gateway.getPrReviewThreads({ cwd: "/repo", prNumber: 12 }), {
			prNumber: 12,
			threadId: "RT_thread1",
			cursorContext: "reviewThreadComments",
		});
		runner.assertDone();
	});

	test("rejects malformed discussion comment and reply identities", async () => {
		const discussionArgs = [
			"api",
			"graphql",
			"-F",
			"owner={owner}",
			"-F",
			"repo={repo}",
			"-F",
			"number=12",
			"-f",
			`query=${discussionCommentsQuery}`,
		];
		const replyArgs = [
			"api",
			"graphql",
			"-f",
			"threadId=RT_thread1",
			"-f",
			"body=Fixed.",
			"-f",
			`query=${replyToReviewThreadMutation}`,
		];
		const runner = new ScriptedCommandRunner([
			step("gh", discussionArgs, {
				stdout: discussionCommentsResponse([{ body: "discussion", author: { login: "human" } }]),
			}),
			step("gh", discussionArgs, {
				stdout: discussionCommentsResponse([{ databaseId: "not numeric", body: "discussion" }]),
			}),
			step("gh", replyArgs, {
				stdout: JSON.stringify({
					data: {
						addPullRequestReviewThreadReply: {
							comment: comment({ databaseId: undefined }),
						},
					},
				}),
			}),
		]);
		const gateway = new RealGithubPrFeedbackGateway(runner.runner);

		await expectInvalidResponse(gateway.getPrDiscussionComments({ cwd: "/repo", prNumber: 12 }), {
			prNumber: 12,
			cursorContext: "discussionComments",
		});
		await expectInvalidResponse(gateway.getPrDiscussionComments({ cwd: "/repo", prNumber: 12 }), {
			prNumber: 12,
			cursorContext: "discussionComments",
		});
		await expectInvalidResponse(
			gateway.replyToReviewThread({ cwd: "/repo", threadId: "RT_thread1", body: "Fixed." }),
			{ threadId: "RT_thread1" },
		);
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

	test("returns pagination failures for discussion comments", async () => {
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
			`query=${discussionCommentsQuery}`,
		];
		const runner = new ScriptedCommandRunner([
			step("gh", args, {
				stdout: discussionCommentsResponse([], { hasNextPage: true, endCursor: null }),
			}),
		]);
		const gateway = new RealGithubPrFeedbackGateway(runner.runner);

		expect(await gateway.getPrDiscussionComments({ cwd: "/repo", prNumber: 12 })).toMatchObject({
			ok: false,
			error: {
				code: "github_pr_feedback_pagination_invalid",
				details: { prNumber: 12, cursorContext: "discussionComments" },
			},
		});
		runner.assertDone();
	});

	test("fetches paginated discussion comments with GraphQL database IDs", async () => {
		const firstArgs = [
			"api",
			"graphql",
			"-F",
			"owner={owner}",
			"-F",
			"repo={repo}",
			"-F",
			"number=12",
			"-f",
			`query=${discussionCommentsQuery}`,
		];
		const secondArgs = [
			"api",
			"graphql",
			"-F",
			"owner={owner}",
			"-F",
			"repo={repo}",
			"-F",
			"number=12",
			"-F",
			"commentCursor=COMMENT_CURSOR",
			"-f",
			`query=${discussionCommentsQuery}`,
		];
		const runner = new ScriptedCommandRunner([
			step("gh", firstArgs, {
				stdout: discussionCommentsResponse(
					[
						{
							databaseId: 99,
							body: "discussion",
							author: { login: "human" },
							url: "https://github.com/acme/repo/pull/12#issuecomment-99",
						},
					],
					{ hasNextPage: true, endCursor: "COMMENT_CURSOR" },
				),
			}),
			step("gh", secondArgs, {
				stdout: discussionCommentsResponse([
					{
						databaseId: 100,
						body: "follow-up",
						author: { login: "maintainer" },
						url: "https://github.com/acme/repo/pull/12#issuecomment-100",
					},
				]),
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
				{
					id: 100,
					body: "follow-up",
					author: "maintainer",
					url: "https://github.com/acme/repo/pull/12#issuecomment-100",
				},
			],
		});
		expect(discussionCommentsQuery).toContain("comments(first: 100, after: $commentCursor)");
		expect(discussionCommentsQuery).toContain("pageInfo { hasNextPage endCursor }");
		expect(discussionCommentsQuery).toContain("databaseId");
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
