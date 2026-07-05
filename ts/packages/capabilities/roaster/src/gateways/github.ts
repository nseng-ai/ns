import {
	type CommandExecApi,
	commandFailureReason,
	execApiToCommandRunner,
} from "@nseng-ai/core/command";
import { runGitHubCli } from "@nseng-ai/capability-kit/github/cli";
import {
	ghAuthorSchema,
	normalizeAuthor,
	parseGithubJson,
	RealGithubPrFeedbackGateway,
	withNumericGithubIdentity,
	type GithubPrFeedbackFailure,
	type GithubPrReviewThread,
} from "@nseng-ai/capability-kit/github/pr-feedback";
import { formatErrorMessage, type ExplicitUndefined } from "@nseng-ai/core/primitives";
import { withTemporaryJsonFile } from "@nseng-ai/capability-kit/temp-files";
import { z } from "zod";

import type { GitHubGatewayFailure, RoasterResult } from "../core/failures.ts";
import type {
	PRChangedFile,
	PRDiscussionComment,
	PRInlineCommentInput,
	PRReviewComment,
} from "../core/models.ts";
import { ROASTER_BOT_LOGIN } from "../core/roaster-bot.ts";

const ghChangedFileSchema = z
	.object({
		filename: z.string().optional(),
		path: z.string().optional(),
		status: z.string().default("modified"),
		patch: z.string().nullable().optional(),
	})
	.loose();
const ghReviewCommentSchema = z
	.object({
		body: z.string().default(""),
		author: ghAuthorSchema.optional(),
		user: ghAuthorSchema.optional(),
	})
	.loose();
const ghDiscussionCommentSchema = z
	.object({
		id: z.union([z.number().int(), z.string()]).optional(),
		databaseId: z.number().int().optional(),
		body: z.string().default(""),
		author: ghAuthorSchema.optional(),
		user: ghAuthorSchema.optional(),
	})
	.loose()
	.transform((comment, ctx) => withNumericGithubIdentity(comment, ctx, "Discussion comment"));

export interface GitHubGatewayOptions {
	readonly cwd: string;
	readonly env?: ExplicitUndefined<"env-map", NodeJS.ProcessEnv>;
	readonly signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
}

export interface FindPrDiscussionCommentByMarkerOptions extends GitHubGatewayOptions {
	readonly prNumber: number;
	readonly marker: string;
	readonly authorLogin: string;
}

export interface RoasterGitHubGateway {
	getPrChangedFiles(
		prNumber: number,
		options: GitHubGatewayOptions,
	): Promise<RoasterResult<readonly PRChangedFile[]>>;
	getPrReviewComments(
		prNumber: number,
		options: GitHubGatewayOptions,
	): Promise<RoasterResult<readonly PRReviewComment[]>>;
	getPrReviewThreads(
		prNumber: number,
		options: GitHubGatewayOptions,
	): Promise<RoasterResult<readonly GithubPrReviewThread[]>>;
	createPrReview(
		prNumber: number,
		comments: readonly PRInlineCommentInput[],
		options: GitHubGatewayOptions,
	): Promise<RoasterResult<void>>;
	findPrDiscussionCommentByMarker(
		options: FindPrDiscussionCommentByMarkerOptions,
	): Promise<RoasterResult<PRDiscussionComment | null>>;
	addPrDiscussionComment(
		prNumber: number,
		body: string,
		options: GitHubGatewayOptions,
	): Promise<RoasterResult<PRDiscussionComment>>;
	updatePrDiscussionComment(
		commentId: number,
		body: string,
		options: GitHubGatewayOptions,
	): Promise<RoasterResult<PRDiscussionComment>>;
}

export class RealRoasterGitHubGateway implements RoasterGitHubGateway {
	private readonly execApi: CommandExecApi;
	private readonly feedback: RealGithubPrFeedbackGateway;

	constructor(execApi: CommandExecApi) {
		this.execApi = execApi;
		this.feedback = new RealGithubPrFeedbackGateway(execApiToCommandRunner(execApi));
	}

