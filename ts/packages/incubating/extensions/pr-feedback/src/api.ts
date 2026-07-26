// Extension API (`@nseng-ai/pr-feedback/api`): the curated, in-process surface for
// PR-feedback consumers. The gateway seam and feedback/check payload vocabulary are
// stable here so consumers do not import `@nseng-ai/extension-kit/github/pr-feedback`, Pi modules,
// command operation schemas, or PR Address internals.
//
// Export classification:
// - Stable PR Address Extension API: `PrAddressGithubGateway`, PR lookup/review/
//   discussion/review-thread DTOs, review-thread mutation DTOs, feedback failure
//   types, and gateway options/operation names.
// - Stable via the PR Address seam: check/status result DTOs returned by
//   `getPrChecks`. Their neutral normalization mechanics stay in
//   `@nseng-ai/extension-kit/github/pr-status`; consumers should import these DTOs here when they
//   are handling PR Address check payloads.
// - Not exported here: real GitHub adapters, GraphQL args/queries/normalizers,
//   command schemas, Clinkr/exec wrappers, and Pi presentation/session helpers.
//
// ADR 0004 keeps PR Address as the extension-facing seam. Reusable GitHub
// backend mechanics now live in `@nseng-ai/extension-kit/github`; this file owns the seam vocabulary
// by re-exporting only the consumer-facing types.

import type {
	GithubBranchPrChecksOutcome,
	GithubPrDiscussionComment,
	GithubPrFeedbackFailure,
	GithubPrFeedbackGateway,
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
} from "@nseng-ai/extension-kit/github/pr-feedback";
import type {
	GithubCheckBucket,
	GithubCheckTally,
	GithubStatusCheckEntry,
	GithubStatusCheckKind,
	GithubStatusChecks,
} from "@nseng-ai/extension-kit/github/pr-status";
import type { GitGateway } from "@nseng-ai/foundation/git";

// Stable PR Address Extension API: PR feedback domain seam and payloads.
export type {
	GithubBranchPrChecksOutcome,
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

// Stable only through the PR Address Extension API when consumers handle
// `getPrChecks` payloads. Generic status rollup mechanics remain lower infra.
export type {
	GithubCheckBucket,
	GithubCheckTally,
	GithubStatusCheckEntry,
	GithubStatusCheckKind,
	GithubStatusChecks,
};

// The extension's gateway seam is a projection of the kit's canonical
// `GithubPrFeedbackGateway` contract: the methods PR Address consumes, with the
// bulk `resolveReviewThreads` optional so gateways without batch support fall
// back to per-thread resolution.
// The extension's git seam: the `GitGateway` methods PR Address consumes to
// resolve the target PR (current branch) and guard that operations run inside a
// work tree. A full `GitGateway` is assignable to this narrowed surface.
export type PrAddressGitGateway = Pick<GitGateway, "currentBranch" | "isInsideWorkTree">;

export type PrAddressGithubGateway = Pick<
	GithubPrFeedbackGateway,
	| "getPr"
	| "getPrForBranch"
	| "listOpenPrs"
	| "getPrReviews"
	| "getPrReviewThreads"
	| "getPrDiscussionComments"
	| "getPrChecks"
	| "getBranchPrChecks"
	| "replyToReviewThread"
	| "resolveReviewThread"
> &
	Partial<Pick<GithubPrFeedbackGateway, "resolveReviewThreads">>;
