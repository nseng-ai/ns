import type { CommandExecApi } from "@ns/core/command";
import { execApiToCommandRunner } from "@ns/core/command";
import {
	RealGithubPrFeedbackGateway,
	type GithubPrFeedbackFailure,
} from "@ns/capability-kit/github/pr-feedback";
import { resultErr, resultOk, type Result } from "@ns/core/result";

import type {
	PriorFindingsContextGithubGateway,
	PriorFindingsDiscussionComment,
	PriorFindingsGatewayFailure,
	PriorFindingsGatewayOperation,
	PriorFindingsPrOptions,
	PriorFindingsReviewThread,
} from "../core/prior-findings-context.ts";

export class RealPriorFindingsContextGithubGateway implements PriorFindingsContextGithubGateway {
	private readonly feedback: RealGithubPrFeedbackGateway;

	constructor(execApi: CommandExecApi) {
		this.feedback = new RealGithubPrFeedbackGateway(execApiToCommandRunner(execApi));
	}

	async getPrDiscussionComments(
		options: PriorFindingsPrOptions,
	): Promise<Result<readonly PriorFindingsDiscussionComment[], PriorFindingsGatewayFailure>> {
		const result = await this.feedback.getPrDiscussionComments(options);
		if (!result.ok)
			return resultErr(convertFailure(result.error, "getPrDiscussionComments", options));
		return resultOk(
			result.value.map((comment) => ({
				id: comment.id,
				body: comment.body,
				author: comment.author,
			})),
		);
	}

	async getPrReviewThreads(
		options: PriorFindingsPrOptions,
	): Promise<Result<readonly PriorFindingsReviewThread[], PriorFindingsGatewayFailure>> {
		const result = await this.feedback.getPrReviewThreads(options);
		if (!result.ok) return resultErr(convertFailure(result.error, "getPrReviewThreads", options));
		return resultOk(
			result.value.map((thread) => ({
				id: thread.id,
				isResolved: thread.isResolved,
				isOutdated: thread.isOutdated,
				comments: thread.comments.map((comment) => ({ body: comment.body })),
			})),
		);
	}
}

function convertFailure(
	failure: GithubPrFeedbackFailure,
	operation: PriorFindingsGatewayOperation,
	options: PriorFindingsPrOptions,
): PriorFindingsGatewayFailure {
	const displayCommand = failure.displayCommand ?? failure.details?.displayCommand;
	return {
		code: failure.code,
		message: failure.message,
		details: {
			operation,
			prNumber: options.prNumber,
			...(displayCommand === undefined ? {} : { displayCommand }),
		},
		...(displayCommand === undefined ? {} : { displayCommand }),
	};
}
