import { runCommand, type CommandRunner, type ExecResult } from "../exec.ts";
import { GITHUB_CLI_TIMEOUT_MS, runGitHubCli, type RunGitHubCliResult } from "../github-cli.ts";
import type { Result } from "../result.ts";

import {
	replyToReviewThreadArgs,
	resolveReviewThreadArgs,
	reviewThreadCommentPageArgs,
	reviewThreadPageArgs,
} from "./args.ts";
import {
	failureFromCompleted,
	failureFromMessage,
	failureFromStartup,
	feedbackErr,
	feedbackOk,
} from "./failures.ts";
import {
	normalizeDiscussionComment,
	normalizePrSummary,
	normalizeReview,
	normalizeReviewComment,
	normalizeReviewThread,
} from "./normalizers.ts";
import { parseGraphqlJson, parseJson, requireEndCursor } from "./parsing.ts";
import {
	ghDiscussionCommentsResponseSchema,
	ghReplyReviewThreadResponseSchema,
	ghResolveReviewThreadResponseSchema,
	ghReviewThreadCommentsResponseSchema,
	ghReviewThreadsResponseSchema,
	ghReviewsResponseSchema,
	prSummaryListSchema,
	prSummarySchema,
	type GhReviewThread,
} from "./schemas.ts";
import type {
	GithubPrDiscussionComment,
	GithubPrFeedbackFailure,
	GithubPrFeedbackGateway,
	GithubPrFeedbackOperation,
	GithubPrFeedbackOptions,
	GithubPrLookupResult,
	GithubPrReview,
	GithubPrReviewThread,
	GithubPrSummary,
	GithubReviewThreadReply,
	GithubReviewThreadState,
} from "./types.ts";

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
			schema: prSummaryListSchema,
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
			schema: ghReviewsResponseSchema,
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
			schema: ghDiscussionCommentsResponseSchema,
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
		readonly schema: Parameters<typeof parseJson<T>>[1];
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
		readonly schema: Parameters<typeof parseGraphqlJson<T>>[1];
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

function isLookupMiss(result: ExecResult): boolean {
	const text = `${result.stdout}\n${result.stderr}`.toLowerCase();
	return (
		result.code === 1 &&
		(text.includes("no pull requests") || text.includes("no pr") || text.includes("not found"))
	);
}
