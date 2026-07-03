// Capability API (`@ji/address/api`): the curated, in-process surface for
// PR-feedback consumers. The gateway seam and feedback/check payload vocabulary are
// stable here so consumers do not import `@ji/capability-kit/github/pr-feedback`, Pi modules,
// command operation schemas, or PR Address internals.
//
// Export classification:
// - Stable PR Address Capability API: `GithubPrFeedbackGateway`, PR lookup/review/
//   discussion/review-thread DTOs, review-thread mutation DTOs, feedback failure
//   types, and gateway options/operation names.
// - Stable via the PR Address seam: check/status result DTOs returned by
//   `getPrChecks`. Their neutral normalization mechanics stay in
//   `@ji/capability-kit/github/pr-status`; consumers should import these DTOs here when they
//   are handling PR Address check payloads.
// - Not exported here: real GitHub adapters, GraphQL args/queries/normalizers,
//   command schemas, Clinkr/exec wrappers, and Pi presentation/session helpers.
//
// ADR 0016 keeps PR Address as the capability-facing seam. Reusable GitHub
// backend mechanics now live in `@ji/capability-kit/github`; this file owns the seam vocabulary
// by re-exporting only the consumer-facing types.

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
} from "@ji/capability-kit/github/pr-feedback";
import type {
	GithubCheckBucket,
	GithubCheckTally,
	GithubStatusCheckEntry,
	GithubStatusCheckKind,
	GithubStatusChecks,
} from "@ji/capability-kit/github/pr-status";
import type { Result } from "@ji/core/result";

// Stable PR Address Capability API: PR feedback domain seam and payloads.
export type {
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
};

// Stable only through the PR Address Capability API when consumers handle
// `getPrChecks` payloads. Generic status rollup mechanics remain lower infra.
export type {
	GithubCheckBucket,
	GithubCheckTally,
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
	resolveReviewThreads?(
		params: GithubPrFeedbackOptions & { readonly threadIds: readonly string[] },
	): Promise<Result<readonly GithubReviewThreadState[], GithubPrFeedbackFailure>>;
}
