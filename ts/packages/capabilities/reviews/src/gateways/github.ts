import { type CommandExecApi, execApiToCommandRunner } from "@nseng-ai/foundation/command";
import {
	RealGithubPrFeedbackGateway,
	type GithubPrFeedbackFailure,
	type GithubPrReviewThread,
} from "@nseng-ai/capability-kit/github/pr-feedback";
import type { ExplicitUndefined } from "@nseng-ai/foundation/primitives";
import type { Result } from "@nseng-ai/foundation/result";

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
		return mapRoasterValue(
			await unwrapFeedback(this.feedback.getPrChangedFiles({ ...options, prNumber }), options.cwd),
			(files) => files.map(copyChangedFile),
		);
	}

	async getPrReviewComments(
		prNumber: number,
		options: GitHubGatewayOptions,
	): Promise<RoasterResult<readonly PRReviewComment[]>> {
		return mapRoasterValue(
			await unwrapFeedback(
				this.feedback.getPrReviewComments({ ...options, prNumber }),
				options.cwd,
			),
			(comments) => comments.map(copyReviewComment),
		);
	}

	async getPrReviewThreads(
		prNumber: number,
		options: GitHubGatewayOptions,
	): Promise<RoasterResult<readonly GithubPrReviewThread[]>> {
		return await unwrapFeedback(
			this.feedback.getPrReviewThreads({ ...options, prNumber }),
			options.cwd,
		);
	}

	async createPrReview(
		prNumber: number,
		comments: readonly PRInlineCommentInput[],
		options: GitHubGatewayOptions,
	): Promise<RoasterResult<void>> {
		return await unwrapFeedback(
			this.feedback.createPrReview({ ...options, prNumber, comments }),
			options.cwd,
		);
	}

	async findPrDiscussionCommentByMarker(
		options: FindPrDiscussionCommentByMarkerOptions,
	): Promise<RoasterResult<PRDiscussionComment | null>> {
		return mapRoasterValue(
			await unwrapFeedback(this.feedback.findPrDiscussionCommentByMarker(options), options.cwd),
			(comment) => (comment === null ? null : publicDiscussionComment(comment)),
		);
	}

	async addPrDiscussionComment(
		prNumber: number,
		body: string,
		options: GitHubGatewayOptions,
	): Promise<RoasterResult<PRDiscussionComment>> {
		return mapRoasterValue(
			await unwrapFeedback(
				this.feedback.addPrDiscussionComment({ ...options, prNumber, body }),
				options.cwd,
			),
			publicDiscussionComment,
		);
	}

	async updatePrDiscussionComment(
		commentId: number,
		body: string,
		options: GitHubGatewayOptions,
	): Promise<RoasterResult<PRDiscussionComment>> {
		return mapRoasterValue(
			await unwrapFeedback(
				this.feedback.updatePrDiscussionComment({ ...options, commentId, body }),
				options.cwd,
			),
			publicDiscussionComment,
		);
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

type FakeDiscussionComment = PRDiscussionComment & { readonly author: string };

export class FakeRoasterGitHubGateway implements RoasterGitHubGateway {
	private readonly changedFilesByPr: Map<number, PRChangedFile[]>;
	private readonly reviewCommentsByPr: Map<number, PRReviewComment[]>;
	private readonly reviewThreadsByPr: Map<number, GithubPrReviewThread[]>;
	private readonly discussionCommentsByPr: Map<number, FakeDiscussionComment[]>;
	private readonly createdReviewsInternal: CreatedReviewLogEntry[] = [];
	private readonly markerCallsInternal: FindPrDiscussionCommentByMarkerOptions[] = [];
	private readonly reviewThreadCallsInternal: Array<
		GitHubGatewayOptions & { readonly prNumber: number }
	> = [];
	private nextDiscussionCommentId: number;

	constructor(options: FakeRoasterGitHubGatewayOptions = {}) {
		this.changedFilesByPr = copyMapArray(options.changedFilesByPr, copyChangedFile);
		this.reviewCommentsByPr = copyMapArray(options.reviewCommentsByPr, copyReviewComment);
		this.reviewThreadsByPr = copyMapArray(options.reviewThreadsByPr, copyReviewThread);
		this.discussionCommentsByPr = copyMapArray(
			options.discussionCommentsByPr,
			copyFakeDiscussionComment,
		);
		this.nextDiscussionCommentId = nextDiscussionCommentId(this.discussionCommentsByPr);
	}

	async getPrChangedFiles(
		prNumber: number,
		_options: GitHubGatewayOptions,
	): Promise<RoasterResult<readonly PRChangedFile[]>> {
		return {
			type: "ok",
			value: (this.changedFilesByPr.get(prNumber) ?? []).map(copyChangedFile),
		};
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
		this.createdReviewsInternal.push({
			prNumber,
			comments: comments.map(copyInlineCommentInput),
		});
		return { type: "ok", value: undefined };
	}

	async findPrDiscussionCommentByMarker(
		options: FindPrDiscussionCommentByMarkerOptions,
	): Promise<RoasterResult<PRDiscussionComment | null>> {
		this.markerCallsInternal.push(copyFindPrDiscussionCommentByMarkerOptions(options));
		const comment =
			(this.discussionCommentsByPr.get(options.prNumber) ?? []).find(
				(candidate) =>
					candidate.author === options.authorLogin && candidate.body.includes(options.marker),
			) ?? null;
		return { type: "ok", value: comment === null ? null : publicDiscussionComment(comment) };
	}

	async addPrDiscussionComment(
		prNumber: number,
		body: string,
		_options: GitHubGatewayOptions,
	): Promise<RoasterResult<PRDiscussionComment>> {
		const comment: FakeDiscussionComment = {
			id: this.nextDiscussionCommentId,
			body,
			author: ROASTER_BOT_LOGIN,
		};
		this.nextDiscussionCommentId += 1;
		const comments = this.discussionCommentsByPr.get(prNumber) ?? [];
		comments.push(comment);
		this.discussionCommentsByPr.set(prNumber, comments);
		return { type: "ok", value: publicDiscussionComment(comment) };
	}

	async updatePrDiscussionComment(
		commentId: number,
		body: string,
		_options: GitHubGatewayOptions,
	): Promise<RoasterResult<PRDiscussionComment>> {
		for (const [prNumber, comments] of this.discussionCommentsByPr.entries()) {
			const index = comments.findIndex((comment) => comment.id === commentId);
			const existing = comments[index];
			if (index === -1 || existing === undefined) continue;
			const updated = { ...existing, body };
			comments[index] = updated;
			this.discussionCommentsByPr.set(prNumber, comments);
			return { type: "ok", value: publicDiscussionComment(updated) };
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

async function unwrapFeedback<T>(
	promise: Promise<Result<T, GithubPrFeedbackFailure>>,
	cwd: string | undefined,
): Promise<RoasterResult<T>> {
	const result = await promise;
	if (!result.ok) return error(convertFeedbackFailure(result.error, cwd));
	return { type: "ok", value: result.value };
}

function mapRoasterValue<TValue, TMapped>(
	result: RoasterResult<TValue>,
	mapValue: (value: TValue) => TMapped,
): RoasterResult<TMapped> {
	if (result.type === "error") return result;
	return { type: "ok", value: mapValue(result.value) };
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

function copyReviewComment(comment: PRReviewComment): PRReviewComment {
	return { author: comment.author, body: comment.body };
}

function copyFakeDiscussionComment(comment: FakeDiscussionComment): FakeDiscussionComment {
	return { id: comment.id, body: comment.body, author: comment.author };
}

function copyMapArray<TKey, TValue>(
	source: ReadonlyMap<TKey, readonly TValue[]> | undefined,
	copy: (value: TValue) => TValue,
): Map<TKey, TValue[]> {
	const copied = new Map<TKey, TValue[]>();
	if (source === undefined) return copied;
	for (const [key, values] of source.entries()) copied.set(key, values.map(copy));
	return copied;
}

function nextDiscussionCommentId(
	commentsByPr: ReadonlyMap<number, readonly FakeDiscussionComment[]>,
): number {
	let maxId = 0;
	for (const comments of commentsByPr.values()) {
		for (const comment of comments) maxId = Math.max(maxId, comment.id);
	}
	return maxId + 1;
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