	async getPrChangedFiles(
		prNumber: number,
		options: GitHubGatewayOptions,
	): Promise<RoasterResult<readonly PRChangedFile[]>> {
		const args = ["api", "--paginate", `repos/{owner}/{repo}/pulls/${prNumber}/files`];
		const result = await this.runGh(args, options);
		if (result.type === "error") return result;
		const parsed = parseJson(
			result.value.stdout,
			z.array(ghChangedFileSchema),
			"list PR changed files",
		);
		if (parsed.type === "error") return parsed;
		return {
			type: "ok",
			value: parsed.value
				.map((file) => ({
					path: file.filename ?? file.path ?? "",
					status: file.status,
					patch: file.patch ?? null,
				}))
				.filter((file) => file.path !== ""),
		};
	}

	async getPrReviewComments(
		prNumber: number,
		options: GitHubGatewayOptions,
	): Promise<RoasterResult<readonly PRReviewComment[]>> {
		const args = ["api", "--paginate", `repos/{owner}/{repo}/pulls/${prNumber}/comments`];
		const result = await this.runGh(args, options);
		if (result.type === "error") return result;
		const parsed = parseJson(
			result.value.stdout,
			z.array(ghReviewCommentSchema),
			"list PR review comments",
		);
		if (parsed.type === "error") return parsed;
		return {
			type: "ok",
			value: parsed.value.map((comment) => ({
				author: normalizeAuthor(comment.user ?? comment.author ?? null),
				body: comment.body,
			})),
		};
	}

	async getPrReviewThreads(
		prNumber: number,
		options: GitHubGatewayOptions,
	): Promise<RoasterResult<readonly GithubPrReviewThread[]>> {
		const result = await this.feedback.getPrReviewThreads({
			...options,
			prNumber,
		});
		if (!result.ok) return error(convertFeedbackFailure(result.error));
		return { type: "ok", value: result.value };
	}

	async createPrReview(
		prNumber: number,
		comments: readonly PRInlineCommentInput[],
		options: GitHubGatewayOptions,
	): Promise<RoasterResult<void>> {
		return await withTemporaryJsonFile(
			{
				prefix: "roaster-gh-",
				value: {
					event: "COMMENT",
					comments: comments.map((comment) => ({
						path: comment.path,
						line: comment.line,
						body: comment.body,
					})),
				},
			},
			async (inputPath) => {
				const args = [
					"api",
					"--method",
					"POST",
					`repos/{owner}/{repo}/pulls/${prNumber}/reviews`,
					"--input",
					inputPath,
				];
				const result = await this.runGh(args, options);
				if (result.type === "error") return result;
				return { type: "ok", value: undefined };
			},
		);
	}

	async findPrDiscussionCommentByMarker(
		options: FindPrDiscussionCommentByMarkerOptions,
	): Promise<RoasterResult<PRDiscussionComment | null>> {
		const comments = await this.getIssueComments(options.prNumber, options);
		if (comments.type === "error") return comments;
		const comment = comments.value.find(
			(item) => item.author === options.authorLogin && item.body.includes(options.marker),
		);
		return { type: "ok", value: comment === undefined ? null : publicDiscussionComment(comment) };
	}

	async addPrDiscussionComment(
		prNumber: number,
		body: string,
		options: GitHubGatewayOptions,
	): Promise<RoasterResult<PRDiscussionComment>> {
		const args = [
			"api",
			"--method",
			"POST",
			`repos/{owner}/{repo}/issues/${prNumber}/comments`,
			"-f",
			`body=${body}`,
		];
		return await this.runDiscussionMutation(args, options);
	}

	async updatePrDiscussionComment(
		commentId: number,
		body: string,
		options: GitHubGatewayOptions,
	): Promise<RoasterResult<PRDiscussionComment>> {
		const args = [
			"api",
			"--method",
			"PATCH",
			`repos/{owner}/{repo}/issues/comments/${commentId}`,
			"-f",
			`body=${body}`,
		];
		return await this.runDiscussionMutation(args, options);
	}

