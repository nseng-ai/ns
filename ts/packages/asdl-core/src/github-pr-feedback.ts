import { runCommand, type CommandRunner, type ExecResult } from "./exec.ts";
import { GITHUB_CLI_TIMEOUT_MS, runGitHubCli, type RunGitHubCliResult } from "./github-cli.ts";
import { type ErrorInfo, type Result } from "./result.ts";

import { z } from "zod";

export interface GithubPrFeedbackOptions {
	readonly cwd: string;
	readonly env?: NodeJS.ProcessEnv | undefined;
	readonly signal?: AbortSignal | undefined;
}

export interface GithubPrSummary {
	readonly number: number;
	readonly title: string;
	readonly url: string;
	readonly headRefName: string;
	readonly baseRefName: string;
	readonly state: string;
	readonly headRefOid?: string | null | undefined;
}

export interface GithubPrReview {
	readonly id: string;
	readonly author: string;
	readonly body: string;
	readonly state: string;
	readonly submittedAt: string;
}

export interface GithubPrReviewComment {
	readonly id: number;
	readonly body: string;
	readonly author: string;
	readonly path: string;
	readonly line: number | null;
	readonly startLine: number | null;
	readonly createdAt: string;
	readonly url?: string | undefined;
}

export interface GithubPrReviewThread {
	readonly id: string;
	readonly path: string;
	readonly line: number | null;
	readonly startLine: number | null;
	readonly isResolved: boolean;
	readonly isOutdated: boolean;
	readonly comments: readonly GithubPrReviewComment[];
}

export interface GithubPrDiscussionComment {
	readonly id: number;
	readonly body: string;
	readonly author: string;
	readonly url: string;
}

export interface GithubReviewThreadReply {
	readonly threadId: string;
	readonly comment: GithubPrReviewComment;
}

export interface GithubReviewThreadState {
	readonly threadId: string;
	readonly isResolved: boolean;
}

export type GithubPrFeedbackFailureCode =
	| "github_pr_feedback_gh_failed"
	| "github_pr_feedback_startup_failed"
	| "github_pr_feedback_json_parse_failed"
	| "github_pr_feedback_response_invalid"
	| "github_pr_feedback_graphql_failed"
	| "github_pr_feedback_pagination_invalid";

export interface GithubPrFeedbackFailure extends ErrorInfo {
	readonly code: GithubPrFeedbackFailureCode;
}

export type GithubPrFeedbackOperation =
	| "getPr"
	| "getPrForBranch"
	| "listOpenPrs"
	| "getPrReviews"
	| "getPrReviewThreads"
	| "getPrDiscussionComments"
	| "replyToReviewThread"
	| "resolveReviewThread";

export type GithubPrLookupResult =
	| { readonly type: "found"; readonly pr: GithubPrSummary }
	| { readonly type: "miss"; readonly stderr: string; readonly exitCode: number }
	| { readonly type: "failure"; readonly failure: GithubPrFeedbackFailure };

export interface GithubPrFeedbackGateway {
	getPr(
		params: GithubPrFeedbackOptions & { readonly prNumber: number },
	): Promise<GithubPrLookupResult>;
	getPrForBranch(
		params: GithubPrFeedbackOptions & { readonly branch: string },
	): Promise<GithubPrLookupResult>;
	listOpenPrs(
		params: GithubPrFeedbackOptions,
	): Promise<Result<readonly GithubPrSummary[], GithubPrFeedbackFailure>>;
	getPrReviews(
		params: GithubPrFeedbackOptions & { readonly prNumber: number },
	): Promise<Result<readonly GithubPrReview[], GithubPrFeedbackFailure>>;
	getPrReviewThreads(
		params: GithubPrFeedbackOptions & { readonly prNumber: number },
	): Promise<Result<readonly GithubPrReviewThread[], GithubPrFeedbackFailure>>;
	getPrDiscussionComments(
		params: GithubPrFeedbackOptions & { readonly prNumber: number },
	): Promise<Result<readonly GithubPrDiscussionComment[], GithubPrFeedbackFailure>>;
	replyToReviewThread(
		params: GithubPrFeedbackOptions & { readonly threadId: string; readonly body: string },
	): Promise<Result<GithubReviewThreadReply, GithubPrFeedbackFailure>>;
	resolveReviewThread(
		params: GithubPrFeedbackOptions & { readonly threadId: string },
	): Promise<Result<GithubReviewThreadState, GithubPrFeedbackFailure>>;
}

