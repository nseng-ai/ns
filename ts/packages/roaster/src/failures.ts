export type RoasterFailure =
	| ReviewDefinitionFailure
	| ReviewCatalogFailure
	| LocalDiffFailure
	| HarnessFailure
	| GitHubGatewayFailure
	| PublicationFailure
	| InlineClassificationFailure;

export type RoasterResult<T> = { readonly type: "ok"; readonly value: T } | { readonly type: "error"; readonly error: RoasterFailure };

export interface ReviewDefinitionFailure {
	readonly type: "review_definition_invalid";
	readonly message: string;
	readonly reviewKey?: string;
}

export type ReviewCatalogFailure =
	| { readonly type: "reviews_dir_missing"; readonly message: string }
	| { readonly type: "reviews_dir_not_directory"; readonly message: string }
	| { readonly type: "review_key_invalid"; readonly message: string; readonly reviewKey: string }
	| { readonly type: "review_definition_not_found"; readonly message: string; readonly reviewKey: string; readonly path: string }
	| { readonly type: "review_definition_not_file"; readonly message: string; readonly reviewKey: string; readonly path: string }
	| { readonly type: "review_definition_read_failed"; readonly message: string; readonly reviewKey: string; readonly path: string };

export type LocalDiffFailure =
	| { readonly type: "base_ref_unavailable"; readonly message: string }
	| { readonly type: "repo_root_unavailable"; readonly message: string; readonly cwd: string }
	| { readonly type: "git_invocation_failed"; readonly message: string; readonly command: readonly string[] }
	| { readonly type: "git_diff_failed"; readonly message: string; readonly command: readonly string[]; readonly stderr: string; readonly code: number | null }
	| { readonly type: "project_config_invalid"; readonly message: string; readonly path: string };

export type HarnessFailure =
	| { readonly type: "model_not_provided"; readonly message: string }
	| { readonly type: "harness_binary_missing"; readonly message: string }
	| { readonly type: "harness_invocation_failed"; readonly message: string }
	| { readonly type: "harness_execution_failed"; readonly message: string; readonly stderr: string; readonly code: number | null }
	| { readonly type: "model_not_supported_by_harness"; readonly message: string; readonly model: string }
	| { readonly type: "review_execution_invalid_json"; readonly message: string }
	| { readonly type: "review_execution_invalid_response"; readonly message: string }
	| { readonly type: "review_execution_invalid_findings"; readonly message: string };

export type GitHubGatewayFailure =
	| { readonly type: "github_cli_failed"; readonly message: string; readonly command: readonly string[]; readonly stderr: string; readonly code: number | null }
	| { readonly type: "github_json_invalid"; readonly message: string; readonly command: readonly string[] }
	| { readonly type: "github_response_invalid"; readonly message: string; readonly command: readonly string[] };

export type PublicationFailure =
	| { readonly type: "findings_payload_invalid"; readonly message: string }
	| { readonly type: "inline_posting_status_invalid"; readonly message: string }
	| { readonly type: "findings_comment_body_invalid"; readonly message: string };

export interface InlineClassificationFailure {
	readonly type: "inline_classification_invalid";
	readonly message: string;
}

export function isFailureOfType<TFailure extends RoasterFailure["type"]>(failure: RoasterFailure, type: TFailure): failure is Extract<RoasterFailure, { readonly type: TFailure }> {
	return failure.type === type;
}

export function failureMessage(failure: RoasterFailure): string {
	return failure.message;
}