	private async getIssueComments(
		prNumber: number,
		options: GitHubGatewayOptions,
	): Promise<RoasterResult<readonly AuthoredDiscussionComment[]>> {
		const args = ["api", "--paginate", `repos/{owner}/{repo}/issues/${prNumber}/comments`];
		const result = await this.runGh(args, options);
		if (result.type === "error") return result;
		const parsed = parseJson(
			result.value.stdout,
			z.array(ghDiscussionCommentSchema),
			"list PR discussion comments",
		);
		if (parsed.type === "error") return parsed;
		return {
			type: "ok",
			value: parsed.value.map(normalizeDiscussionComment),
		};
	}

	private async runDiscussionMutation(
		args: readonly string[],
		options: GitHubGatewayOptions,
	): Promise<RoasterResult<PRDiscussionComment>> {
		const result = await this.runGh(args, options);
		if (result.type === "error") return result;
		const parsed = parseJson(
			result.value.stdout,
			ghDiscussionCommentSchema,
			"mutate PR discussion comment",
		);
		if (parsed.type === "error") return parsed;
		return { type: "ok", value: publicDiscussionComment(normalizeDiscussionComment(parsed.value)) };
	}

	private async runGh(
		args: readonly string[],
		options: GitHubGatewayOptions,
	): Promise<RoasterResult<{ readonly stdout: string }>> {
		const run = await runGitHubCli({
			runner: execApiToCommandRunner(this.execApi),
			args,
			cwd: options.cwd,
			...(options.env === undefined ? {} : { env: options.env }),
			...(options.signal === undefined ? {} : { signal: options.signal }),
		});
		if (run.type === "startup_error") {
			return error({
				type: "github-cli-failed",
				message: `${run.displayCommand} failed to start in ${options.cwd}: ${run.message}`,
			});
		}
		const result = run.result;
		if (result.code !== 0 || result.killed) {
			return error({
				type: "github-cli-failed",
				message: `${run.displayCommand} failed in ${options.cwd}: ${commandFailureReason(result)}`,
			});
		}
		return { type: "ok", value: { stdout: result.stdout } };
	}
}

export interface CreatedReviewLogEntry {
	readonly prNumber: number;
	readonly comments: readonly PRInlineCommentInput[];
}

export interface FakeRoasterGitHubGatewayOptions {
	readonly changedFilesByPr?: ReadonlyMap<number, readonly PRChangedFile[]>;
	readonly reviewCommentsByPr?: ReadonlyMap<number, readonly PRReviewComment[]>;
	readonly reviewThreadsByPr?: ReadonlyMap<number, readonly GithubPrReviewThread[]>;
	readonly discussionCommentsByPr?: ReadonlyMap<
		number,
		readonly (PRDiscussionComment & { readonly author: string })[]
	>;
}

export class FakeRoasterGitHubGateway implements RoasterGitHubGateway {
	private readonly changedFilesByPr = new Map<number, PRChangedFile[]>();
	private readonly reviewCommentsByPr = new Map<number, PRReviewComment[]>();
	private readonly reviewThreadsByPr = new Map<number, GithubPrReviewThread[]>();
	private readonly discussionCommentsByPr = new Map<
		number,
		Array<PRDiscussionComment & { readonly author: string }>
	>();
	private readonly markerCallsInternal: FindPrDiscussionCommentByMarkerOptions[] = [];
	private readonly reviewThreadCallsInternal: Array<
		GitHubGatewayOptions & { readonly prNumber: number }
	> = [];
	private readonly createdReviewsInternal: CreatedReviewLogEntry[] = [];
	private nextCommentId = 1;

	constructor(options: FakeRoasterGitHubGatewayOptions = {}) {
		copyMapArray(options.changedFilesByPr, this.changedFilesByPr, copyChangedFile);
		copyMapArray(options.reviewCommentsByPr, this.reviewCommentsByPr, copyReviewComment);
		copyMapArray(options.reviewThreadsByPr, this.reviewThreadsByPr, copyReviewThread);
		copyMapArray(
			options.discussionCommentsByPr,
			this.discussionCommentsByPr,
			copyAuthoredDiscussionComment,
		);
	}

