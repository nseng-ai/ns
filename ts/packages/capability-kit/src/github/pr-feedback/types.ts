import type { ExplicitUndefined } from "@nseng-ai/foundation/primitives";
import type { ErrorInfo } from "@nseng-ai/foundation/result";

import type { GithubStatusChecks } from "../pr-status.ts";

export interface GithubPrFeedbackOptions {
	readonly cwd: string;
	readonly env?: ExplicitUndefined<"env-map", NodeJS.ProcessEnv>;
	readonly signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
}

export interface GithubPrSummary {
	readonly number: number;
	readonly title: string;
	readonly url: string;
	readonly headRefName: string;
	readonly baseRefName: string;
	readonly state: string;
	readonly headRefOid?: string | null;
}

export interface GithubPrReview {
	readonly id: string;
	readonly author: string;
	readonly body: string;
	readonly state: string;
	readonly submittedAt: string | null;
}

export interface GithubPrReviewComment {
	readonly id: number;
	readonly body: string;
	readonly author: string;
	readonly path: string;
	readonly line: number | null;
	readonly startLine: number | null;
	readonly createdAt: string;
	readonly url?: string;
}

export interface GithubPrReviewThread {
	readonly id: string;
	readonly path: string;
	readonly line: number | null;
	readonly startLine: number | null;
	readonly isResolved: boolean;
	readonly isOutdated: boolean;
	readonly comments: readonly GithubPrReviewComment[];
}

export interface GithubPrDiscussionComment {
	readonly id: number;
	readonly body: string;
	readonly author: string;
	readonly url: string;
}

export interface GithubReviewThreadReply {
	readonly threadId: string;
	readonly comment: GithubPrReviewComment;
}

export interface GithubReviewThreadState {
	readonly threadId: string;
	readonly isResolved: boolean;
}

export type GithubBranchPrChecksOutcome =
	| {
			readonly branch: string;
			readonly type: "found";
			readonly pr: GithubPrSummary;
			readonly checks: GithubStatusChecks;
	  }
	| { readonly branch: string; readonly type: "missing" }
	| {
			readonly branch: string;
			readonly type: "ambiguous";
			readonly candidates: readonly GithubPrSummary[];
	  };

export const githubPrFeedbackFailureCodes = [
	"github_pr_feedback_gh_failed",
	"github_pr_feedback_startup_failed",
	"github_pr_feedback_json_parse_failed",
	"github_pr_feedback_response_invalid",
	"github_pr_feedback_graphql_failed",
	"github_pr_feedback_pagination_invalid",
] as const;

export type GithubPrFeedbackFailureCode = (typeof githubPrFeedbackFailureCodes)[number];

export const githubPrFeedbackOperations = [
	"getPr",
	"getPrForBranch",
	"listOpenPrs",
	"getPrReviews",
	"getPrReviewThreads",
	"getPrDiscussionComments",
	"getPrChecks",
	"getBranchPrChecks",
	"replyToReviewThread",
	"resolveReviewThread",
	"resolveReviewThreads",
] as const;

export type GithubPrFeedbackOperation = (typeof githubPrFeedbackOperations)[number];

export interface GithubPrFeedbackCursorContextFields {
	readonly prNumber?: number;
	readonly threadId?: string;
	readonly cursorContext?: string;
}

export interface GithubPrFeedbackRequiredCursorContextFields extends Omit<
	GithubPrFeedbackCursorContextFields,
	"cursorContext"
> {
	readonly cursorContext: string;
}

export interface GithubPrFeedbackFailureDetails extends GithubPrFeedbackCursorContextFields {
	readonly operation: GithubPrFeedbackOperation;
	readonly command?: readonly string[];
	readonly displayCommand?: string;
	readonly stdout?: string;
	readonly stderr?: string;
	readonly exitCode?: number;
	readonly killed?: boolean;
	readonly graphqlErrors?: unknown;
	readonly zodError?: string;
}

export interface GithubPrFeedbackFailure extends ErrorInfo<GithubPrFeedbackFailureDetails> {
	readonly code: GithubPrFeedbackFailureCode;
	readonly details?: GithubPrFeedbackFailureDetails;
}

export interface GithubPrLookupMiss {
	readonly stderr: string;
	readonly exitCode: number;
}

export type GithubPrLookupOutcome =
	| { readonly found: true; readonly pr: GithubPrSummary }
	| { readonly found: false; readonly miss: GithubPrLookupMiss };