const prSummarySchema = z.object({
	number: z.number().int(),
	title: z.string(),
	url: z.string(),
	headRefName: z.string(),
	baseRefName: z.string(),
	state: z.string(),
	headRefOid: z.string().nullable().optional(),
});

const ghAuthorSchema = z.union([
	z.string(),
	z.object({ login: z.string().default("") }).loose(),
	z.null(),
]);
const ghReviewSchema = z
	.object({
		id: z.string(),
		author: ghAuthorSchema.default(""),
		body: z.string().default(""),
		state: z.string(),
		submittedAt: z.string().default(""),
	})
	.loose();
const ghReviewCommentSchema = z
	.object({
		databaseId: z.number().int().nullable().optional(),
		id: z.union([z.number().int(), z.string()]).optional(),
		body: z.string().default(""),
		author: ghAuthorSchema.default(""),
		path: z.string().default(""),
		line: z.number().int().nullable().default(null),
		startLine: z.number().int().nullable().optional(),
		createdAt: z.string().default(""),
		url: z.string().optional(),
	})
	.loose();
const ghPageInfoSchema = z
	.object({
		hasNextPage: z.boolean().default(false),
		endCursor: z.string().nullable().optional(),
	})
	.loose();
const ghReviewCommentConnectionSchema = z
	.object({
		nodes: z.array(ghReviewCommentSchema).default([]),
		pageInfo: ghPageInfoSchema.default({ hasNextPage: false }),
	})
	.loose();
const ghReviewThreadSchema = z
	.object({
		id: z.string().nullable().default(null),
		path: z.string().default(""),
		line: z.number().int().nullable().default(null),
		startLine: z.number().int().nullable().optional(),
		isResolved: z.boolean().default(false),
		isOutdated: z.boolean().default(false),
		comments: ghReviewCommentConnectionSchema.default({
			nodes: [],
			pageInfo: { hasNextPage: false },
		}),
	})
	.loose();
const ghDiscussionCommentSchema = z
	.object({
		databaseId: z.number().int().optional(),
		id: z.union([z.number().int(), z.string()]).optional(),
		body: z.string().default(""),
		author: ghAuthorSchema.default(""),
		user: ghAuthorSchema.optional(),
		url: z.string().default(""),
		html_url: z.string().optional(),
	})
	.loose();
const ghGraphqlErrorsSchema = z.object({ errors: z.array(z.unknown()).optional() }).loose();
const ghReviewThreadsResponseSchema = z
	.object({
		data: z.object({
			repository: z.object({
				pullRequest: z.object({
					reviewThreads: z
						.object({
							nodes: z.array(ghReviewThreadSchema).default([]),
							pageInfo: ghPageInfoSchema.default({ hasNextPage: false }),
						})
						.loose(),
				}),
			}),
		}),
	})
	.loose();
const ghReviewThreadCommentsResponseSchema = z
	.object({
		data: z.object({
			node: z.object({ comments: ghReviewCommentConnectionSchema }).loose().nullable(),
		}),
	})
	.loose();
const ghReplyReviewThreadResponseSchema = z
	.object({
		data: z.object({
			addPullRequestReviewThreadReply: z
				.object({ comment: ghReviewCommentSchema.nullable() })
				.loose()
				.nullable(),
		}),
	})
	.loose();
const ghResolveReviewThreadResponseSchema = z
	.object({
		data: z.object({
			resolveReviewThread: z
				.object({
					thread: z.object({ id: z.string(), isResolved: z.boolean() }).loose().nullable(),
				})
				.loose()
				.nullable(),
		}),
	})
	.loose();

type GhReviewThread = z.infer<typeof ghReviewThreadSchema>;

export const reviewThreadsQuery = `
query($owner: String!, $repo: String!, $number: Int!, $threadCursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $threadCursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          startLine
          comments(first: 100) {
            pageInfo { hasNextPage endCursor }
            nodes { databaseId body author { login } path line: originalLine startLine: originalStartLine createdAt url }
          }
        }
      }
    }
  }
}`;

export const reviewThreadCommentsQuery = `
query($threadId: ID!, $commentCursor: String) {
  node(id: $threadId) {
    ... on PullRequestReviewThread {
      comments(first: 100, after: $commentCursor) {
        pageInfo { hasNextPage endCursor }
        nodes { databaseId body author { login } path line: originalLine startLine: originalStartLine createdAt url }
      }
    }
  }
}`;

