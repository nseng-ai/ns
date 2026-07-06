import type { GithubPrFeedbackFailure } from "@nseng-ai/capability-kit/github/pr-feedback";
import type { Result } from "@nseng-ai/foundation/result";

import type { GitHubGatewayFailure, RoasterResult } from "./failures.ts";

export function convertFeedbackFailure(
	failure: GithubPrFeedbackFailure,
	cwd: string | undefined,
): GitHubGatewayFailure {
	const displayCommand = failure.displayCommand ?? failure.details?.displayCommand;
	const location = cwd === undefined ? "" : ` in ${cwd}`;
	const operation = roasterOperationLabel(failure);
	const message =
		failure.code === "github_pr_feedback_response_invalid"
			? `did not match the expected shape: ${failure.message}`
			: failure.message;
	return {
		type: githubFailureTypeForFeedbackFailure(failure),
		message:
			displayCommand === undefined
				? `GitHub response for ${operation}: ${message}${location}`
				: `GitHub response for ${operation}: ${message} (${displayCommand})${location}`,
	};
}

export async function callGithub<T, TOptions extends { readonly cwd: string | undefined }>(
	options: TOptions,
	call: (options: TOptions) => Promise<Result<T, GithubPrFeedbackFailure>>,
): Promise<RoasterResult<T>> {
	return toRoasterResult(await call(options), options.cwd);
}

export function toRoasterResult<T>(
	result: Result<T, GithubPrFeedbackFailure>,
	cwd: string | undefined,
): RoasterResult<T> {
	if (!result.ok) return { type: "error", error: convertFeedbackFailure(result.error, cwd) };
	return { type: "ok", value: result.value };
}

function roasterOperationLabel(failure: GithubPrFeedbackFailure): string {
	switch (failure.details?.operation) {
		case "getPrChangedFiles":
			return "list PR changed files";
		case "getPrReviewComments":
			return "list PR review comments";
		case "getPrIssueComments":
		case "findPrDiscussionCommentByMarker":
			return "list PR discussion comments";
		case "addPrDiscussionComment":
		case "updatePrDiscussionComment":
			return "mutate PR discussion comment";
		case "createPrReview":
			return "create PR review";
		default:
			return failure.details?.operation ?? "GitHub PR feedback";
	}
}

function githubFailureTypeForFeedbackFailure(
	failure: GithubPrFeedbackFailure,
): GitHubGatewayFailure["type"] {
	switch (failure.code) {
		case "github_pr_feedback_json_parse_failed":
			return "github-json-invalid";
		case "github_pr_feedback_response_invalid":
		case "github_pr_feedback_pagination_invalid":
			return "github-response-invalid";
		case "github_pr_feedback_gh_failed":
		case "github_pr_feedback_startup_failed":
		case "github_pr_feedback_graphql_failed":
			return "github-cli-failed";
	}
}