	async getPrChangedFiles(
		prNumber: number,
		_options: GitHubGatewayOptions,
	): Promise<RoasterResult<readonly PRChangedFile[]>> {
		return { type: "ok", value: (this.changedFilesByPr.get(prNumber) ?? []).map(copyChangedFile) };
	}

	async getPrReviewComments(
		prNumber: number,
		_options: GitHubGatewayOptions,
	): Promise<RoasterResult<readonly PRReviewComment[]>> {
		return {
			type: "ok",
			value: (this.reviewCommentsByPr.get(prNumber) ?? []).map(copyReviewComment),
		};
	}

	async getPrReviewThreads(
		prNumber: number,
		options: GitHubGatewayOptions,
	): Promise<RoasterResult<readonly GithubPrReviewThread[]>> {
		this.reviewThreadCallsInternal.push({ ...copyGitHubGatewayOptions(options), prNumber });
		return {
			type: "ok",
			value: (this.reviewThreadsByPr.get(prNumber) ?? []).map(copyReviewThread),
		};
	}

	async createPrReview(
		prNumber: number,
		comments: readonly PRInlineCommentInput[],
		_options: GitHubGatewayOptions,
	): Promise<RoasterResult<void>> {
		this.createdReviewsInternal.push({ prNumber, comments: comments.map(copyInlineCommentInput) });
		return { type: "ok", value: undefined };
	}

	async findPrDiscussionCommentByMarker(
		options: FindPrDiscussionCommentByMarkerOptions,
	): Promise<RoasterResult<PRDiscussionComment | null>> {
		this.markerCallsInternal.push(copyFindPrDiscussionCommentByMarkerOptions(options));
		const comment = (this.discussionCommentsByPr.get(options.prNumber) ?? []).find(
			(item) => item.author === options.authorLogin && item.body.includes(options.marker),
		);
		return {
			type: "ok",
			value: comment === undefined ? null : { id: comment.id, body: comment.body },
		};
	}

	async addPrDiscussionComment(
		prNumber: number,
		body: string,
		_options: GitHubGatewayOptions,
	): Promise<RoasterResult<PRDiscussionComment>> {
		const comment = { id: this.nextCommentId, body, author: ROASTER_BOT_LOGIN };
		this.nextCommentId += 1;
		const comments = this.discussionCommentsByPr.get(prNumber) ?? [];
		comments.push(comment);
		this.discussionCommentsByPr.set(prNumber, comments);
		return { type: "ok", value: { id: comment.id, body: comment.body } };
	}

	async updatePrDiscussionComment(
		commentId: number,
		body: string,
		_options: GitHubGatewayOptions,
	): Promise<RoasterResult<PRDiscussionComment>> {
		for (const [prNumber, comments] of this.discussionCommentsByPr.entries()) {
			const index = comments.findIndex((comment) => comment.id === commentId);
			if (index === -1) continue;
			const existing = comments[index];
			if (existing === undefined) continue;
			comments[index] = { ...existing, body };
			this.discussionCommentsByPr.set(prNumber, comments);
			return { type: "ok", value: { id: commentId, body } };
		}
		return error({
			type: "github-response-invalid",
			message: `No fake discussion comment with id ${commentId}.`,
		});
	}

	createdReviews(): readonly CreatedReviewLogEntry[] {
		return this.createdReviewsInternal.map((entry) => ({
			prNumber: entry.prNumber,
			comments: entry.comments.map(copyInlineCommentInput),
		}));
	}

	markerCalls(): readonly FindPrDiscussionCommentByMarkerOptions[] {
		return this.markerCallsInternal.map(copyFindPrDiscussionCommentByMarkerOptions);
	}

	reviewThreadCalls(): ReadonlyArray<GitHubGatewayOptions & { readonly prNumber: number }> {
		return this.reviewThreadCallsInternal.map((call) => ({
			...copyGitHubGatewayOptions(call),
			prNumber: call.prNumber,
		}));
	}
}

