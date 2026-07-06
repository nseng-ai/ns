import { optionalEntries } from "@nseng-ai/foundation/primitives";
import { resultErr, resultOk, type Result } from "@nseng-ai/foundation/result";

import {
	findPrDiscussionCommentByMarkerInComments,
	upsertPrDiscussionCommentByMarkerWithCallbacks,
	type GithubPrChangedFile,
	type GithubPrDiscussionComment,
	type GithubPrDiscussionCommentUpsert,
	type GithubPrFeedbackFailure,
	type GithubPrInlineCommentInput,
	type GithubPrRestReviewComment,
	type GithubPrReviewThread,
} from "./pr-feedback/index.ts";

export interface GithubCheckRunFixture {
	readonly workflowName: string;
	readonly name: string;
	readonly status: string;
	readonly conclusion?: string;
	readonly startedAt?: string;
	readonly completedAt?: string;
}

export function githubCheckRun(fixture: GithubCheckRunFixture): unknown {
	return {
		__typename: "CheckRun",
		name: fixture.name,
		status: fixture.status,
		...optionalEntries({
			conclusion: fixture.conclusion,
			startedAt: fixture.startedAt,
			completedAt: fixture.completedAt,
		}),
		checkSuite: { workflowRun: { workflow: { name: fixture.workflowName } } },
	};
}

export interface FakeGithubPrFeedbackGatewayOptions {
	readonly changedFilesByPr?: ReadonlyMap<number, readonly GithubPrChangedFile[]>;
	readonly reviewCommentsByPr?: ReadonlyMap<number, readonly GithubPrRestReviewComment[]>;
	readonly reviewThreadsByPr?: ReadonlyMap<number, readonly GithubPrReviewThread[]>;
	readonly discussionCommentsByPr?: ReadonlyMap<number, readonly GithubPrDiscussionComment[]>;
	readonly nextCommentId?: number;
	readonly failure?: GithubPrFeedbackFailure;
}

export interface CreatedGithubPrReviewLogEntry {
	readonly prNumber: number;
	readonly comments: readonly GithubPrInlineCommentInput[];
}

export class FakeGithubPrFeedbackGateway {
	private readonly changedFilesByPr: Map<number, GithubPrChangedFile[]>;
	private readonly reviewCommentsByPr: Map<number, GithubPrRestReviewComment[]>;
	private readonly reviewThreadsByPr: Map<number, GithubPrReviewThread[]>;
	private readonly discussionCommentsByPr: Map<number, GithubPrDiscussionComment[]>;
	private readonly createdReviewsInternal: CreatedGithubPrReviewLogEntry[] = [];
	private readonly failure: GithubPrFeedbackFailure | undefined;
	private nextCommentId: number;

	constructor(options: FakeGithubPrFeedbackGatewayOptions = {}) {
		this.changedFilesByPr = copyMapArray(options.changedFilesByPr, copyChangedFile);
		this.reviewCommentsByPr = copyMapArray(options.reviewCommentsByPr, copyReviewComment);
		this.reviewThreadsByPr = copyMapArray(options.reviewThreadsByPr, copyReviewThread);
		this.discussionCommentsByPr = copyMapArray(
			options.discussionCommentsByPr,
			copyDiscussionComment,
		);
		this.failure = options.failure;
		this.nextCommentId = options.nextCommentId ?? 1;
	}

	async getPrChangedFiles(params: {
		readonly prNumber: number;
	}): Promise<Result<readonly GithubPrChangedFile[], GithubPrFeedbackFailure>> {
		if (this.failure !== undefined) return resultErr(this.failure);
		return resultOk((this.changedFilesByPr.get(params.prNumber) ?? []).map(copyChangedFile));
	}

	async getPrReviewComments(params: {
		readonly prNumber: number;
	}): Promise<Result<readonly GithubPrRestReviewComment[], GithubPrFeedbackFailure>> {
		if (this.failure !== undefined) return resultErr(this.failure);
		return resultOk((this.reviewCommentsByPr.get(params.prNumber) ?? []).map(copyReviewComment));
	}

	async getPrReviewThreads(params: {
		readonly prNumber: number;
	}): Promise<Result<readonly GithubPrReviewThread[], GithubPrFeedbackFailure>> {
		if (this.failure !== undefined) return resultErr(this.failure);
		return resultOk((this.reviewThreadsByPr.get(params.prNumber) ?? []).map(copyReviewThread));
	}

	async createPrReview(params: {
		readonly prNumber: number;
		readonly comments: readonly GithubPrInlineCommentInput[];
	}): Promise<Result<void, GithubPrFeedbackFailure>> {
		if (this.failure !== undefined) return resultErr(this.failure);
		this.createdReviewsInternal.push({
			prNumber: params.prNumber,
			comments: params.comments.map(copyInlineCommentInput),
		});
		return resultOk(undefined);
	}

