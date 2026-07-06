import type { Result } from "@nseng-ai/foundation/result";

import type {
	GithubBranchPrChecksOutcome,
	GithubPrChangedFile,
	GithubPrDiscussionComment,
	GithubPrDiscussionCommentUpsert,
	GithubPrFeedbackFailure,
	GithubPrFeedbackOptions,
	GithubPrInlineCommentInput,
	GithubPrLookupOutcome,
	GithubPrReview,
	GithubPrReviewCommentSummary,
	GithubPrReviewThread,
	GithubPrSummary,
	GithubReviewThreadReply,
	GithubReviewThreadState,
} from "./types.ts";
import type { GithubStatusChecks } from "../pr-status.ts";

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
	getBranchPrChecks(
		params: GithubPrFeedbackOptions & { readonly branches: readonly string[] },
	): Promise<Result<readonly GithubBranchPrChecksOutcome[], GithubPrFeedbackFailure>>;
	replyToReviewThread(
		params: GithubPrFeedbackOptions & { readonly threadId: string; readonly body: string },
	): Promise<Result<GithubReviewThreadReply, GithubPrFeedbackFailure>>;
	resolveReviewThread(
		params: GithubPrFeedbackOptions & { readonly threadId: string },
	): Promise<Result<GithubReviewThreadState, GithubPrFeedbackFailure>>;
	resolveReviewThreads?(
		params: GithubPrFeedbackOptions & { readonly threadIds: readonly string[] },
	): Promise<Result<readonly GithubReviewThreadState[], GithubPrFeedbackFailure>>;
	getPrChangedFiles(
		params: GithubPrFeedbackOptions & { readonly prNumber: number },
	): Promise<Result<readonly GithubPrChangedFile[], GithubPrFeedbackFailure>>;
	getPrReviewComments(
		params: GithubPrFeedbackOptions & { readonly prNumber: number },
	): Promise<Result<readonly GithubPrReviewCommentSummary[], GithubPrFeedbackFailure>>;
	createPrReview(
		params: GithubPrFeedbackOptions & {
			readonly prNumber: number;
			readonly comments: readonly GithubPrInlineCommentInput[];
		},
	): Promise<Result<void, GithubPrFeedbackFailure>>;
	findPrDiscussionCommentByMarker(
		params: GithubPrFeedbackOptions & {
			readonly prNumber: number;
			readonly marker: string;
			readonly authorLogin: string;
		},
	): Promise<Result<GithubPrDiscussionComment | null, GithubPrFeedbackFailure>>;
	addPrDiscussionComment(
		params: GithubPrFeedbackOptions & { readonly prNumber: number; readonly body: string },
	): Promise<Result<GithubPrDiscussionComment, GithubPrFeedbackFailure>>;
	updatePrDiscussionComment(
		params: GithubPrFeedbackOptions & { readonly commentId: number; readonly body: string },
	): Promise<Result<GithubPrDiscussionComment, GithubPrFeedbackFailure>>;
	upsertPrDiscussionCommentByMarker(
		params: GithubPrFeedbackOptions & {
			readonly prNumber: number;
			readonly marker: string;
			readonly authorLogin: string;
			readonly body: string;
		},
	): Promise<Result<GithubPrDiscussionCommentUpsert, GithubPrFeedbackFailure>>;
}