function parseJson<T>(text: string, schema: z.ZodType<T>, operation: string): RoasterResult<T> {
	const result = parseGithubJson(text, schema);
	if (result.type === "parse-error")
		return error({
			type: "github-json-invalid",
			message: `GitHub response for ${operation} is not valid JSON: ${formatErrorMessage(result.error)}`,
		});
	if (result.type === "schema-error")
		return error({
			type: "github-response-invalid",
			message: `GitHub response for ${operation} did not match the expected shape: ${z.prettifyError(result.error)}`,
		});
	return { type: "ok", value: result.value };
}

type AuthoredDiscussionComment = PRDiscussionComment & { readonly author: string };

function normalizeDiscussionComment(
	comment: z.infer<typeof ghDiscussionCommentSchema>,
): AuthoredDiscussionComment {
	return {
		id: comment.numericId,
		body: comment.body,
		author: normalizeAuthor(comment.user ?? comment.author ?? null),
	};
}

function convertFeedbackFailure(failure: GithubPrFeedbackFailure): GitHubGatewayFailure {
	const displayCommand = failure.displayCommand ?? failure.details?.displayCommand;
	return {
		type: githubFailureTypeForFeedbackFailure(failure),
		message:
			displayCommand === undefined ? failure.message : `${failure.message} (${displayCommand})`,
	};
}

function githubFailureTypeForFeedbackFailure(
	failure: GithubPrFeedbackFailure,
): GitHubGatewayFailure["type"] {
	switch (failure.code) {
		case "github_pr_feedback_json_parse_failed":
			return "github-json-invalid";
		case "github_pr_feedback_response_invalid":
		case "github_pr_feedback_pagination_invalid":
			return "github-response-invalid";
		case "github_pr_feedback_gh_failed":
		case "github_pr_feedback_startup_failed":
		case "github_pr_feedback_graphql_failed":
			return "github-cli-failed";
	}
}

function error(errorValue: GitHubGatewayFailure): RoasterResult<never> {
	return { type: "error", error: errorValue };
}

function publicDiscussionComment(comment: PRDiscussionComment): PRDiscussionComment {
	return { id: comment.id, body: comment.body };
}

function copyChangedFile(file: PRChangedFile): PRChangedFile {
	return { path: file.path, status: file.status, patch: file.patch };
}

function copyReviewComment(comment: PRReviewComment): PRReviewComment {
	return { author: comment.author, body: comment.body };
}

function copyReviewThread(thread: GithubPrReviewThread): GithubPrReviewThread {
	return {
		id: thread.id,
		path: thread.path,
		line: thread.line,
		startLine: thread.startLine,
		isResolved: thread.isResolved,
		isOutdated: thread.isOutdated,
		comments: thread.comments.map((comment) => ({ ...comment })),
	};
}

function copyInlineCommentInput(comment: PRInlineCommentInput): PRInlineCommentInput {
	return { path: comment.path, line: comment.line, body: comment.body };
}

export function copyGitHubGatewayOptions(options: GitHubGatewayOptions): GitHubGatewayOptions {
	return {
		cwd: options.cwd,
		...(options.env === undefined ? {} : { env: options.env }),
		...(options.signal === undefined ? {} : { signal: options.signal }),
	};
}

function copyFindPrDiscussionCommentByMarkerOptions(
	options: FindPrDiscussionCommentByMarkerOptions,
): FindPrDiscussionCommentByMarkerOptions {
	return {
		...copyGitHubGatewayOptions(options),
		prNumber: options.prNumber,
		marker: options.marker,
		authorLogin: options.authorLogin,
	};
}

function copyAuthoredDiscussionComment(
	comment: AuthoredDiscussionComment,
): AuthoredDiscussionComment {
	return { id: comment.id, body: comment.body, author: comment.author };
}

function copyMapArray<TKey, TValue>(
	source: ReadonlyMap<TKey, readonly TValue[]> | undefined,
	target: Map<TKey, TValue[]>,
	copy: (value: TValue) => TValue,
): void {
	if (source === undefined) return;
	for (const [key, values] of source.entries()) target.set(key, values.map(copy));
}
