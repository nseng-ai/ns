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

export type GithubPrFeedbackOperation =
	| "getPr"
	| "getPrForBranch"
	| "listOpenPrs"
	| "getPrReviews"
	| "getPrReviewThreads"
	| "getPrDiscussionComments"
	| "replyToReviewThread"
	| "resolveReviewThread";

export interface GithubPrFeedbackFailureDetails {
	readonly operation: GithubPrFeedbackOperation;
	readonly command?: readonly string[] | undefined;
	readonly displayCommand?: string | undefined;
	readonly stdout?: string | undefined;
	readonly stderr?: string | undefined;
	readonly exitCode?: number | undefined;
	readonly killed?: boolean | undefined;
	readonly graphqlErrors?: unknown;
	readonly zodError?: string | undefined;
	readonly prNumber?: number | undefined;
	readonly threadId?: string | undefined;
	readonly cursorContext?: string | undefined;
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
	replyToReviewThread(
		params: GithubPrFeedbackOptions & { readonly threadId: string; readonly body: string },
	): Promise<Result<GithubReviewThreadReply, GithubPrFeedbackFailure>>;
	resolveReviewThread(
		params: GithubPrFeedbackOptions & { readonly threadId: string },
	): Promise<Result<GithubReviewThreadState, GithubPrFeedbackFailure>>;
}