export const replyToReviewThreadMutation = `
mutation($threadId: ID!, $body: String!) {
  addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $threadId, body: $body }) {
    comment { databaseId id body author { login } path line: originalLine startLine: originalStartLine createdAt url }
  }
}`;

export const resolveReviewThreadMutation = `
mutation($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) {
    thread { id isResolved }
  }
}`;

function feedbackOk<T>(value: T): Result<T, GithubPrFeedbackFailure> {
	return { ok: true, value };
}

function feedbackErr<T = never>(
	error: GithubPrFeedbackFailure,
): Result<T, GithubPrFeedbackFailure> {
	return { ok: false, error };
}

export class RealGithubPrFeedbackGateway implements GithubPrFeedbackGateway {
	private readonly runner: CommandRunner;

	constructor(runner: CommandRunner = runCommand) {
		this.runner = runner;
	}

	async getPr(
		params: GithubPrFeedbackOptions & { readonly prNumber: number },
	): Promise<GithubPrLookupResult> {
		return await this.getPrBySelector(String(params.prNumber), "getPr", params);
	}

	async getPrForBranch(
		params: GithubPrFeedbackOptions & { readonly branch: string },
	): Promise<GithubPrLookupResult> {
		return await this.getPrBySelector(params.branch, "getPrForBranch", params);
	}

	async listOpenPrs(
		params: GithubPrFeedbackOptions,
	): Promise<Result<readonly GithubPrSummary[], GithubPrFeedbackFailure>> {
		const result = await this.runGhJson({
			operation: "listOpenPrs",
			args: [
				"pr",
				"list",
				"--state",
				"open",
				"--json",
				"number,title,url,headRefName,baseRefName,state",
				"--limit",
				"1000",
			],
			params,
			schema: z.array(prSummarySchema),
		});
		if (!result.ok) return result;
		return feedbackOk(result.value.map(normalizePrSummary));
	}

	async getPrReviews(
		params: GithubPrFeedbackOptions & { readonly prNumber: number },
	): Promise<Result<readonly GithubPrReview[], GithubPrFeedbackFailure>> {
		const result = await this.runGhJson({
			operation: "getPrReviews",
			args: ["pr", "view", String(params.prNumber), "--json", "reviews"],
			params,
			schema: z.object({ reviews: z.array(ghReviewSchema).default([]) }).loose(),
			prNumber: params.prNumber,
		});
		if (!result.ok) return result;
		return feedbackOk(result.value.reviews.map(normalizeReview));
	}

	async getPrReviewThreads(
		params: GithubPrFeedbackOptions & { readonly prNumber: number },
	): Promise<Result<readonly GithubPrReviewThread[], GithubPrFeedbackFailure>> {
		const threads: GithubPrReviewThread[] = [];
		let threadCursor: string | null | undefined;
		for (;;) {
			const result = await this.runGhGraphqlJson({
				operation: "getPrReviewThreads",
				args: reviewThreadPageArgs(params.prNumber, threadCursor),
				params,
				schema: ghReviewThreadsResponseSchema,
				prNumber: params.prNumber,
				cursorContext: "reviewThreads",
			});
			if (!result.ok) return result;

			const connection = result.value.data.repository.pullRequest.reviewThreads;
			for (const thread of connection.nodes) {
				const hydrated = await this.withCompleteThreadComments(thread, params);
				if (!hydrated.ok) return feedbackErr(hydrated.error);
				threads.push(...normalizeReviewThread(hydrated.value));
			}

			if (!connection.pageInfo.hasNextPage) break;
			const cursorResult = requireEndCursor({
				operation: "getPrReviewThreads",
				pageInfo: connection.pageInfo,
				message: "GitHub returned a reviewThreads page with hasNextPage but no endCursor",
				prNumber: params.prNumber,
				cursorContext: "reviewThreads",
			});
			if (!cursorResult.ok) return feedbackErr(cursorResult.error);
			threadCursor = cursorResult.value;
		}
		return feedbackOk(threads);
	}

	async getPrDiscussionComments(
		params: GithubPrFeedbackOptions & { readonly prNumber: number },
	): Promise<Result<readonly GithubPrDiscussionComment[], GithubPrFeedbackFailure>> {
		const result = await this.runGhJson({
			operation: "getPrDiscussionComments",
			args: ["pr", "view", String(params.prNumber), "--json", "comments"],
			params,
			schema: z.object({ comments: z.array(ghDiscussionCommentSchema).default([]) }).loose(),
			prNumber: params.prNumber,
		});
		if (!result.ok) return result;
		return feedbackOk(
			result.value.comments.map(normalizeDiscussionComment).filter((comment) => comment.id !== 0),
		);
	}

