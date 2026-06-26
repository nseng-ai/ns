import type {
	GithubPrDiscussionComment,
	GithubPrFeedbackFailure,
	GithubPrFeedbackFailureCode,
	GithubPrFeedbackFailureDetails,
	GithubPrFeedbackOperation,
	GithubPrFeedbackOptions,
	GithubPrLookupMiss,
	GithubPrLookupOutcome,
	GithubPrReview,
	GithubPrReviewComment,
	GithubPrReviewThread,
	GithubPrSummary,
	GithubReviewThreadReply,
	GithubReviewThreadState,
} from "@sdl/core/github-pr-feedback";
import type {
	GithubCheckBucket,
	GithubCheckTally,
	GithubStatusCheckEntry,
	GithubStatusCheckKind,
	GithubStatusChecks,
} from "@sdl/core/github-pr-status";
import type { Result } from "@sdl/core/result";

// The PR-feedback gateway seam is owned by the @sdl/pr-address capability package.
// PR-feedback domain DTOs and the lower status-rollup result types are declared in
// @sdl/core and re-exported here so seam consumers import only from @sdl/pr-address/api.
export type {
	GithubCheckBucket,
	GithubCheckTally,
	GithubPrDiscussionComment,
	GithubPrFeedbackFailure,
	GithubPrFeedbackFailureCode,
	GithubPrFeedbackFailureDetails,
	GithubPrFeedbackOperation,
	GithubPrFeedbackOptions,
	GithubPrLookupMiss,
	GithubPrLookupOutcome,
	GithubPrReview,
	GithubPrReviewComment,
	GithubPrReviewThread,
	GithubPrSummary,
	GithubReviewThreadReply,
	GithubReviewThreadState,
	GithubStatusCheckEntry,
	GithubStatusCheckKind,
	GithubStatusChecks,
};

export interface GithubPrFeedbackGateway {
	getPr(
		params: GithubPrFeedbackOptions & { readonly prNumber: number },
	): Promise<Result<GithubPrLookupOutcome, GithubPrFeedbackFailure>>;
	getPrForBranch(
		params: GithubPrFeedbackOptions & { readonly branch: string },
	): Promise<Result<GithubPrLookupOutcome, GithubPrFeedbackFailure>>;
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
	getPrChecks(
		params: GithubPrFeedbackOptions & { readonly prNumber: number },
	): Promise<Result<GithubStatusChecks, GithubPrFeedbackFailure>>;
	replyToReviewThread(
		params: GithubPrFeedbackOptions & { readonly threadId: string; readonly body: string },
	): Promise<Result<GithubReviewThreadReply, GithubPrFeedbackFailure>>;
	resolveReviewThread(
		params: GithubPrFeedbackOptions & { readonly threadId: string },
	): Promise<Result<GithubReviewThreadState, GithubPrFeedbackFailure>>;
}
