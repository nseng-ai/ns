import { type CommandExecApi, execApiToCommandRunner } from "@nseng-ai/foundation/command";
import {
	RealGithubPrFeedbackGateway,
	type GithubPrDiscussionComment,
	type GithubPrFeedbackFailure,
	type GithubPrRestReviewComment,
	type GithubPrReviewThread,
} from "@nseng-ai/capability-kit/github/pr-feedback";
import { FakeGithubPrFeedbackGateway } from "@nseng-ai/capability-kit/github/testing";
import { type ExplicitUndefined } from "@nseng-ai/foundation/primitives";

import type { GitHubGatewayFailure, RoasterResult } from "../core/failures.ts";
import type {
	PRChangedFile,
	PRDiscussionComment,
	PRInlineCommentInput,
	PRReviewComment,
} from "../core/models.ts";
import { ROASTER_BOT_LOGIN } from "../core/roaster-bot.ts";

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
	private readonly feedback: RealGithubPrFeedbackGateway;

	constructor(execApi: CommandExecApi) {
		this.feedback = new RealGithubPrFeedbackGateway(execApiToCommandRunner(execApi));
	}

	async getPrChangedFiles(
		prNumber: number,
		options: GitHubGatewayOptions,
	): Promise<RoasterResult<readonly PRChangedFile[]>> {
		const result = await this.feedback.getPrChangedFiles({ ...options, prNumber });
		if (!result.ok) return error(convertFeedbackFailure(result.error, options.cwd));
		return { type: "ok", value: result.value.map(copyChangedFile) };
	}

	async getPrReviewComments(
		prNumber: number,
		options: GitHubGatewayOptions,
	): Promise<RoasterResult<readonly PRReviewComment[]>> {
		const result = await this.feedback.getPrReviewComments({ ...options, prNumber });
		if (!result.ok) return error(convertFeedbackFailure(result.error, options.cwd));
		return {
			type: "ok",
			value: result.value.map((comment) => ({ author: comment.author, body: comment.body })),
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
		if (!result.ok) return error(convertFeedbackFailure(result.error, options.cwd));
		return { type: "ok", value: result.value };
	}

	async createPrReview(
		prNumber: number,
		comments: readonly PRInlineCommentInput[],
		options: GitHubGatewayOptions,
	): Promise<RoasterResult<void>> {
		const result = await this.feedback.createPrReview({ ...options, prNumber, comments });
		if (!result.ok) return error(convertFeedbackFailure(result.error, options.cwd));
		return { type: "ok", value: undefined };
	}

	async findPrDiscussionCommentByMarker(
		options: FindPrDiscussionCommentByMarkerOptions,
	): Promise<RoasterResult<PRDiscussionComment | null>> {
		const result = await this.feedback.findPrDiscussionCommentByMarker(options);
		if (!result.ok) return error(convertFeedbackFailure(result.error, options.cwd));
		return {
			type: "ok",
			value: result.value === null ? null : publicDiscussionComment(result.value),
		};
	}

	async addPrDiscussionComment(
		prNumber: number,
		body: string,
		options: GitHubGatewayOptions,
	): Promise<RoasterResult<PRDiscussionComment>> {
		const result = await this.feedback.addPrDiscussionComment({ ...options, prNumber, body });
		if (!result.ok) return error(convertFeedbackFailure(result.error, options.cwd));
		return { type: "ok", value: publicDiscussionComment(result.value) };
	}

	async updatePrDiscussionComment(
		commentId: number,
		body: string,
		options: GitHubGatewayOptions,
	): Promise<RoasterResult<PRDiscussionComment>> {
		const result = await this.feedback.updatePrDiscussionComment({ ...options, commentId, body });
		if (!result.ok) return error(convertFeedbackFailure(result.error, options.cwd));
		return { type: "ok", value: publicDiscussionComment(result.value) };
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
	private readonly feedback: FakeGithubPrFeedbackGateway;
	private readonly markerCallsInternal: FindPrDiscussionCommentByMarkerOptions[] = [];
	private readonly reviewThreadCallsInternal: Array<
		GitHubGatewayOptions & { readonly prNumber: number }
	> = [];

	constructor(options: FakeRoasterGitHubGatewayOptions = {}) {
		this.feedback = new FakeGithubPrFeedbackGateway({
			...(options.changedFilesByPr === undefined
				? {}
				: { changedFilesByPr: options.changedFilesByPr }),
			...(options.reviewCommentsByPr === undefined
				? {}
				: { reviewCommentsByPr: toFeedbackReviewCommentsByPr(options.reviewCommentsByPr) }),
			...(options.reviewThreadsByPr === undefined
				? {}
				: { reviewThreadsByPr: options.reviewThreadsByPr }),
			...(options.discussionCommentsByPr === undefined
				? {}
				: {
						discussionCommentsByPr: toFeedbackDiscussionCommentsByPr(
							options.discussionCommentsByPr,
						),
					}),
		});
	}

	async getPrChangedFiles(
		prNumber: number,
		_options: GitHubGatewayOptions,
	): Promise<RoasterResult<readonly PRChangedFile[]>> {
		const result = await this.feedback.getPrChangedFiles({ prNumber });
		if (!result.ok) return error(convertFeedbackFailure(result.error, _options.cwd));
		return { type: "ok", value: result.value.map(copyChangedFile) };
	}

	async getPrReviewComments(
		prNumber: number,
		_options: GitHubGatewayOptions,
	): Promise<RoasterResult<readonly PRReviewComment[]>> {
		const result = await this.feedback.getPrReviewComments({ prNumber });
		if (!result.ok) return error(convertFeedbackFailure(result.error, _options.cwd));
		return {
			type: "ok",
			value: result.value.map((comment) => ({ author: comment.author, body: comment.body })),
		};
	}

	async getPrReviewThreads(
		prNumber: number,
		options: GitHubGatewayOptions,
	): Promise<RoasterResult<readonly GithubPrReviewThread[]>> {
		this.reviewThreadCallsInternal.push({ ...copyGitHubGatewayOptions(options), prNumber });
		const result = await this.feedback.getPrReviewThreads({ prNumber });
		if (!result.ok) return error(convertFeedbackFailure(result.error, options.cwd));
		return { type: "ok", value: result.value.map(copyReviewThread) };
	}

	async createPrReview(
		prNumber: number,
		comments: readonly PRInlineCommentInput[],
		options: GitHubGatewayOptions,
	): Promise<RoasterResult<void>> {
		const result = await this.feedback.createPrReview({ prNumber, comments });
		if (!result.ok) return error(convertFeedbackFailure(result.error, options.cwd));
		return { type: "ok", value: undefined };
	}

	async findPrDiscussionCommentByMarker(
		options: FindPrDiscussionCommentByMarkerOptions,
	): Promise<RoasterResult<PRDiscussionComment | null>> {
		this.markerCallsInternal.push(copyFindPrDiscussionCommentByMarkerOptions(options));
		const result = await this.feedback.findPrDiscussionCommentByMarker(options);
		if (!result.ok) return error(convertFeedbackFailure(result.error, options.cwd));
		return {
			type: "ok",
			value: result.value === null ? null : publicDiscussionComment(result.value),
		};
	}

	async addPrDiscussionComment(
		prNumber: number,
		body: string,
		options: GitHubGatewayOptions,
	): Promise<RoasterResult<PRDiscussionComment>> {
		const result = await this.feedback.addPrDiscussionComment({
			prNumber,
			body,
			authorLogin: ROASTER_BOT_LOGIN,
		});
		if (!result.ok) return error(convertFeedbackFailure(result.error, options.cwd));
		return { type: "ok", value: publicDiscussionComment(result.value) };
	}

	async updatePrDiscussionComment(
		commentId: number,
		body: string,
		options: GitHubGatewayOptions,
	): Promise<RoasterResult<PRDiscussionComment>> {
		const result = await this.feedback.updatePrDiscussionComment({ commentId, body });
		if (!result.ok) return error(convertFeedbackFailure(result.error, options.cwd));
		return { type: "ok", value: publicDiscussionComment(result.value) };
	}

	createdReviews(): readonly CreatedReviewLogEntry[] {
		return this.feedback.createdReviews().map((entry) => ({
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

function convertFeedbackFailure(
	failure: GithubPrFeedbackFailure,
	cwd: string | undefined,
): GitHubGatewayFailure {
	const displayCommand = failure.displayCommand ?? failure.details?.displayCommand;
	const location = cwd === undefined ? "" : ` in ${cwd}`;
	const operation = roasterOperationLabel(failure);
	const message =
		failure.code === "github_pr_feedback_response_invalid"
			? `did not match the expected shape: ${failure.message}`
			: failure.message;
	return {
		type: githubFailureTypeForFeedbackFailure(failure),
		message:
			displayCommand === undefined
				? `GitHub response for ${operation}: ${message}${location}`
				: `GitHub response for ${operation}: ${message} (${displayCommand})${location}`,
	};
}

function roasterOperationLabel(failure: GithubPrFeedbackFailure): string {
	switch (failure.details?.operation) {
		case "getPrChangedFiles":
			return "list PR changed files";
		case "getPrReviewComments":
			return "list PR review comments";
		case "getPrIssueComments":
		case "findPrDiscussionCommentByMarker":
			return "list PR discussion comments";
		case "addPrDiscussionComment":
		case "updatePrDiscussionComment":
			return "mutate PR discussion comment";
		case "createPrReview":
			return "create PR review";
		default:
			return failure.details?.operation ?? "GitHub PR feedback";
	}
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

function toFeedbackReviewCommentsByPr(
	source: ReadonlyMap<number, readonly PRReviewComment[]>,
): ReadonlyMap<number, readonly GithubPrRestReviewComment[]> {
	return new Map(
		[...source.entries()].map(([prNumber, comments]) => [
			prNumber,
			comments.map((comment, index) => toFeedbackReviewComment(comment, index)),
		]),
	);
}

function toFeedbackDiscussionCommentsByPr(
	source: ReadonlyMap<number, readonly (PRDiscussionComment & { readonly author: string })[]>,
): ReadonlyMap<number, readonly GithubPrDiscussionComment[]> {
	return new Map(
		[...source.entries()].map(([prNumber, comments]) => [
			prNumber,
			comments.map(toFeedbackDiscussionComment),
		]),
	);
}

function toFeedbackReviewComment(
	comment: PRReviewComment,
	index: number,
): GithubPrRestReviewComment {
	return {
		id: index + 1,
		reviewId: null,
		body: comment.body,
		author: comment.author,
		path: "",
		line: null,
		createdAt: "",
		updatedAt: null,
		inReplyToId: null,
	};
}

function toFeedbackDiscussionComment(
	comment: PRDiscussionComment & { readonly author: string },
): GithubPrDiscussionComment {
	return { ...comment, url: "" };
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