	async replyToReviewThread(
		params: GithubPrFeedbackOptions & { readonly threadId: string; readonly body: string },
	): Promise<Result<GithubReviewThreadReply, GithubPrFeedbackFailure>> {
		const result = await this.runGhGraphqlJson({
			operation: "replyToReviewThread",
			args: replyToReviewThreadArgs(params.threadId, params.body),
			params,
			schema: ghReplyReviewThreadResponseSchema,
			threadId: params.threadId,
		});
		if (!result.ok) return result;
		const comment = result.value.data.addPullRequestReviewThreadReply?.comment;
		if (comment === undefined || comment === null) {
			return feedbackErr(
				failureFromMessage({
					code: "github_pr_feedback_response_invalid",
					operation: "replyToReviewThread",
					message: "GitHub reply mutation response did not include a comment.",
					threadId: params.threadId,
				}),
			);
		}
		return feedbackOk({ threadId: params.threadId, comment: normalizeReviewComment(comment) });
	}

	async resolveReviewThread(
		params: GithubPrFeedbackOptions & { readonly threadId: string },
	): Promise<Result<GithubReviewThreadState, GithubPrFeedbackFailure>> {
		const result = await this.runGhGraphqlJson({
			operation: "resolveReviewThread",
			args: resolveReviewThreadArgs(params.threadId),
			params,
			schema: ghResolveReviewThreadResponseSchema,
			threadId: params.threadId,
		});
		if (!result.ok) return result;
		const thread = result.value.data.resolveReviewThread?.thread;
		if (thread === undefined || thread === null) {
			return feedbackErr(
				failureFromMessage({
					code: "github_pr_feedback_response_invalid",
					operation: "resolveReviewThread",
					message: "GitHub resolve mutation response did not include a thread.",
					threadId: params.threadId,
				}),
			);
		}
		return feedbackOk({ threadId: thread.id, isResolved: thread.isResolved });
	}

	private async getPrBySelector(
		selector: string,
		operation: "getPr" | "getPrForBranch",
		params: GithubPrFeedbackOptions,
	): Promise<GithubPrLookupResult> {
		const args = [
			"pr",
			"view",
			selector,
			"--json",
			"number,title,url,headRefName,headRefOid,baseRefName,state",
		];
		const run = await this.runGh({ operation, args, params });
		if (run.type === "startup_error")
			return { type: "failure", failure: failureFromStartup(run, operation) };
		if (run.result.code !== 0 || run.result.killed) {
			if (isLookupMiss(run.result)) {
				return {
					type: "miss",
					stderr: run.result.stderr || "no PR found",
					exitCode: run.result.code,
				};
			}
			return { type: "failure", failure: failureFromCompleted(run, operation) };
		}
		const parseResult = parseJson(run.result.stdout, prSummarySchema, { operation, run });
		if (!parseResult.ok) return { type: "failure", failure: parseResult.error };
		return { type: "found", pr: normalizePrSummary(parseResult.value) };
	}

	private async withCompleteThreadComments(
		thread: GhReviewThread,
		params: GithubPrFeedbackOptions & { readonly prNumber: number },
	): Promise<Result<GhReviewThread, GithubPrFeedbackFailure>> {
		if (!thread.comments.pageInfo.hasNextPage) return feedbackOk(thread);
		if (thread.id === null) return feedbackOk(thread);

		const comments = [...thread.comments.nodes];
		let commentCursor = thread.comments.pageInfo.endCursor;
		for (;;) {
			const cursorResult = requireEndCursor({
				operation: "getPrReviewThreads",
				pageInfo: { hasNextPage: true, endCursor: commentCursor },
				message: `GitHub returned review thread ${thread.id} comments with hasNextPage but no endCursor`,
				prNumber: params.prNumber,
				threadId: thread.id,
				cursorContext: "reviewThreadComments",
			});
			if (!cursorResult.ok) return feedbackErr(cursorResult.error);

			const result = await this.runGhGraphqlJson({
				operation: "getPrReviewThreads",
				args: reviewThreadCommentPageArgs(thread.id, cursorResult.value),
				params,
				schema: ghReviewThreadCommentsResponseSchema,
				prNumber: params.prNumber,
				threadId: thread.id,
				cursorContext: "reviewThreadComments",
			});
			if (!result.ok) return result;
			const node = result.value.data.node;
			if (node === null) {
				return feedbackErr(
					failureFromMessage({
						code: "github_pr_feedback_pagination_invalid",
						operation: "getPrReviewThreads",
						message: `GitHub returned no review thread for ${thread.id}`,
						prNumber: params.prNumber,
						threadId: thread.id,
						cursorContext: "reviewThreadComments",
					}),
				);
			}
			comments.push(...node.comments.nodes);
			if (!node.comments.pageInfo.hasNextPage) break;
			commentCursor = node.comments.pageInfo.endCursor;
		}
		return feedbackOk({
			...thread,
			comments: { ...thread.comments, nodes: comments, pageInfo: { hasNextPage: false } },
		});
	}

