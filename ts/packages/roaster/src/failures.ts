export type ReviewDefinitionFailureType = "review_definition_invalid";

export type ReviewCatalogFailureType =
	| "reviews_dir_missing"
	| "reviews_dir_not_directory"
	| "review_key_invalid"
	| "review_definition_not_found"
	| "review_definition_not_file"
	| "review_definition_read_failed";

export type LocalDiffFailureType =
	| "base_ref_unavailable"
	| "repo_root_unavailable"
	| "git_invocation_failed"
	| "git_diff_failed"
	| "project_config_invalid";

export type HarnessFailureType =
	| "model_not_provided"
	| "harness_binary_missing"
	| "harness_invocation_failed"
	| "harness_execution_failed"
	| "model_not_supported_by_harness"
	| "review_execution_empty_output"
	| "review_execution_invalid_json"
	| "review_execution_invalid_response"
	| "review_execution_invalid_findings";

export type GitHubGatewayFailureType =
	| "github_cli_failed"
	| "github_json_invalid"
	| "github_response_invalid";

export type RoasterFailureType =
	| ReviewDefinitionFailureType
	| ReviewCatalogFailureType
	| LocalDiffFailureType
	| HarnessFailureType
	| GitHubGatewayFailureType;

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
export type HarnessFailure = RoasterFailure & { readonly type: HarnessFailureType };
export type GitHubGatewayFailure = RoasterFailure & { readonly type: GitHubGatewayFailureType };
