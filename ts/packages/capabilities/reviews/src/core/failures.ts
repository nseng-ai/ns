export type ReviewDefinitionFailureType = "review-definition-invalid";

export type ReviewCatalogFailureType =
	| "reviews-dir-missing"
	| "reviews-dir-not-directory"
	| "review-key-invalid"
	| "review-definition-not-found"
	| "review-definition-not-file"
	| "review-definition-read-failed";

export type LocalDiffFailureType =
	| "base-ref-unavailable"
	| "repo-root-unavailable"
	| "git-invocation-failed"
	| "git-diff-failed"
	| "project-config-invalid";

export type ReviewRunnerFailureType =
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

export type GitHubGatewayFailureType =
	| "github-cli-failed"
	| "github-json-invalid"
	| "github-response-invalid";

export type ReviewLogFailureType =
	| "review-log-write-failed"
	| "review-log-list-failed"
	| "review-log-response-invalid";

export type RoasterFailureType =
	| ReviewDefinitionFailureType
	| ReviewCatalogFailureType
	| LocalDiffFailureType
	| ReviewRunnerFailureType
	| GitHubGatewayFailureType
	| ReviewLogFailureType;

export interface RoasterFailure {
	readonly type: RoasterFailureType;
	readonly message: string;
}

export type RoasterResult<T> =
	| { readonly type: "ok"; readonly value: T }
	| { readonly type: "error"; readonly error: RoasterFailure };

export type ReviewDefinitionFailure = RoasterFailure & {
	readonly type: ReviewDefinitionFailureType;
};
export type ReviewCatalogFailure = RoasterFailure & { readonly type: ReviewCatalogFailureType };
export type LocalDiffFailure = RoasterFailure & { readonly type: LocalDiffFailureType };
export type ReviewRunnerFailure = RoasterFailure & { readonly type: ReviewRunnerFailureType };
export type GitHubGatewayFailure = RoasterFailure & { readonly type: GitHubGatewayFailureType };
export type ReviewLogFailure = RoasterFailure & { readonly type: ReviewLogFailureType };

export function isReviewLogFailure(error: RoasterFailure): error is ReviewLogFailure {
	return (
		error.type === "review-log-write-failed" ||
		error.type === "review-log-list-failed" ||
		error.type === "review-log-response-invalid"
	);
}
