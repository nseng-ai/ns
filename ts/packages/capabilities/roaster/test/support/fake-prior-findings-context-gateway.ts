import { resultErr, resultOk, type Result } from "@ns/core/result";

import type {
	PriorFindingsContextGithubGateway,
	PriorFindingsDiscussionComment,
	PriorFindingsGatewayFailure,
	PriorFindingsPrOptions,
	PriorFindingsReviewThread,
} from "../../src/core/prior-findings-context.ts";

export interface FakePriorFindingsContextGithubGatewayOptions {
	readonly discussionComments?: readonly PriorFindingsDiscussionComment[];
	readonly reviewThreads?: readonly PriorFindingsReviewThread[];
	readonly discussionCommentsFailure?: PriorFindingsGatewayFailure;
	readonly reviewThreadsFailure?: PriorFindingsGatewayFailure;
}

export class FakePriorFindingsContextGithubGateway implements PriorFindingsContextGithubGateway {
	private readonly discussionComments: readonly PriorFindingsDiscussionComment[];
	private readonly reviewThreads: readonly PriorFindingsReviewThread[];
	private readonly discussionCommentsFailure: PriorFindingsGatewayFailure | undefined;
	private readonly reviewThreadsFailure: PriorFindingsGatewayFailure | undefined;
	private readonly callsInternal: string[] = [];
	private readonly discussionCommentCallsInternal: PriorFindingsPrOptions[] = [];
	private readonly reviewThreadCallsInternal: PriorFindingsPrOptions[] = [];

	constructor(options: FakePriorFindingsContextGithubGatewayOptions = {}) {
		this.discussionComments = (options.discussionComments ?? []).map(copyDiscussionComment);
		this.reviewThreads = (options.reviewThreads ?? []).map(copyReviewThread);
		this.discussionCommentsFailure = options.discussionCommentsFailure;
		this.reviewThreadsFailure = options.reviewThreadsFailure;
	}

	async getPrDiscussionComments(
		options: PriorFindingsPrOptions,
	): Promise<Result<readonly PriorFindingsDiscussionComment[], PriorFindingsGatewayFailure>> {
		this.callsInternal.push("getPrDiscussionComments");
		this.discussionCommentCallsInternal.push(copyPriorFindingsPrOptions(options));
		if (this.discussionCommentsFailure !== undefined)
			return resultErr(this.discussionCommentsFailure);
		return resultOk(this.discussionComments.map(copyDiscussionComment));
	}

	async getPrReviewThreads(
		options: PriorFindingsPrOptions,
	): Promise<Result<readonly PriorFindingsReviewThread[], PriorFindingsGatewayFailure>> {
		this.callsInternal.push("getPrReviewThreads");
		this.reviewThreadCallsInternal.push(copyPriorFindingsPrOptions(options));
		if (this.reviewThreadsFailure !== undefined) return resultErr(this.reviewThreadsFailure);
		return resultOk(this.reviewThreads.map(copyReviewThread));
	}

	calls(): readonly string[] {
		return [...this.callsInternal];
	}

	get discussionCommentCalls(): readonly PriorFindingsPrOptions[] {
		return this.discussionCommentCallsInternal.map(copyPriorFindingsPrOptions);
	}

	get reviewThreadCalls(): readonly PriorFindingsPrOptions[] {
		return this.reviewThreadCallsInternal.map(copyPriorFindingsPrOptions);
	}
}

function copyPriorFindingsPrOptions(options: PriorFindingsPrOptions): PriorFindingsPrOptions {
	return {
		cwd: options.cwd,
		prNumber: options.prNumber,
		...(options.env === undefined ? {} : { env: options.env }),
		...(options.signal === undefined ? {} : { signal: options.signal }),
	};
}

function copyDiscussionComment(
	comment: PriorFindingsDiscussionComment,
): PriorFindingsDiscussionComment {
	return { id: comment.id, author: comment.author, body: comment.body };
}

function copyReviewThread(thread: PriorFindingsReviewThread): PriorFindingsReviewThread {
	return {
		id: thread.id,
		isResolved: thread.isResolved,
		isOutdated: thread.isOutdated,
		comments: thread.comments.map((comment) => ({ body: comment.body })),
	};
}