	async getPrIssueComments(params: {
		readonly prNumber: number;
	}): Promise<Result<readonly GithubPrDiscussionComment[], GithubPrFeedbackFailure>> {
		if (this.failure !== undefined) return resultErr(this.failure);
		return resultOk(
			(this.discussionCommentsByPr.get(params.prNumber) ?? []).map(copyDiscussionComment),
		);
	}

	async findPrDiscussionCommentByMarker(params: {
		readonly prNumber: number;
		readonly marker: string;
		readonly authorLogin: string;
	}): Promise<Result<GithubPrDiscussionComment | null, GithubPrFeedbackFailure>> {
		const comments = await this.getPrIssueComments(params);
		if (!comments.ok) return comments;
		return resultOk(
			findPrDiscussionCommentByMarkerInComments({
				comments: comments.value,
				marker: params.marker,
				authorLogin: params.authorLogin,
			}),
		);
	}

	async addPrDiscussionComment(params: {
		readonly prNumber: number;
		readonly body: string;
		readonly authorLogin?: string;
	}): Promise<Result<GithubPrDiscussionComment, GithubPrFeedbackFailure>> {
		if (this.failure !== undefined) return resultErr(this.failure);
		const comment: GithubPrDiscussionComment = {
			id: this.nextCommentId,
			body: params.body,
			author: params.authorLogin ?? "github-actions[bot]",
			url: "",
		};
		this.nextCommentId += 1;
		const comments = this.discussionCommentsByPr.get(params.prNumber) ?? [];
		comments.push(comment);
		this.discussionCommentsByPr.set(params.prNumber, comments);
		return resultOk(copyDiscussionComment(comment));
	}

	async updatePrDiscussionComment(params: {
		readonly commentId: number;
		readonly body: string;
	}): Promise<Result<GithubPrDiscussionComment, GithubPrFeedbackFailure>> {
		if (this.failure !== undefined) return resultErr(this.failure);
		for (const [prNumber, comments] of this.discussionCommentsByPr.entries()) {
			const index = comments.findIndex((comment) => comment.id === params.commentId);
			const existing = comments[index];
			if (index === -1 || existing === undefined) continue;
			const updated = { ...existing, body: params.body };
			comments[index] = updated;
			this.discussionCommentsByPr.set(prNumber, comments);
			return resultOk(copyDiscussionComment(updated));
		}
		return resultErr(fakeInvalidFailure(`No fake discussion comment with id ${params.commentId}.`));
	}

	async upsertPrDiscussionCommentByMarker(params: {
		readonly prNumber: number;
		readonly marker: string;
		readonly authorLogin: string;
		readonly body: string;
	}): Promise<Result<GithubPrDiscussionCommentUpsert, GithubPrFeedbackFailure>> {
		return await upsertPrDiscussionCommentByMarkerWithCallbacks({
			find: () => this.findPrDiscussionCommentByMarker(params),
			add: () =>
				this.addPrDiscussionComment({
					...params,
					authorLogin: params.authorLogin,
				}),
			update: (comment) =>
				this.updatePrDiscussionComment({
					commentId: comment.id,
					body: params.body,
				}),
		});
	}

	createdReviews(): readonly CreatedGithubPrReviewLogEntry[] {
		return this.createdReviewsInternal.map((entry) => ({
			prNumber: entry.prNumber,
			comments: entry.comments.map(copyInlineCommentInput),
		}));
	}
}

function fakeInvalidFailure(message: string): GithubPrFeedbackFailure {
	return {
		code: "github_pr_feedback_response_invalid",
		message,
		details: { operation: "updatePrDiscussionComment" },
	};
}

function copyChangedFile(file: GithubPrChangedFile): GithubPrChangedFile {
	return { path: file.path, status: file.status, patch: file.patch };
}

function copyReviewComment(comment: GithubPrRestReviewComment): GithubPrRestReviewComment {
	return { ...comment };
}

function copyDiscussionComment(comment: GithubPrDiscussionComment): GithubPrDiscussionComment {
	return {
		id: comment.id,
		body: comment.body,
		author: comment.author,
		url: comment.url,
		...(comment.createdAt === undefined ? {} : { createdAt: comment.createdAt }),
		...(comment.updatedAt === undefined ? {} : { updatedAt: comment.updatedAt }),
	};
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

function copyInlineCommentInput(comment: GithubPrInlineCommentInput): GithubPrInlineCommentInput {
	return { path: comment.path, line: comment.line, body: comment.body };
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
