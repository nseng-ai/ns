import { describe, expect, test } from "vitest";

import type { CommandRunner, ExecOptions } from "@nseng-ai/foundation/exec";
import { RealGithubPrFeedbackGateway } from "@nseng-ai/capability-kit/github/pr-feedback";
import { FakeGithubPrFeedbackGateway } from "@nseng-ai/capability-kit/github/testing";
import { exitedResult, ScriptedCommandRunner } from "@nseng-ai/foundation/exec/testing";

import {
	branchPrCheckContextsPageArgs,
	branchPrChecksArgs,
	branchPrCheckThreadsPageArgs,
	discussionCommentPageArgs,
	resolveReviewThreadsArgs,
	reviewThreadCommentPageArgs,
	reviewThreadPageArgs,
} from "../../src/github/pr-feedback/args.ts";
import {
	branchPrCheckContextsQuery,
	branchPrChecksQuery,
	branchPrCheckThreadsQuery,
	discussionCommentsQuery,
	replyToReviewThreadMutation,
	resolveReviewThreadMutation,
	resolveReviewThreadsMutation,
	reviewThreadCommentsQuery,
	reviewThreadsQuery,
} from "../../src/github/pr-feedback/queries.ts";

function step(
	command: string,
	args: readonly string[],
	result: { readonly stdout?: string; readonly stderr?: string; readonly exitCode?: number } = {},
) {
	return {
		command,
		args: [...args],
		result: exitedResult({
			code: result.exitCode ?? 0,
			stdout: result.stdout ?? "",
			stderr: result.stderr ?? "",
		}),
	};
}

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

function branchPrNode(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	const number = typeof overrides.number === "number" ? overrides.number : 101;
	return {
		number,
		title: `PR ${number}`,
		url: `https://github.com/acme/repo/pull/${number}`,
		headRefName: "feature/base",
		headRefOid: `abc${number}`,
		baseRefName: "main",
		isDraft: false,
		commits: {
			nodes: [{ commit: { oid: `abc${number}`, committedDate: "2026-06-01T00:00:00Z" } }],
		},
		statusCheckRollup: null,
		reviewThreads: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
		...overrides,
	};
}

function branchPrChecksResponse(aliases: Record<string, unknown>): string {
	return JSON.stringify({ data: { repository: aliases } });
}

function withoutKey(record: Record<string, unknown>, key: string): Record<string, unknown> {
	const copy = { ...record };
	delete copy[key];
	return copy;
}

