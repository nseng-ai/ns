import { describe, expect, test } from "vitest";

import {
	parseRetargetPullRequestBaseResult,
	RETARGET_PULL_REQUEST_BASE_MUTATION,
	RETARGET_PULL_REQUEST_BASE_MUTATION_NAME,
	retargetPullRequestBaseArgs,
} from "@nseng-ai/capability-kit/github/pr-mutations";

describe("retargetPullRequestBaseArgs", () => {
	test("builds gh api graphql argv with raw-string variables and the mutation query", () => {
		expect(
			retargetPullRequestBaseArgs({ pullRequestId: "PR_node_102", baseRefName: "main" }),
		).toEqual([
			"api",
			"graphql",
			"-f",
			"pullRequestId=PR_node_102",
			"-f",
			"baseRefName=main",
			"-f",
			`query=${RETARGET_PULL_REQUEST_BASE_MUTATION}`,
		]);
	});

	test("carries the mutation name so telemetry can classify the call", () => {
		expect(RETARGET_PULL_REQUEST_BASE_MUTATION).toContain(RETARGET_PULL_REQUEST_BASE_MUTATION_NAME);
		expect(RETARGET_PULL_REQUEST_BASE_MUTATION_NAME).toBe("updatePullRequest");
	});
});

describe("parseRetargetPullRequestBaseResult", () => {
	test("parses a successful updatePullRequest response", () => {
		const stdout = JSON.stringify({
			data: {
				updatePullRequest: { pullRequest: { id: "PR_node_102", number: 102, baseRefName: "main" } },
			},
		});
		expect(parseRetargetPullRequestBaseResult(stdout)).toEqual({
			type: "ok",
			pullRequest: { id: "PR_node_102", number: 102, baseRefName: "main" },
		});
	});

	test("reports GraphQL errors carried alongside a null payload", () => {
		const stdout = JSON.stringify({
			data: { updatePullRequest: null },
			errors: [{ message: "Could not resolve to a node." }],
		});
		expect(parseRetargetPullRequestBaseResult(stdout)).toEqual({
			type: "graphql-errors",
			messages: ["Could not resolve to a node."],
		});
	});

	test("flags a schema mismatch when the payload shape is wrong", () => {
		const stdout = JSON.stringify({ data: { updatePullRequest: { pullRequest: {} } } });
		expect(parseRetargetPullRequestBaseResult(stdout)).toEqual({ type: "schema-mismatch" });
	});

	test("flags invalid JSON", () => {
		expect(parseRetargetPullRequestBaseResult("<html>nope</html>")).toEqual({
			type: "invalid-json",
		});
	});
});