	private async runGhJson<T>(options: {
		readonly operation: GithubPrFeedbackOperation;
		readonly args: readonly string[];
		readonly params: GithubPrFeedbackOptions;
		readonly schema: z.ZodType<T>;
		readonly prNumber?: number | undefined;
		readonly threadId?: string | undefined;
	}): Promise<Result<T, GithubPrFeedbackFailure>> {
		const run = await this.runGh(options);
		if (run.type === "startup_error")
			return feedbackErr(failureFromStartup(run, options.operation));
		if (run.result.code !== 0 || run.result.killed)
			return feedbackErr(failureFromCompleted(run, options.operation, options));
		return parseJson(run.result.stdout, options.schema, {
			operation: options.operation,
			run,
			prNumber: options.prNumber,
			threadId: options.threadId,
		});
	}

	private async runGhGraphqlJson<T>(options: {
		readonly operation: GithubPrFeedbackOperation;
		readonly args: readonly string[];
		readonly params: GithubPrFeedbackOptions;
		readonly schema: z.ZodType<T>;
		readonly prNumber?: number | undefined;
		readonly threadId?: string | undefined;
		readonly cursorContext?: string | undefined;
	}): Promise<Result<T, GithubPrFeedbackFailure>> {
		const run = await this.runGh(options);
		if (run.type === "startup_error")
			return feedbackErr(failureFromStartup(run, options.operation));
		if (run.result.code !== 0 || run.result.killed)
			return feedbackErr(failureFromCompleted(run, options.operation, options));
		return parseGraphqlJson(run.result.stdout, options.schema, {
			operation: options.operation,
			run,
			prNumber: options.prNumber,
			threadId: options.threadId,
			cursorContext: options.cursorContext,
		});
	}

	private async runGh(options: {
		readonly operation: GithubPrFeedbackOperation;
		readonly args: readonly string[];
		readonly params: GithubPrFeedbackOptions;
	}): Promise<RunGitHubCliResult> {
		return await runGitHubCli({
			runner: this.runner,
			args: options.args,
			cwd: options.params.cwd,
			timeoutMs: GITHUB_CLI_TIMEOUT_MS,
			...(options.params.env === undefined ? {} : { env: options.params.env }),
			...(options.params.signal === undefined ? {} : { signal: options.params.signal }),
		});
	}
}

function reviewThreadPageArgs(prNumber: number, threadCursor: string | null | undefined): string[] {
	return [
		"api",
		"graphql",
		"-F",
		"owner={owner}",
		"-F",
		"repo={repo}",
		"-F",
		`number=${prNumber}`,
		...(threadCursor === null || threadCursor === undefined
			? []
			: ["-F", `threadCursor=${threadCursor}`]),
		"-f",
		`query=${reviewThreadsQuery}`,
	];
}

function reviewThreadCommentPageArgs(threadId: string, commentCursor: string): string[] {
	return [
		"api",
		"graphql",
		"-f",
		`threadId=${threadId}`,
		"-F",
		`commentCursor=${commentCursor}`,
		"-f",
		`query=${reviewThreadCommentsQuery}`,
	];
}

function replyToReviewThreadArgs(threadId: string, body: string): string[] {
	return [
		"api",
		"graphql",
		"-f",
		`threadId=${threadId}`,
		"-f",
		`body=${body}`,
		"-f",
		`query=${replyToReviewThreadMutation}`,
	];
}