interface InvalidResponseDetails {
	readonly prNumber?: number;
	readonly threadId?: string;
	readonly cursorContext?: string;
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
	test("passes pagination cursors as raw GraphQL fields", () => {
		const cursor = "@/tmp/secret";

		expect(reviewThreadPageArgs(12, cursor)).toEqual([
			"api",
			"graphql",
			"-F",
			"owner={owner}",
			"-F",
			"repo={repo}",
			"-F",
			"number=12",
			"-f",
			"threadCursor=@/tmp/secret",
			"-f",
			`query=${reviewThreadsQuery}`,
		]);
		expect(discussionCommentPageArgs(12, cursor)).toEqual([
			"api",
			"graphql",
			"-F",
			"owner={owner}",
			"-F",
			"repo={repo}",
			"-F",
			"number=12",
			"-f",
			"commentCursor=@/tmp/secret",
			"-f",
			`query=${discussionCommentsQuery}`,
		]);
		expect(reviewThreadCommentPageArgs("RT_thread1", cursor)).toEqual([
			"api",
			"graphql",
			"-f",
			"threadId=RT_thread1",
			"-f",
			"commentCursor=@/tmp/secret",
			"-f",
			`query=${reviewThreadCommentsQuery}`,
		]);
	});

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
							state: "PENDING",
							submittedAt: null,
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
					state: "PENDING",
					submittedAt: null,
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
			return {
				stdout: reviewThreadsResponse([]),
				stderr: "",
				code: 0,
				type: "exited",
				signal: null,
			};
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
			"-f",
			"threadCursor=THREAD_CURSOR",
			"-f",
			`query=${reviewThreadsQuery}`,
		];
		const commentsArgs = [
			"api",
			"graphql",
			"-f",
			"threadId=RT_thread1",
			"-f",
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
			"-f",
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
			"-f",
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

	test("builds batched resolve review thread GraphQL args", () => {
		const query = resolveReviewThreadsMutation(2);

		expect(resolveReviewThreadsArgs(["RT_one", "RT_two"])).toEqual([
			"api",
			"graphql",
			"-f",
			"threadId0=RT_one",
			"-f",
			"threadId1=RT_two",
			"-f",
			`query=${query}`,
		]);
		expect(query).toContain("mutation($threadId0: ID!, $threadId1: ID!)");
		expect(query).toContain("resolve0: resolveReviewThread(input: { threadId: $threadId0 })");
		expect(query).toContain("resolve1: resolveReviewThread(input: { threadId: $threadId1 })");
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

	test("resolves review threads in a single aliased GraphQL mutation", async () => {
		const args = resolveReviewThreadsArgs(["RT_one", "RT_two"]);
		const runner = new ScriptedCommandRunner([
			step("gh", args, {
				stdout: JSON.stringify({
					data: {
						resolve0: { thread: { id: "RT_one", isResolved: true } },
						resolve1: { thread: { id: "RT_two", isResolved: true } },
					},
				}),
			}),
		]);
		const gateway = new RealGithubPrFeedbackGateway(runner.runner);

		expect(
			await gateway.resolveReviewThreads({ cwd: "/repo", threadIds: ["RT_one", "RT_two"] }),
		).toEqual({
			ok: true,
			value: [
				{ threadId: "RT_one", isResolved: true },
				{ threadId: "RT_two", isResolved: true },
			],
		});
		runner.assertDone();
	});

	test("rejects malformed batched resolve responses", async () => {
		const args = resolveReviewThreadsArgs(["RT_one", "RT_two"]);
		const runner = new ScriptedCommandRunner([
			step("gh", args, {
				stdout: JSON.stringify({
					data: { resolve0: { thread: { id: "RT_one", isResolved: true } } },
				}),
			}),
			step("gh", args, {
				stdout: JSON.stringify({
					data: {
						resolve0: { thread: { id: "RT_one", isResolved: true } },
						resolve1: { thread: { id: "RT_other", isResolved: true } },
					},
				}),
			}),
			step("gh", args, { exitCode: 1, stderr: "cannot resolve" }),
		]);
		const gateway = new RealGithubPrFeedbackGateway(runner.runner);

		expect(
			await gateway.resolveReviewThreads({ cwd: "/repo", threadIds: ["RT_one", "RT_two"] }),
		).toMatchObject({
			ok: false,
			error: {
				code: "github_pr_feedback_response_invalid",
				details: { operation: "resolveReviewThreads", threadId: "RT_two" },
			},
		});
		expect(
			await gateway.resolveReviewThreads({ cwd: "/repo", threadIds: ["RT_one", "RT_two"] }),
		).toMatchObject({
			ok: false,
			error: {
				code: "github_pr_feedback_response_invalid",
				details: { operation: "resolveReviewThreads", threadId: "RT_two" },
			},
		});
		expect(
			await gateway.resolveReviewThreads({ cwd: "/repo", threadIds: ["RT_one", "RT_two"] }),
		).toMatchObject({
			ok: false,
			error: {
				code: "github_pr_feedback_gh_failed",
				details: { operation: "resolveReviewThreads", stderr: "cannot resolve" },
			},
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

	test("builds batched branch PR checks GraphQL args", () => {
		const query = branchPrChecksQuery(2);

		expect(branchPrChecksArgs(["feature/base", "feature/top"])).toEqual([
			"api",
			"graphql",
			"-F",
			"owner={owner}",
			"-F",
			"repo={repo}",
			"-f",
			"branch0=feature/base",
			"-f",
			"branch1=feature/top",
			"-f",
			`query=${query}`,
		]);
		expect(query).toContain(
			"query($owner: String!, $repo: String!, $branch0: String!, $branch1: String!)",
		);
		expect(query).toContain(
			"b0: pullRequests(first: 2, states: OPEN, headRefName: $branch0, orderBy: { field: UPDATED_AT, direction: DESC })",
		);
		expect(query).toContain("b1: pullRequests(first: 2, states: OPEN, headRefName: $branch1");
		expect(query).toContain("number title url headRefName headRefOid baseRefName isDraft");
		expect(query).toContain("commits(last: 1) { nodes { commit { oid committedDate } } }");
		expect(query).toContain("reviewThreads(first: 100)");
		expect(query).toContain(
			"checkSuite { workflowRun { databaseId runNumber runAttempt createdAt updatedAt workflow { name } } }",
		);
		expect(() => branchPrChecksQuery(0)).toThrow("must be positive");
	});

	test("fetches branch PRs and checks from the initial aliased GraphQL query", async () => {
		const args = branchPrChecksArgs(["feature/base", "feature/top"]);
		const runner = new ScriptedCommandRunner([
			step("gh", args, {
				stdout: branchPrChecksResponse({
					b0: {
						nodes: [
							branchPrNode({
								number: 101,
								headRefName: "feature/base",
								statusCheckRollup: {
									contexts: {
										pageInfo: { hasNextPage: false, endCursor: null },
										nodes: [
											{
												__typename: "CheckRun",
												name: "typescript",
												status: "COMPLETED",
												conclusion: "FAILURE",
												checkSuite: { workflowRun: { workflow: { name: "ci" } } },
											},
											{ __typename: "StatusContext", context: "lint", state: "SUCCESS" },
										],
									},
								},
							}),
						],
					},
					b1: { nodes: [branchPrNode({ number: 102, headRefName: "feature/top" })] },
				}),
			}),
		]);
		const gateway = new RealGithubPrFeedbackGateway(runner.runner);

		const result = await gateway.getBranchPrChecks({
			cwd: "/repo",
			branches: ["feature/base", "feature/top"],
		});
		expect(result).toMatchObject({
			ok: true,
			value: [
				{
					branch: "feature/base",
					type: "found",
					pr: {
						number: 101,
						title: "PR 101",
						headRefName: "feature/base",
						baseRefName: "main",
						state: "OPEN",
						headRefOid: "abc101",
					},
					isDraft: false,
					headCommitCommittedAt: "2026-06-01T00:00:00Z",
					reviewThreads: [],
					checks: {
						counts: { passing: 1, pending: 0, failing: 1, unknown: 0, hasMore: false },
					},
				},
				{
					branch: "feature/top",
					type: "found",
					pr: { number: 102 },
					checks: { counts: { passing: 0, pending: 0, failing: 0, unknown: 0, hasMore: false } },
				},
			],
		});
		runner.assertDone();
	});

	test("completes branch check and review-thread continuation pages", async () => {
		const initialArgs = branchPrChecksArgs(["feature/base"]);
		const checkArgs = branchPrCheckContextsPageArgs(101, "CHECK_CURSOR");
		const threadArgs = branchPrCheckThreadsPageArgs(101, "THREAD_CURSOR");
		const firstCheck = {
			__typename: "StatusContext",
			context: "first",
			state: "SUCCESS",
			createdAt: "2026-06-01T00:01:00Z",
		};
		const secondCheck = {
			__typename: "StatusContext",
			context: "second",
			state: "FAILURE",
			createdAt: "2026-06-01T00:02:00Z",
		};
		const runner = new ScriptedCommandRunner([
			step("gh", initialArgs, {
				stdout: branchPrChecksResponse({
					b0: {
						nodes: [
							branchPrNode({
								statusCheckRollup: {
									contexts: {
										nodes: [firstCheck],
										pageInfo: { hasNextPage: true, endCursor: "CHECK_CURSOR" },
									},
								},
								reviewThreads: {
									nodes: [{ isResolved: true }],
									pageInfo: { hasNextPage: true, endCursor: "THREAD_CURSOR" },
								},
							}),
						],
					},
				}),
			}),
			step("gh", checkArgs, {
				stdout: JSON.stringify({
					data: {
						repository: {
							pullRequest: {
								statusCheckRollup: {
									contexts: {
										nodes: [secondCheck],
										pageInfo: { hasNextPage: false, endCursor: null },
									},
								},
							},
						},
					},
				}),
			}),
			step("gh", threadArgs, {
				stdout: JSON.stringify({
					data: {
						repository: {
							pullRequest: {
								reviewThreads: {
									nodes: [{ isResolved: false }],
									pageInfo: { hasNextPage: false, endCursor: null },
								},
							},
						},
					},
				}),
			}),
		]);
		const gateway = new RealGithubPrFeedbackGateway(runner.runner);

		expect(
			await gateway.getBranchPrChecks({ cwd: "/repo", branches: ["feature/base"] }),
		).toMatchObject({
			ok: true,
			value: [
				{
					type: "found",
					reviewThreads: [{ isResolved: true }, { isResolved: false }],
					checks: {
						counts: { passing: 1, failing: 1, hasMore: false },
						checks: [{ name: "first" }, { name: "second" }],
					},
				},
			],
		});
		expect(branchPrCheckContextsQuery).toContain("after: $checkCursor");
		expect(branchPrCheckThreadsQuery).toContain("after: $threadCursor");
		runner.assertDone();
	});

	test("deduplicates workflow attempts only after collecting all check pages", async () => {
		const initialArgs = branchPrChecksArgs(["feature/base"]);
		const checkArgs = branchPrCheckContextsPageArgs(101, "CHECK_CURSOR");
		const supersededRun = {
			__typename: "CheckRun",
			name: "old-job",
			status: "COMPLETED",
			conclusion: "FAILURE",
			checkSuite: {
				workflowRun: { databaseId: 1, runNumber: 1, runAttempt: 1, workflow: { name: "ci" } },
			},
		};
		const latestRun = {
			__typename: "CheckRun",
			name: "new-job",
			status: "COMPLETED",
			conclusion: "SUCCESS",
			checkSuite: {
				workflowRun: { databaseId: 2, runNumber: 2, runAttempt: 1, workflow: { name: "ci" } },
			},
		};
		const runner = new ScriptedCommandRunner([
			step("gh", initialArgs, {
				stdout: branchPrChecksResponse({
					b0: {
						nodes: [
							branchPrNode({
								statusCheckRollup: {
									contexts: {
										nodes: [supersededRun],
										pageInfo: { hasNextPage: true, endCursor: "CHECK_CURSOR" },
									},
								},
							}),
						],
					},
				}),
			}),
			step("gh", checkArgs, {
				stdout: JSON.stringify({
					data: {
						repository: {
							pullRequest: {
								statusCheckRollup: {
									contexts: {
										nodes: [latestRun],
										pageInfo: { hasNextPage: false, endCursor: null },
									},
								},
							},
						},
					},
				}),
			}),
		]);
		const gateway = new RealGithubPrFeedbackGateway(runner.runner);

		expect(
			await gateway.getBranchPrChecks({ cwd: "/repo", branches: ["feature/base"] }),
		).toMatchObject({
			ok: true,
			value: [
				{
					checks: {
						counts: { passing: 1, failing: 0, hasMore: false },
						checks: [{ name: "new-job", conclusion: "SUCCESS" }],
					},
				},
			],
		});
		runner.assertDone();
	});

	test("keeps only the latest workflow run per batched branch entry", async () => {
		const args = branchPrChecksArgs(["feature/base"]);
		const supersededRun = {
			__typename: "CheckRun",
			name: "typescript",
			status: "COMPLETED",
			conclusion: "FAILURE",
			checkSuite: {
				workflowRun: { databaseId: 1, runNumber: 1, runAttempt: 1, workflow: { name: "ci" } },
			},
		};
		const latestRun = {
			__typename: "CheckRun",
			name: "typescript",
			status: "COMPLETED",
			conclusion: "SUCCESS",
			checkSuite: {
				workflowRun: { databaseId: 2, runNumber: 2, runAttempt: 1, workflow: { name: "ci" } },
			},
		};
		const runner = new ScriptedCommandRunner([
			step("gh", args, {
				stdout: branchPrChecksResponse({
					b0: {
						nodes: [
							branchPrNode({
								headRefName: "feature/base",
								statusCheckRollup: {
									contexts: {
										pageInfo: { hasNextPage: false },
										nodes: [supersededRun, latestRun],
									},
								},
							}),
						],
					},
				}),
			}),
		]);
		const gateway = new RealGithubPrFeedbackGateway(runner.runner);

		expect(
			await gateway.getBranchPrChecks({ cwd: "/repo", branches: ["feature/base"] }),
		).toMatchObject({
			ok: true,
			value: [
				{
					type: "found",
					checks: {
						counts: { passing: 1, failing: 0 },
						checks: [{ name: "typescript", conclusion: "SUCCESS" }],
					},
				},
			],
		});
		runner.assertDone();
	});

	test("reports missing, ambiguous, and checkless branches from one batched query", async () => {
		const args = branchPrChecksArgs(["gone", "doubled", "quiet"]);
		const runner = new ScriptedCommandRunner([
			step("gh", args, {
				stdout: branchPrChecksResponse({
					b0: { nodes: [] },
					b1: {
						nodes: [
							branchPrNode({ number: 201, headRefName: "doubled" }),
							branchPrNode({ number: 202, headRefName: "doubled" }),
						],
					},
					b2: { nodes: [branchPrNode({ number: 203, headRefName: "quiet" })] },
				}),
			}),
		]);
		const gateway = new RealGithubPrFeedbackGateway(runner.runner);

		expect(
			await gateway.getBranchPrChecks({ cwd: "/repo", branches: ["gone", "doubled", "quiet"] }),
		).toMatchObject({
			ok: true,
			value: [
				{ branch: "gone", type: "missing" },
				{
					branch: "doubled",
					type: "ambiguous",
					candidates: [{ number: 201 }, { number: 202 }],
				},
				{
					branch: "quiet",
					type: "found",
					checks: { counts: { passing: 0, pending: 0, failing: 0, unknown: 0, hasMore: false } },
				},
			],
		});
		runner.assertDone();
	});

	test("rejects head commit evidence that does not match headRefOid", async () => {
		const args = branchPrChecksArgs(["feature/base"]);
		const runner = new ScriptedCommandRunner([
			step("gh", args, {
				stdout: branchPrChecksResponse({
					b0: {
						nodes: [
							branchPrNode({
								commits: {
									nodes: [{ commit: { oid: "different", committedDate: "2026-06-01T00:00:00Z" } }],
								},
							}),
						],
					},
				}),
			}),
		]);
		const gateway = new RealGithubPrFeedbackGateway(runner.runner);

		expect(
			await gateway.getBranchPrChecks({ cwd: "/repo", branches: ["feature/base"] }),
		).toMatchObject({
			ok: false,
			error: {
				code: "github_pr_feedback_response_invalid",
				details: { operation: "getBranchPrChecks", prNumber: 101 },
			},
		});
		runner.assertDone();
	});

	test.each([
		["check", "statusCheckRollup", "branchPrCheckContexts"],
		["thread", "reviewThreads", "branchPrCheckReviewThreads"],
	] as const)(
		"rejects a missing initial %s continuation cursor",
		async (_name, connection, cursorContext) => {
			const overrides =
				connection === "statusCheckRollup"
					? {
							statusCheckRollup: {
								contexts: { nodes: [], pageInfo: { hasNextPage: true, endCursor: null } },
							},
						}
					: {
							reviewThreads: {
								nodes: [],
								pageInfo: { hasNextPage: true, endCursor: null },
							},
						};
			const runner = new ScriptedCommandRunner([
				step("gh", branchPrChecksArgs(["feature/base"]), {
					stdout: branchPrChecksResponse({ b0: { nodes: [branchPrNode(overrides)] } }),
				}),
			]);
			const gateway = new RealGithubPrFeedbackGateway(runner.runner);

			expect(
				await gateway.getBranchPrChecks({ cwd: "/repo", branches: ["feature/base"] }),
			).toMatchObject({
				ok: false,
				error: {
					code: "github_pr_feedback_pagination_invalid",
					details: { prNumber: 101, cursorContext },
				},
			});
			runner.assertDone();
		},
	);

	test("rejects malformed and null check continuation payloads without partial success", async () => {
		const initialArgs = branchPrChecksArgs(["feature/base"]);
		const continuationArgs = branchPrCheckContextsPageArgs(101, "CHECK_CURSOR");
		const initial = branchPrChecksResponse({
			b0: {
				nodes: [
					branchPrNode({
						statusCheckRollup: {
							contexts: {
								nodes: [{ __typename: "StatusContext", context: "first", state: "SUCCESS" }],
								pageInfo: { hasNextPage: true, endCursor: "CHECK_CURSOR" },
							},
						},
					}),
				],
			},
		});
		const runner = new ScriptedCommandRunner([
			step("gh", initialArgs, { stdout: initial }),
			step("gh", continuationArgs, { stdout: "{" }),
			step("gh", initialArgs, { stdout: initial }),
			step("gh", continuationArgs, {
				stdout: JSON.stringify({ data: { repository: { pullRequest: null } } }),
			}),
		]);
		const gateway = new RealGithubPrFeedbackGateway(runner.runner);
		const params = { cwd: "/repo", branches: ["feature/base"] } as const;

		expect(await gateway.getBranchPrChecks(params)).toMatchObject({
			ok: false,
			error: { code: "github_pr_feedback_json_parse_failed" },
		});
		expect(await gateway.getBranchPrChecks(params)).toMatchObject({
			ok: false,
			error: {
				code: "github_pr_feedback_pagination_invalid",
				details: { cursorContext: "branchPrCheckContexts" },
			},
		});
		runner.assertDone();
	});

	test("rejects malformed and null thread continuation payloads without partial success", async () => {
		const initialArgs = branchPrChecksArgs(["feature/base"]);
		const continuationArgs = branchPrCheckThreadsPageArgs(101, "THREAD_CURSOR");
		const initial = branchPrChecksResponse({
			b0: {
				nodes: [
					branchPrNode({
						reviewThreads: {
							nodes: [{ isResolved: true }],
							pageInfo: { hasNextPage: true, endCursor: "THREAD_CURSOR" },
						},
					}),
				],
			},
		});
		const runner = new ScriptedCommandRunner([
			step("gh", initialArgs, { stdout: initial }),
			step("gh", continuationArgs, { stdout: JSON.stringify({ data: null }) }),
			step("gh", initialArgs, { stdout: initial }),
			step("gh", continuationArgs, {
				stdout: JSON.stringify({ data: { repository: { pullRequest: null } } }),
			}),
		]);
		const gateway = new RealGithubPrFeedbackGateway(runner.runner);
		const params = { cwd: "/repo", branches: ["feature/base"] } as const;

		expect(await gateway.getBranchPrChecks(params)).toMatchObject({
			ok: false,
			error: { code: "github_pr_feedback_response_invalid" },
		});
		expect(await gateway.getBranchPrChecks(params)).toMatchObject({
			ok: false,
			error: {
				code: "github_pr_feedback_pagination_invalid",
				details: { cursorContext: "branchPrCheckReviewThreads" },
			},
		});
		runner.assertDone();
	});

	test("returns a later thread-page gh failure instead of partial branch facts", async () => {
		const initialArgs = branchPrChecksArgs(["feature/base"]);
		const continuationArgs = branchPrCheckThreadsPageArgs(101, "THREAD_CURSOR");
		const runner = new ScriptedCommandRunner([
			step("gh", initialArgs, {
				stdout: branchPrChecksResponse({
					b0: {
						nodes: [
							branchPrNode({
								reviewThreads: {
									nodes: [{ isResolved: true }],
									pageInfo: { hasNextPage: true, endCursor: "THREAD_CURSOR" },
								},
							}),
						],
					},
				}),
			}),
			step("gh", continuationArgs, { exitCode: 1, stderr: "thread continuation failed" }),
		]);
		const gateway = new RealGithubPrFeedbackGateway(runner.runner);

		expect(
			await gateway.getBranchPrChecks({ cwd: "/repo", branches: ["feature/base"] }),
		).toMatchObject({
			ok: false,
			error: {
				code: "github_pr_feedback_gh_failed",
				details: {
					stderr: "thread continuation failed",
					cursorContext: "branchPrCheckReviewThreads",
				},
			},
		});
		runner.assertDone();
	});

	test("returns later-page gh and GraphQL failures instead of partial branch facts", async () => {
		const initialArgs = branchPrChecksArgs(["feature/base"]);
		const continuationArgs = branchPrCheckContextsPageArgs(101, "CHECK_CURSOR");
		const initial = branchPrChecksResponse({
			b0: {
				nodes: [
					branchPrNode({
						statusCheckRollup: {
							contexts: { nodes: [], pageInfo: { hasNextPage: true, endCursor: "CHECK_CURSOR" } },
						},
					}),
				],
			},
		});
		const runner = new ScriptedCommandRunner([
			step("gh", initialArgs, { stdout: initial }),
			step("gh", continuationArgs, { exitCode: 1, stderr: "continuation failed" }),
			step("gh", initialArgs, { stdout: initial }),
			step("gh", continuationArgs, {
				stdout: JSON.stringify({ data: null, errors: [{ message: "later page failed" }] }),
			}),
		]);
		const gateway = new RealGithubPrFeedbackGateway(runner.runner);
		const params = { cwd: "/repo", branches: ["feature/base"] } as const;

		expect(await gateway.getBranchPrChecks(params)).toMatchObject({
			ok: false,
			error: { code: "github_pr_feedback_gh_failed", details: { stderr: "continuation failed" } },
		});
		expect(await gateway.getBranchPrChecks(params)).toMatchObject({
			ok: false,
			error: { code: "github_pr_feedback_graphql_failed" },
		});
		runner.assertDone();
	});

	test("rejects malformed batched branch PR checks responses", async () => {
		const args = branchPrChecksArgs(["feature/base", "feature/top"]);
		const runner = new ScriptedCommandRunner([
			step("gh", args, {
				stdout: branchPrChecksResponse({
					b0: { nodes: [branchPrNode({ headRefName: "feature/base" })] },
				}),
			}),
			step("gh", args, {
				stdout: branchPrChecksResponse({
					b0: { nodes: [branchPrNode({ headRefName: "feature/base" })] },
					b1: { nodes: [branchPrNode({ headRefName: "feature/other" })] },
				}),
			}),
			step("gh", args, { exitCode: 1, stderr: "boom" }),
			step("gh", args, {
				stdout: JSON.stringify({
					data: { repository: { b0: { nodes: [] }, b1: { nodes: [] } } },
					errors: [{ message: "Field 'pullRequests' is broken" }],
				}),
			}),
		]);
		const gateway = new RealGithubPrFeedbackGateway(runner.runner);
		const params = { cwd: "/repo", branches: ["feature/base", "feature/top"] } as const;

		expect(await gateway.getBranchPrChecks(params)).toMatchObject({
			ok: false,
			error: {
				code: "github_pr_feedback_response_invalid",
				details: { operation: "getBranchPrChecks" },
			},
		});
		expect(await gateway.getBranchPrChecks(params)).toMatchObject({
			ok: false,
			error: {
				code: "github_pr_feedback_response_invalid",
				details: { operation: "getBranchPrChecks" },
			},
		});
		expect(await gateway.getBranchPrChecks(params)).toMatchObject({
			ok: false,
			error: { code: "github_pr_feedback_gh_failed", details: { stderr: "boom" } },
		});
		expect(await gateway.getBranchPrChecks(params)).toMatchObject({
			ok: false,
			error: { code: "github_pr_feedback_graphql_failed" },
		});
		runner.assertDone();
	});

	test("returns no outcomes for an empty branch list without calling gh", async () => {
		const runner = new ScriptedCommandRunner([]);
		const gateway = new RealGithubPrFeedbackGateway(runner.runner);

		expect(await gateway.getBranchPrChecks({ cwd: "/repo", branches: [] })).toEqual({
			ok: true,
			value: [],
		});
		runner.assertDone();
	});

	test("fetches REST changed files and review comment summaries", async () => {
		const changedFilesArgs = ["api", "--paginate", "repos/{owner}/{repo}/pulls/12/files"];
		const reviewCommentsArgs = ["api", "--paginate", "repos/{owner}/{repo}/pulls/12/comments"];
		const runner = new ScriptedCommandRunner([
			step("gh", changedFilesArgs, {
				stdout: JSON.stringify([
					{ filename: "src/app.ts", status: "modified", patch: null },
					{ path: "src/new.ts", status: "added", patch: "@@" },
				]),
			}),
			step("gh", reviewCommentsArgs, {
				stdout: JSON.stringify([
					{ body: "body", user: { login: "octocat" } },
					{ body: "bot", author: "github-actions[bot]" },
				]),
			}),
		]);
		const gateway = new RealGithubPrFeedbackGateway(runner.runner);

		expect(await gateway.getPrChangedFiles({ cwd: "/repo", prNumber: 12 })).toEqual({
			ok: true,
			value: [
				{ path: "src/app.ts", status: "modified", patch: null },
				{ path: "src/new.ts", status: "added", patch: "@@" },
			],
		});
		expect(await gateway.getPrReviewComments({ cwd: "/repo", prNumber: 12 })).toEqual({
			ok: true,
			value: [
				{ author: "octocat", body: "body" },
				{ author: "github-actions[bot]", body: "bot" },
			],
		});
		runner.assertDone();
	});

	test("upserts REST discussion comments by marker and author", async () => {
		const listArgs = ["api", "--paginate", "repos/{owner}/{repo}/issues/12/comments"];
		const updateArgs = [
			"api",
			"--method",
			"PATCH",
			"repos/{owner}/{repo}/issues/comments/44",
			"-f",
			"body=updated <!-- marker -->",
		];
		const runner = new ScriptedCommandRunner([
			step("gh", listArgs, {
				stdout: JSON.stringify([
					{ id: 44, body: "old <!-- marker -->", user: { login: "bot" }, html_url: "url" },
				]),
			}),
			step("gh", updateArgs, {
				stdout: JSON.stringify({ id: 44, body: "updated <!-- marker -->", user: { login: "bot" } }),
			}),
		]);
		const gateway = new RealGithubPrFeedbackGateway(runner.runner);

		expect(
			await gateway.upsertPrDiscussionCommentByMarker({
				cwd: "/repo",
				prNumber: 12,
				marker: "<!-- marker -->",
				authorLogin: "bot",
				body: "updated <!-- marker -->",
			}),
		).toEqual({
			ok: true,
			value: {
				type: "updated",
				comment: { id: 44, body: "updated <!-- marker -->", author: "bot", url: "" },
			},
		});
		runner.assertDone();
	});

	test("fetches REST feedback fingerprint parts with legacy jq projections", async () => {
		const runner = new ScriptedCommandRunner([
			step(
				"gh",
				[
					"api",
					"--method",
					"GET",
					"repos/{owner}/{repo}/issues/12/comments?per_page=100&since=2026-06-01T00%3A00%3A00.000Z",
					"--jq",
					"[.[] | {id, created_at, updated_at, author: .user.login}]",
				],
				{ stdout: JSON.stringify([{ id: 1, created_at: "c", updated_at: "u", author: "bot" }]) },
			),
			step(
				"gh",
				[
					"api",
					"--method",
					"GET",
					"repos/{owner}/{repo}/pulls/12/reviews?per_page=100",
					"--jq",
					"[.[] | {id, node_id, state, submitted_at, commit_id, author: .user.login}]",
				],
				{ stdout: JSON.stringify([{ id: 2, node_id: "R", state: "COMMENTED", author: "bot" }]) },
			),
			step(
				"gh",
				[
					"api",
					"--method",
					"GET",
					"repos/{owner}/{repo}/pulls/12/comments?per_page=100&sort=updated&direction=desc&since=2026-06-01T00%3A00%3A00.000Z",
					"--jq",
					"[.[] | {id, pull_request_review_id, created_at, updated_at, path, line, in_reply_to_id, author: .user.login}]",
				],
				{
					stdout: JSON.stringify([
						{ id: 3, path: "src/app.ts", line: 7, created_at: "c", updated_at: "u", author: "bot" },
					]),
				},
			),
		]);
		const gateway = new RealGithubPrFeedbackGateway(runner.runner);

		expect(
			await gateway.getPrRestFeedbackFingerprintParts({
				cwd: "/repo",
				prNumber: 12,
				sinceIso: "2026-06-01T00:00:00.000Z",
			}),
		).toMatchObject({
			ok: true,
			value: {
				discussionComments: [{ id: 1, author: "bot", createdAt: "c", updatedAt: "u" }],
				reviews: [{ id: 2, nodeId: "R", state: "COMMENTED", author: "bot" }],
				reviewComments: [{ id: 3, path: "src/app.ts", line: 7, author: "bot" }],
			},
		});
		runner.assertDone();
	});
});

describe("FakeGithubPrFeedbackGateway discussion comment markers", () => {
	test("finds marker comments only for the requested author", async () => {
		const gateway = new FakeGithubPrFeedbackGateway({
			discussionCommentsByPr: new Map([
				[
					7,
					[
						{ id: 1, body: "hello <!-- marker -->", author: "impostor", url: "" },
						{ id: 2, body: "hello <!-- marker -->", author: "bot", url: "" },
						{ id: 3, body: "unrelated", author: "bot", url: "" },
					],
				],
			]),
		});

		expect(
			await gateway.findPrDiscussionCommentByMarker({
				prNumber: 7,
				marker: "<!-- marker -->",
				authorLogin: "bot",
			}),
		).toEqual({
			ok: true,
			value: { id: 2, body: "hello <!-- marker -->", author: "bot", url: "" },
		});
	});

	test("upserts by marker: creates when missing then updates in place", async () => {
		const gateway = new FakeGithubPrFeedbackGateway();

		expect(
			await gateway.upsertPrDiscussionCommentByMarker({
				prNumber: 7,
				marker: "<!-- marker -->",
				authorLogin: "bot",
				body: "first <!-- marker -->",
			}),
		).toEqual({
			ok: true,
			value: {
				type: "created",
				comment: { id: 1, body: "first <!-- marker -->", author: "bot", url: "" },
			},
		});

		expect(
			await gateway.upsertPrDiscussionCommentByMarker({
				prNumber: 7,
				marker: "<!-- marker -->",
				authorLogin: "bot",
				body: "second <!-- marker -->",
			}),
		).toEqual({
			ok: true,
			value: {
				type: "updated",
				comment: { id: 1, body: "second <!-- marker -->", author: "bot", url: "" },
			},
		});
	});

	test("records review-thread and marker-find calls including caller options", async () => {
		const gateway = new FakeGithubPrFeedbackGateway();

		await gateway.getPrReviewThreads({ cwd: "/repo", env: {}, prNumber: 7 });
		await gateway.findPrDiscussionCommentByMarker({
			cwd: "/repo",
			prNumber: 7,
			marker: "<!-- marker -->",
			authorLogin: "bot",
		});

		expect(gateway.reviewThreadCalls()).toEqual([{ cwd: "/repo", env: {}, prNumber: 7 }]);
		expect(gateway.markerFindCalls()).toEqual([
			{ cwd: "/repo", prNumber: 7, marker: "<!-- marker -->", authorLogin: "bot" },
		]);
	});
});
