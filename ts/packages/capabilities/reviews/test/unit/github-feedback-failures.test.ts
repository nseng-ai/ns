import type {
	GithubPrFeedbackFailure,
	GithubPrFeedbackFailureCode,
	GithubPrFeedbackOperation,
} from "@nseng-ai/capability-kit/github/pr-feedback";
import { describe, expect, test } from "vitest";

import {
	callGithub,
	convertFeedbackFailure,
	toRoasterResult,
} from "../../src/core/github-feedback-failures.ts";

function feedbackFailure(overrides: {
	readonly code?: GithubPrFeedbackFailureCode;
	readonly message?: string;
	readonly operation?: GithubPrFeedbackOperation;
	readonly displayCommand?: string;
	readonly detailsDisplayCommand?: string;
}): GithubPrFeedbackFailure {
	const operation = overrides.operation ?? "getPrChangedFiles";
	return {
		code: overrides.code ?? "github_pr_feedback_gh_failed",
		message: overrides.message ?? "boom",
		...(overrides.displayCommand === undefined ? {} : { displayCommand: overrides.displayCommand }),
		details: {
			operation,
			...(overrides.detailsDisplayCommand === undefined
				? {}
				: { displayCommand: overrides.detailsDisplayCommand }),
		},
	};
}

describe("convertFeedbackFailure", () => {
	test.each([
		["getPrChangedFiles", "list PR changed files"],
		["getPrReviewComments", "list PR review comments"],
		["getPrIssueComments", "list PR discussion comments"],
		["findPrDiscussionCommentByMarker", "list PR discussion comments"],
		["addPrDiscussionComment", "mutate PR discussion comment"],
		["updatePrDiscussionComment", "mutate PR discussion comment"],
		["createPrReview", "create PR review"],
	] as const)("labels %s as %s", (operation, label) => {
		const converted = convertFeedbackFailure(feedbackFailure({ operation }), "/repo");

		expect(converted.message).toBe(`GitHub response for ${label}: boom in /repo`);
	});

	test("falls back to the raw operation name, then to a generic label", () => {
		expect(
			convertFeedbackFailure(feedbackFailure({ operation: "getPrReviewThreads" }), "/repo").message,
		).toBe("GitHub response for getPrReviewThreads: boom in /repo");
		expect(
			convertFeedbackFailure({ code: "github_pr_feedback_gh_failed", message: "boom" }, "/repo")
				.message,
		).toBe("GitHub response for GitHub PR feedback: boom in /repo");
	});

	test("appends the display command from the failure or its details", () => {
		expect(
			convertFeedbackFailure(
				feedbackFailure({ displayCommand: "gh api --paginate repos/pulls/files" }),
				"/repo",
			).message,
		).toBe(
			"GitHub response for list PR changed files: boom (gh api --paginate repos/pulls/files) in /repo",
		);
		expect(
			convertFeedbackFailure(feedbackFailure({ detailsDisplayCommand: "gh api graphql" }), "/repo")
				.message,
		).toBe("GitHub response for list PR changed files: boom (gh api graphql) in /repo");
	});

	test("omits the location suffix without a cwd", () => {
		const converted = convertFeedbackFailure(feedbackFailure({}), undefined);

		expect(converted.message).toBe("GitHub response for list PR changed files: boom");
	});

	test("prefixes invalid-response failures with the expected-shape note", () => {
		const converted = convertFeedbackFailure(
			feedbackFailure({
				code: "github_pr_feedback_response_invalid",
				operation: "createPrReview",
				message: "inline validation failed",
			}),
			"/repo",
		);

		expect(converted.message).toBe(
			"GitHub response for create PR review: did not match the expected shape: inline validation failed in /repo",
		);
	});

	test.each([
		["github_pr_feedback_json_parse_failed", "github-json-invalid"],
		["github_pr_feedback_response_invalid", "github-response-invalid"],
		["github_pr_feedback_pagination_invalid", "github-response-invalid"],
		["github_pr_feedback_gh_failed", "github-cli-failed"],
		["github_pr_feedback_startup_failed", "github-cli-failed"],
		["github_pr_feedback_graphql_failed", "github-cli-failed"],
	] as const)("maps %s to %s", (code, type) => {
		expect(convertFeedbackFailure(feedbackFailure({ code }), "/repo").type).toBe(type);
	});
});

describe("callGithub", () => {
	test("passes options once and decorates failures with their cwd", async () => {
		const result = await callGithub({ cwd: "/repo", prNumber: 12 }, async (options) => ({
			ok: false,
			error: feedbackFailure({
				message: `PR ${options.prNumber} failed`,
				operation: "createPrReview",
			}),
		}));

		expect(result).toEqual({
			type: "error",
			error: {
				type: "github-cli-failed",
				message: "GitHub response for create PR review: PR 12 failed in /repo",
			},
		});
	});
});

describe("toRoasterResult", () => {
	test("passes ok values through", () => {
		expect(toRoasterResult({ ok: true, value: 7 }, "/repo")).toEqual({ type: "ok", value: 7 });
	});

	test("converts failures into decorated RoasterResult errors", () => {
		const result = toRoasterResult(
			{ ok: false, error: feedbackFailure({ message: "no auth" }) },
			"/repo",
		);

		expect(result).toEqual({
			type: "error",
			error: {
				type: "github-cli-failed",
				message: "GitHub response for list PR changed files: no auth in /repo",
			},
		});
	});
});
