import type { ErrorInfo, Result } from "../result.ts";

export interface GithubPrFeedbackOptions {
	readonly cwd: string;
	readonly env?: NodeJS.ProcessEnv | undefined;
	readonly signal?: AbortSignal | undefined;
}

export interface GithubPrSummary {
	readonly number: number;
	readonly title: string;
	readonly url: string;
	readonly headRefName: string;
	readonly baseRefName: string;
	readonly state: string;
	readonly headRefOid?: string | null | undefined;
}

export interface GithubPrReview {
	readonly id: string;
	readonly author: string;
	readonly body: string;
	readonly state: string;
	readonly submittedAt: string;
}

export interface GithubPrReviewComment {
	readonly id: number;
	readonly body: string;
	readonly author: string;
	readonly path: string;
	readonly line: number | null;
	readonly startLine: number | null;
	readonly createdAt: string;
	readonly url?: string | undefined;
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

export type GithubPrFeedbackFailureCode =
	| "github_pr_feedback_gh_failed"
	| "github_pr_feedback_startup_failed"
	| "github_pr_feedback_json_parse_failed"
	| "github_pr_feedback_response_invalid"
	| "github_pr_feedback_graphql_failed"
	| "github_pr_feedback_pagination_invalid";

export interface GithubPrFeedbackFailure extends ErrorInfo {
	readonly code: GithubPrFeedbackFailureCode;
}

export type GithubPrFeedbackOperation =
	| "getPr"
	| "getPrForBranch"
	| "listOpenPrs"
	| "getPrReviews"
	| "getPrReviewThreads"
	| "getPrDiscussionComments"
	| "replyToReviewThread"
	| "resolveReviewThread";

export type GithubPrLookupResult =
	| { readonly type: "found"; readonly pr: GithubPrSummary }
	| { readonly type: "miss"; readonly stderr: string; readonly exitCode: number }
	| { readonly type: "failure"; readonly failure: GithubPrFeedbackFailure };

export interface GithubPrFeedbackGateway {
	getPr(
		params: GithubPrFeedbackOptions & { readonly prNumber: number },
	): Promise<GithubPrLookupResult>;
	getPrForBranch(
		params: GithubPrFeedbackOptions & { readonly branch: string },
	): Promise<GithubPrLookupResult>;
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
	replyToReviewThread(
		params: GithubPrFeedbackOptions & { readonly threadId: string; readonly body: string },
	): Promise<Result<GithubReviewThreadReply, GithubPrFeedbackFailure>>;
	resolveReviewThread(
		params: GithubPrFeedbackOptions & { readonly threadId: string },
	): Promise<Result<GithubReviewThreadState, GithubPrFeedbackFailure>>;
}