function resolveReviewThreadArgs(threadId: string): string[] {
	return [
		"api",
		"graphql",
		"-f",
		`threadId=${threadId}`,
		"-f",
		`query=${resolveReviewThreadMutation}`,
	];
}

function normalizePrSummary(summary: z.infer<typeof prSummarySchema>): GithubPrSummary {
	return {
		number: summary.number,
		title: summary.title,
		url: summary.url,
		headRefName: summary.headRefName,
		baseRefName: summary.baseRefName,
		state: summary.state,
		headRefOid: summary.headRefOid,
	};
}

function normalizeReview(review: z.infer<typeof ghReviewSchema>): GithubPrReview {
	return {
		id: review.id,
		author: normalizeAuthor(review.author),
		body: review.body,
		state: review.state,
		submittedAt: review.submittedAt,
	};
}

function normalizeReviewThread(
	thread: z.infer<typeof ghReviewThreadSchema>,
): GithubPrReviewThread[] {
	if (thread.id === null) return [];
	return [
		{
			id: thread.id,
			path: thread.path,
			line: thread.line,
			startLine: thread.startLine ?? null,
			isResolved: thread.isResolved,
			isOutdated: thread.isOutdated,
			comments: thread.comments.nodes
				.map(normalizeReviewComment)
				.filter((comment) => comment.id !== 0),
		},
	];
}

function normalizeReviewComment(
	comment: z.infer<typeof ghReviewCommentSchema>,
): GithubPrReviewComment {
	return {
		id: numericId(comment.databaseId ?? comment.id),
		body: comment.body,
		author: normalizeAuthor(comment.author),
		path: comment.path,
		line: comment.line,
		startLine: comment.startLine ?? null,
		createdAt: comment.createdAt,
		...(comment.url === undefined ? {} : { url: comment.url }),
	};
}

function normalizeDiscussionComment(
	comment: z.infer<typeof ghDiscussionCommentSchema>,
): GithubPrDiscussionComment {
	return {
		id: numericId(comment.databaseId ?? comment.id),
		body: comment.body,
		author: normalizeAuthor(comment.user ?? comment.author),
		url: comment.html_url ?? comment.url,
	};
}

function normalizeAuthor(author: z.infer<typeof ghAuthorSchema>): string {
	if (typeof author === "string") return author;
	return author?.login ?? "";
}

function numericId(value: string | number | null | undefined): number {
	if (typeof value === "number") return value;
	if (typeof value === "string") {
		const numeric = Number(value);
		if (Number.isInteger(numeric)) return numeric;
	}
	return 0;
}

function isLookupMiss(result: ExecResult): boolean {
	const text = `${result.stdout}\n${result.stderr}`.toLowerCase();
	return (
		result.code === 1 &&
		(text.includes("no pull requests") || text.includes("no pr") || text.includes("not found"))
	);
}

function parseJson<T>(
	text: string,
	schema: z.ZodType<T>,
	context: FailureContext,
): Result<T, GithubPrFeedbackFailure> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		return feedbackErr(
			failureFromMessage({
				code: "github_pr_feedback_json_parse_failed",
				operation: context.operation,
				message: jsonErrorMessage(error),
				run: context.run,
				stdout: text,
				prNumber: context.prNumber,
				threadId: context.threadId,
				cursorContext: context.cursorContext,
			}),
		);
	}
	const result = schema.safeParse(parsed);
	if (!result.success) {
		return feedbackErr(
			failureFromMessage({
				code: "github_pr_feedback_response_invalid",
				operation: context.operation,
				message: z.prettifyError(result.error),
				run: context.run,
				stdout: text,
				zodError: z.prettifyError(result.error),
				prNumber: context.prNumber,
				threadId: context.threadId,
				cursorContext: context.cursorContext,
			}),
		);
	}
	return feedbackOk(result.data);
}

function parseGraphqlJson<T>(
	text: string,
	schema: z.ZodType<T>,
	context: FailureContext,
): Result<T, GithubPrFeedbackFailure> {
	const base = parseJson(text, ghGraphqlErrorsSchema, context);
	if (!base.ok) return base;
	if (base.value.errors !== undefined && base.value.errors.length > 0) {
		return feedbackErr(
			failureFromMessage({
				code: "github_pr_feedback_graphql_failed",
				operation: context.operation,
				message: JSON.stringify(base.value.errors),
				run: context.run,
				stdout: text,
				graphqlErrors: base.value.errors,
				prNumber: context.prNumber,
				threadId: context.threadId,
				cursorContext: context.cursorContext,
			}),
		);
	}
	return parseJson(text, schema, context);
}

