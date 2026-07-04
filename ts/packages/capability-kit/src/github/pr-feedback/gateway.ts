import type { z } from "zod";

import { normalizeGithubStatusChecks, type GithubStatusChecks } from "../pr-status.ts";
import type { CommandRunner, ExecResult } from "@ns/core/exec";
import { GITHUB_CLI_TIMEOUT_MS, runGitHubCli, type RunGitHubCliResult } from "../cli.ts";
import { optionalEntry, type MaybePromise, type ExplicitUndefined } from "@ns/core/primitives";
import type { Result } from "@ns/core/result";

import {
	branchPrChecksArgs,
	discussionCommentPageArgs,
	prChecksArgs,
	replyToReviewThreadArgs,
	resolveReviewThreadArgs,
	resolveReviewThreadsArgs,
	reviewThreadCommentPageArgs,
	reviewThreadPageArgs,
} from "./args.ts";
import {
	failureContextFields,
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
import {
	parseGraphqlJson,
	parseJson,
	requireCursor,
	type GithubPrFeedbackFailureContext,
} from "./parsing.ts";
import {
	ghBranchPrChecksResponseSchema,
	ghDiscussionCommentsResponseSchema,
	ghPrChecksResponseSchema,
	type GhBranchPrChecksNode,
	type GhBranchPrChecksResponse,
	ghReplyReviewThreadResponseSchema,
	ghResolveReviewThreadResponseSchema,
	ghResolveReviewThreadsResponseSchema,
	ghReviewThreadCommentsResponseSchema,
	type GhResolveReviewThreadsResponse,
	ghReviewThreadsResponseSchema,
	ghReviewsResponseSchema,
	prSummaryListSchema,
	prSummarySchema,
	type GhReviewThread,
} from "./schemas.ts";
import type {
	GithubBranchPrChecksOutcome,
	GithubPrDiscussionComment,
	GithubPrFeedbackCursorContextFields,
	GithubPrFeedbackFailure,
	GithubPrFeedbackOperation,
	GithubPrFeedbackOptions,
	GithubPrLookupOutcome,
	GithubPrReview,
	GithubPrReviewThread,
	GithubPrSummary,
	GithubReviewThreadReply,
	GithubReviewThreadState,
} from "./types.ts";

interface RunGhParsedOptions<T> extends GithubPrFeedbackCursorContextFields {
	readonly operation: GithubPrFeedbackOperation;
	readonly args: readonly string[];
	readonly params: GithubPrFeedbackOptions;
	readonly schema: z.ZodType<T>;
}

type GhJsonParser<T> = (
	text: string,
	schema: z.ZodType<T>,
	context: GithubPrFeedbackFailureContext,
) => Result<T, GithubPrFeedbackFailure>;

interface GraphqlPageInfo {
	readonly hasNextPage: boolean;
	readonly endCursor?: ExplicitUndefined<"external-mirror", string | null>;
}

interface GraphqlPageConnection<TNode> {
	readonly nodes: readonly TNode[];
	readonly pageInfo: GraphqlPageInfo;
}

type GraphqlPaginationCursorMode =
	| {
			type: "cursorless-first";
			argsForCursor: (cursor: string | null | undefined) => readonly string[];
	  }
	| {
			type: "cursor-required";
			initialCursor: string | null | undefined;
			threadId: string;
			argsForCursor: (cursor: string) => readonly string[];
	  };

interface CollectGraphqlPagesOptions<TResponse, TNode, TOutput> {
	readonly operation: GithubPrFeedbackOperation;
	readonly params: GithubPrFeedbackOptions & { readonly prNumber: number };
	readonly schema: z.ZodType<TResponse>;
	readonly cursorContext: string;
	readonly missingCursorMessage: string;
	readonly cursorMode: GraphqlPaginationCursorMode;
	readonly connectionFromResponse: (
		response: TResponse,
	) => Result<GraphqlPageConnection<TNode>, GithubPrFeedbackFailure>;
	readonly mapNode: (node: TNode) => MaybePromise<Result<TOutput, GithubPrFeedbackFailure>>;
}

export class RealGithubPrFeedbackGateway {
	private readonly runner: CommandRunner;

	constructor(runner: CommandRunner) {
		this.runner = runner;
	}

	async getPr(
		params: GithubPrFeedbackOptions & { readonly prNumber: number },
	): Promise<Result<GithubPrLookupOutcome, GithubPrFeedbackFailure>> {
		return await this.getPrBySelector(String(params.prNumber), "getPr", params);
	}

	async getPrForBranch(
		params: GithubPrFeedbackOptions & { readonly branch: string },
	): Promise<Result<GithubPrLookupOutcome, GithubPrFeedbackFailure>> {
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
		return await this.collectGraphqlPages({
			operation: "getPrReviewThreads",
			params,
			schema: ghReviewThreadsResponseSchema,
			cursorContext: "reviewThreads",
			missingCursorMessage:
				"GitHub returned a reviewThreads page with hasNextPage but no endCursor",
			cursorMode: {
				type: "cursorless-first",
				argsForCursor: (cursor) => reviewThreadPageArgs(params.prNumber, cursor),
			},
			connectionFromResponse: (response) =>
				feedbackOk(response.data.repository.pullRequest.reviewThreads),
			mapNode: async (thread) => {
				const hydrated = await this.withCompleteThreadComments(thread, params);
				if (!hydrated.ok) return feedbackErr(hydrated.error);
				return feedbackOk(normalizeReviewThread(hydrated.value));
			},
		});
	}

	async getPrDiscussionComments(
		params: GithubPrFeedbackOptions & { readonly prNumber: number },
	): Promise<Result<readonly GithubPrDiscussionComment[], GithubPrFeedbackFailure>> {
		return await this.collectGraphqlPages({
			operation: "getPrDiscussionComments",
			params,
			schema: ghDiscussionCommentsResponseSchema,
			cursorContext: "discussionComments",
			missingCursorMessage:
				"GitHub returned a discussion comments page with hasNextPage but no endCursor",
			cursorMode: {
				type: "cursorless-first",
				argsForCursor: (cursor) => discussionCommentPageArgs(params.prNumber, cursor),
			},
			connectionFromResponse: (response) =>
				feedbackOk(response.data.repository.pullRequest.comments),
			mapNode: (comment) => feedbackOk(normalizeDiscussionComment(comment)),
		});
	}

	async getPrChecks(
		params: GithubPrFeedbackOptions & { readonly prNumber: number },
	): Promise<Result<GithubStatusChecks, GithubPrFeedbackFailure>> {
		const result = await this.runGhGraphqlJson({
			operation: "getPrChecks",
			args: prChecksArgs(params.prNumber),
			params,
			schema: ghPrChecksResponseSchema,
			prNumber: params.prNumber,
		});
		if (!result.ok) return result;
		const contexts = result.value.data.repository.pullRequest.statusCheckRollup?.contexts;
		return feedbackOk(
			normalizeGithubStatusChecks(contexts?.nodes ?? [], {
				hasMore: contexts?.pageInfo.hasNextPage ?? false,
			}),
		);
	}

	async getBranchPrChecks(
		params: GithubPrFeedbackOptions & { readonly branches: readonly string[] },
	): Promise<Result<readonly GithubBranchPrChecksOutcome[], GithubPrFeedbackFailure>> {
		if (params.branches.length === 0) return feedbackOk([]);
		const result = await this.runGhGraphqlJson({
			operation: "getBranchPrChecks",
			args: branchPrChecksArgs(params.branches),
			params,
			schema: ghBranchPrChecksResponseSchema,
		});
		if (!result.ok) return result;
		return this.normalizeBranchPrChecksResponse(result.value, params.branches);
	}

	private normalizeBranchPrChecksResponse(
		response: GhBranchPrChecksResponse,
		branches: readonly string[],
	): Result<readonly GithubBranchPrChecksOutcome[], GithubPrFeedbackFailure> {
		const outcomes: GithubBranchPrChecksOutcome[] = [];
		for (const [index, branch] of branches.entries()) {
			const alias = `b${index}`;
			const connection = response.data.repository[alias];
			if (connection === undefined || connection === null) {
				return feedbackErr(
					failureFromMessage({
						code: "github_pr_feedback_response_invalid",
						operation: "getBranchPrChecks",
						message: `GitHub branch PR checks response did not include ${alias}.nodes for branch ${branch}.`,
					}),
				);
			}
			if (connection.nodes.length === 0) {
				outcomes.push({ branch, type: "missing" });
				continue;
			}
			if (connection.nodes.length > 1) {
				outcomes.push({
					branch,
					type: "ambiguous",
					candidates: connection.nodes.map(branchPrSummaryFromNode),
				});
				continue;
			}
			const node = connection.nodes[0];
			if (node === undefined || node.headRefName !== branch) {
				return feedbackErr(
					failureFromMessage({
						code: "github_pr_feedback_response_invalid",
						operation: "getBranchPrChecks",
						message: `GitHub branch PR checks response ${alias} headRefName did not match branch ${branch}.`,
					}),
				);
			}
			const contexts = node.statusCheckRollup?.contexts;
			outcomes.push({
				branch,
				type: "found",
				pr: branchPrSummaryFromNode(node),
				checks: normalizeGithubStatusChecks(contexts?.nodes ?? [], {
					hasMore: contexts?.pageInfo.hasNextPage ?? false,
				}),
			});
		}
		return feedbackOk(outcomes);
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

	async resolveReviewThreads(
		params: GithubPrFeedbackOptions & { readonly threadIds: readonly string[] },
	): Promise<Result<readonly GithubReviewThreadState[], GithubPrFeedbackFailure>> {
		if (params.threadIds.length === 0) return feedbackOk([]);
		const result = await this.runGhGraphqlJson({
			operation: "resolveReviewThreads",
			args: resolveReviewThreadsArgs(params.threadIds),
			params,
			schema: ghResolveReviewThreadsResponseSchema,
		});
		if (!result.ok) return result;
		return this.normalizeResolveReviewThreadsResponse(result.value, params.threadIds);
	}

	private normalizeResolveReviewThreadsResponse(
		response: GhResolveReviewThreadsResponse,
		threadIds: readonly string[],
	): Result<readonly GithubReviewThreadState[], GithubPrFeedbackFailure> {
		const states: GithubReviewThreadState[] = [];
		for (const [index, threadId] of threadIds.entries()) {
			const alias = `resolve${index}`;
			const thread = response.data[alias]?.thread;
			if (thread === undefined || thread === null) {
				return feedbackErr(
					failureFromMessage({
						code: "github_pr_feedback_response_invalid",
						operation: "resolveReviewThreads",
						message: `GitHub resolve mutation response did not include ${alias}.thread.`,
						threadId,
					}),
				);
			}
			if (thread.id !== threadId) {
				return feedbackErr(
					failureFromMessage({
						code: "github_pr_feedback_response_invalid",
						operation: "resolveReviewThreads",
						message: `GitHub resolve mutation response ${alias}.thread.id did not match the requested thread ID.`,
						threadId,
					}),
				);
			}
			states.push({ threadId: thread.id, isResolved: thread.isResolved });
		}
		return feedbackOk(states);
	}

	private async getPrBySelector(
		selector: string,
		operation: "getPr" | "getPrForBranch",
		params: GithubPrFeedbackOptions,
	): Promise<Result<GithubPrLookupOutcome, GithubPrFeedbackFailure>> {
		const args = [
			"pr",
			"view",
			selector,
			"--json",
			"number,title,url,headRefName,headRefOid,baseRefName,state",
		];
		const run = await this.runGh({ operation, args, params });
		if (run.type === "startup_error") return feedbackErr(failureFromStartup(run, operation));
		if (run.result.code !== 0 || run.result.killed) {
			if (isExactPrLookupMiss(run.result, operation)) {
				return feedbackOk({
					found: false,
					miss: {
						stderr: run.result.stderr === "" ? "no PR found" : run.result.stderr,
						exitCode: run.result.code,
					},
				});
			}
			return feedbackErr(failureFromCompleted(run, operation));
		}
		const parseResult = parseJson(run.result.stdout, prSummarySchema, { operation, run });
		if (!parseResult.ok) return feedbackErr(parseResult.error);
		return feedbackOk({ found: true, pr: normalizePrSummary(parseResult.value) });
	}

	private async withCompleteThreadComments(
		thread: GhReviewThread,
		params: GithubPrFeedbackOptions & { readonly prNumber: number },
	): Promise<Result<GhReviewThread, GithubPrFeedbackFailure>> {
		if (!thread.comments.pageInfo.hasNextPage) return feedbackOk(thread);

		const comments = [...thread.comments.nodes];
		const additionalComments = await this.collectGraphqlPages({
			operation: "getPrReviewThreads",
			params,
			schema: ghReviewThreadCommentsResponseSchema,
			cursorContext: "reviewThreadComments",
			missingCursorMessage: `GitHub returned review thread ${thread.id} comments with hasNextPage but no endCursor`,
			cursorMode: {
				type: "cursor-required",
				initialCursor: thread.comments.pageInfo.endCursor,
				threadId: thread.id,
				argsForCursor: (cursor) => reviewThreadCommentPageArgs(thread.id, cursor),
			},
			connectionFromResponse: (response) => {
				const node = response.data.node;
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
				return feedbackOk(node.comments);
			},
			mapNode: (comment) => feedbackOk(comment),
		});
		if (!additionalComments.ok) return feedbackErr(additionalComments.error);
		comments.push(...additionalComments.value);
		return feedbackOk({
			...thread,
			comments: { ...thread.comments, nodes: comments, pageInfo: { hasNextPage: false } },
		});
	}

	private async collectGraphqlPages<TResponse, TNode, TOutput>(
		options: CollectGraphqlPagesOptions<TResponse, TNode, TOutput>,
	): Promise<Result<readonly TOutput[], GithubPrFeedbackFailure>> {
		const items: TOutput[] = [];
		const threadId =
			options.cursorMode.type === "cursor-required" ? options.cursorMode.threadId : undefined;
		let cursor =
			options.cursorMode.type === "cursor-required" ? options.cursorMode.initialCursor : undefined;
		let isFirstFetch = true;
		for (;;) {
			let args: readonly string[];
			if (options.cursorMode.type === "cursorless-first" && isFirstFetch) {
				args = options.cursorMode.argsForCursor(cursor);
			} else {
				const cursorResult = requireCursor(cursor, {
					operation: options.operation,
					message: options.missingCursorMessage,
					prNumber: options.params.prNumber,
					...optionalEntry("threadId", threadId),
					cursorContext: options.cursorContext,
				});
				if (!cursorResult.ok) return feedbackErr(cursorResult.error);
				args = options.cursorMode.argsForCursor(cursorResult.value);
			}
			const result = await this.runGhGraphqlJson({
				operation: options.operation,
				args,
				params: options.params,
				schema: options.schema,
				prNumber: options.params.prNumber,
				...optionalEntry("threadId", threadId),
				cursorContext: options.cursorContext,
			});
			if (!result.ok) return result;
			const connection = options.connectionFromResponse(result.value);
			if (!connection.ok) return feedbackErr(connection.error);
			for (const node of connection.value.nodes) {
				const item = await options.mapNode(node);
				if (!item.ok) return feedbackErr(item.error);
				items.push(item.value);
			}
			if (!connection.value.pageInfo.hasNextPage) break;
			cursor = connection.value.pageInfo.endCursor;
			isFirstFetch = false;
		}
		return feedbackOk(items);
	}

	private async runGhJson<T>(
		options: RunGhParsedOptions<T>,
	): Promise<Result<T, GithubPrFeedbackFailure>> {
		return await this.runGhParsed(options, parseJson);
	}

	private async runGhGraphqlJson<T>(
		options: RunGhParsedOptions<T>,
	): Promise<Result<T, GithubPrFeedbackFailure>> {
		return await this.runGhParsed(options, parseGraphqlJson);
	}

	private async runGhParsed<T>(
		options: RunGhParsedOptions<T>,
		parse: GhJsonParser<T>,
	): Promise<Result<T, GithubPrFeedbackFailure>> {
		const run = await this.runGh(options);
		if (run.type === "startup_error")
			return feedbackErr(failureFromStartup(run, options.operation));
		if (run.result.code !== 0 || run.result.killed)
			return feedbackErr(
				failureFromCompleted(run, options.operation, failureContextFields(options)),
			);
		return parse(run.result.stdout, options.schema, {
			operation: options.operation,
			run,
			...failureContextFields(options),
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

function branchPrSummaryFromNode(node: GhBranchPrChecksNode): GithubPrSummary {
	return {
		number: node.number,
		title: node.title,
		url: node.url,
		headRefName: node.headRefName,
		baseRefName: node.baseRefName,
		state: "OPEN",
		headRefOid: node.headRefOid ?? null,
	};
}

function isExactPrLookupMiss(result: ExecResult, operation: "getPr" | "getPrForBranch"): boolean {
	if (result.code !== 1 || result.killed) return false;
	const text = `${result.stdout}\n${result.stderr}`.toLowerCase();
	switch (operation) {
		case "getPr":
		case "getPrForBranch":
			// Keep generic "not found" output classified as a gh failure so repo/auth failures surface.
			return text.includes("no pull requests found");
	}
}
