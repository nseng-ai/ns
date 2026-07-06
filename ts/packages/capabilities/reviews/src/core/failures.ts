import type { ErrorInfo, Result } from "@nseng-ai/foundation/result";

export type ReviewDefinitionFailureCode = "review-definition-invalid";

export type ReviewCatalogFailureCode =
	| "reviews-dir-missing"
	| "reviews-dir-not-directory"
	| "review-key-invalid"
	| "review-definition-not-found"
	| "review-definition-not-file"
	| "review-definition-read-failed";

export type LocalDiffFailureCode =
	| "base-ref-unavailable"
	| "repo-root-unavailable"
	| "git-invocation-failed"
	| "git-diff-failed"
	| "project-config-invalid";

export type ReviewRunnerFailureCode =
	| "model-not-provided"
	| "harness-binary-missing"
	| "harness-invocation-failed"
	| "harness-execution-failed"
	| "model-not-supported-by-harness"
	| "review-execution-empty-output"
	| "review-execution-invalid-json"
	| "review-execution-invalid-response"
	| "review-execution-invalid-findings"
	| "review-execution-blocked"
	| "review-execution-cancelled"
	| "review-execution-failed";

export type ReviewLogFailureCode =
	| "review-log-write-failed"
	| "review-log-list-failed"
	| "review-log-response-invalid";

export type GitHubGatewayFailureCode = "github-read-failed";

export type ReviewFailureCode =
	| ReviewDefinitionFailureCode
	| ReviewCatalogFailureCode
	| LocalDiffFailureCode
	| ReviewRunnerFailureCode
	| ReviewLogFailureCode
	| GitHubGatewayFailureCode;

export interface ReviewFailure<
	Code extends ReviewFailureCode = ReviewFailureCode,
> extends ErrorInfo {
	readonly code: Code;
}

export type ReviewResult<T> = Result<T, ReviewFailure>;

export type ReviewDefinitionFailure = ReviewFailure<ReviewDefinitionFailureCode>;
export type ReviewCatalogFailure = ReviewFailure<ReviewCatalogFailureCode>;
export type LocalDiffFailure = ReviewFailure<LocalDiffFailureCode>;
export type ReviewRunnerFailure = ReviewFailure<ReviewRunnerFailureCode>;
export type ReviewLogFailure = ReviewFailure<ReviewLogFailureCode>;
export type GitHubGatewayFailure = ReviewFailure<GitHubGatewayFailureCode>;

export function isReviewLogFailure(error: ReviewFailure): error is ReviewLogFailure {
	return (
		error.code === "review-log-write-failed" ||
		error.code === "review-log-list-failed" ||
		error.code === "review-log-response-invalid"
	);
}