function requireEndCursor(options: {
	readonly operation: GithubPrFeedbackOperation;
	readonly pageInfo: {
		readonly hasNextPage: boolean;
		readonly endCursor?: string | null | undefined;
	};
	readonly message: string;
	readonly prNumber?: number | undefined;
	readonly threadId?: string | undefined;
	readonly cursorContext: string;
}): Result<string, GithubPrFeedbackFailure> {
	const cursor = options.pageInfo.endCursor;
	if (!options.pageInfo.hasNextPage || (cursor !== null && cursor !== undefined && cursor !== "")) {
		return feedbackOk(cursor ?? "");
	}
	return feedbackErr(
		failureFromMessage({
			code: "github_pr_feedback_pagination_invalid",
			operation: options.operation,
			message: options.message,
			prNumber: options.prNumber,
			threadId: options.threadId,
			cursorContext: options.cursorContext,
		}),
	);
}

interface FailureContext {
	readonly operation: GithubPrFeedbackOperation;
	readonly run: Extract<RunGitHubCliResult, { readonly type: "completed" }>;
	readonly prNumber?: number | undefined;
	readonly threadId?: string | undefined;
	readonly cursorContext?: string | undefined;
}

function failureFromStartup(
	run: Extract<RunGitHubCliResult, { readonly type: "startup_error" }>,
	operation: GithubPrFeedbackOperation,
): GithubPrFeedbackFailure {
	return {
		code: "github_pr_feedback_startup_failed",
		message: run.message,
		displayCommand: run.displayCommand,
		details: {
			operation,
			command: run.command,
			displayCommand: run.displayCommand,
			stderr: run.message,
		},
	};
}

function failureFromCompleted(
	run: Extract<RunGitHubCliResult, { readonly type: "completed" }>,
	operation: GithubPrFeedbackOperation,
	context: {
		readonly prNumber?: number | undefined;
		readonly threadId?: string | undefined;
		readonly cursorContext?: string | undefined;
	} = {},
): GithubPrFeedbackFailure {
	const stderr = run.result.stderr.trim();
	const stdout = run.result.stdout.trim();
	return failureFromMessage({
		code: "github_pr_feedback_gh_failed",
		operation,
		message: stderr || stdout || `gh exited with code ${run.result.code}`,
		run,
		stdout: run.result.stdout,
		stderr: run.result.stderr,
		exitCode: run.result.code,
		killed: run.result.killed,
		prNumber: context.prNumber,
		threadId: context.threadId,
		cursorContext: context.cursorContext,
	});
}

function failureFromMessage(options: {
	readonly code: GithubPrFeedbackFailureCode;
	readonly operation: GithubPrFeedbackOperation;
	readonly message: string;
	readonly run?: Extract<RunGitHubCliResult, { readonly type: "completed" }> | undefined;
	readonly stdout?: string | undefined;
	readonly stderr?: string | undefined;
	readonly exitCode?: number | undefined;
	readonly killed?: boolean | undefined;
	readonly graphqlErrors?: unknown;
	readonly zodError?: string | undefined;
	readonly prNumber?: number | undefined;
	readonly threadId?: string | undefined;
	readonly cursorContext?: string | undefined;
}): GithubPrFeedbackFailure {
	return {
		code: options.code,
		message: options.message,
		...(options.run === undefined ? {} : { displayCommand: options.run.displayCommand }),
		details: {
			operation: options.operation,
			...(options.run === undefined
				? {}
				: { command: options.run.command, displayCommand: options.run.displayCommand }),
			...(options.stdout === undefined ? {} : { stdout: options.stdout }),
			...(options.stderr === undefined ? {} : { stderr: options.stderr }),
			...(options.exitCode === undefined ? {} : { exitCode: options.exitCode }),
			...(options.killed === undefined ? {} : { killed: options.killed }),
			...(options.graphqlErrors === undefined ? {} : { graphqlErrors: options.graphqlErrors }),
			...(options.zodError === undefined ? {} : { zodError: options.zodError }),
			...(options.cursorContext === undefined ? {} : { cursorContext: options.cursorContext }),
			...(options.threadId === undefined ? {} : { threadId: options.threadId }),
			...(options.prNumber === undefined ? {} : { prNumber: options.prNumber }),
		},
	};
}

function jsonErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
