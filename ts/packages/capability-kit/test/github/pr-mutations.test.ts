import { describe, expect, test } from "vitest";

import {
	MERGE_PULL_REQUEST_MUTATION,
	MERGE_PULL_REQUEST_MUTATION_NAME,
	mergePullRequestArgs,
	parseMergePullRequestResult,
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

describe("mergePullRequestArgs", () => {
	test("maps 1:1 onto the old gh pr merge semantics via raw-string variables", () => {
		expect(
			mergePullRequestArgs({
				pullRequestId: "PR_node_101",
				expectedHeadOid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				commitHeadline: "Ship feature",
				commitBody: "Feature body",
			}),
		).toEqual([
			"api",
			"graphql",
			"-f",
			"pullRequestId=PR_node_101",
			// expectedHeadOid == old `--match-head-commit <headRefOid>`
			"-f",
			"expectedHeadOid=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			// commitHeadline == old `--subject <title>`
			"-f",
			"commitHeadline=Ship feature",
			// commitBody == old `--body <body ?? "">`
			"-f",
			"commitBody=Feature body",
			"-f",
			`query=${MERGE_PULL_REQUEST_MUTATION}`,
		]);
	});

	test("passes an empty commit body through unchanged", () => {
		expect(
			mergePullRequestArgs({
				pullRequestId: "PR_node_101",
				expectedHeadOid: "a".repeat(40),
				commitHeadline: "Ship feature",
				commitBody: "",
			}),
		).toContain("commitBody=");
	});

	test("carries the mutation name so telemetry can classify the call", () => {
		expect(MERGE_PULL_REQUEST_MUTATION).toContain(MERGE_PULL_REQUEST_MUTATION_NAME);
		expect(MERGE_PULL_REQUEST_MUTATION_NAME).toBe("mergePullRequest");
		expect(MERGE_PULL_REQUEST_MUTATION).toContain("mergeMethod:SQUASH");
	});
});

describe("parseMergePullRequestResult", () => {
	test("accepts the happy merged response", () => {
		const stdout = JSON.stringify({
			data: {
				mergePullRequest: {
					pullRequest: {
						number: 101,
						state: "MERGED",
						mergedAt: "2026-05-22T00:00:00Z",
						baseRefName: "main",
						headRefName: "feature-a",
						url: "https://github.example/pull/101",
					},
				},
			},
		});
		expect(parseMergePullRequestResult(stdout)).toEqual({
			type: "ok",
			pullRequest: {
				number: 101,
				state: "MERGED",
				mergedAt: "2026-05-22T00:00:00Z",
				baseRefName: "main",
				headRefName: "feature-a",
				url: "https://github.example/pull/101",
			},
		});
	});

	test("accepts a null mergedAt (state not yet MERGED) without an url", () => {
		const stdout = JSON.stringify({
			data: {
				mergePullRequest: {
					pullRequest: {
						number: 101,
						state: "OPEN",
						mergedAt: null,
						baseRefName: "main",
						headRefName: "feature-a",
					},
				},
			},
		});
		expect(parseMergePullRequestResult(stdout)).toEqual({
			type: "ok",
			pullRequest: {
				number: 101,
				state: "OPEN",
				mergedAt: null,
				baseRefName: "main",
				headRefName: "feature-a",
			},
		});
	});

	test("surfaces a head-branch-modified GraphQL error", () => {
		const stdout = JSON.stringify({
			data: { mergePullRequest: null },
			errors: [{ message: "Head branch was modified. Review and try the merge again." }],
		});
		expect(parseMergePullRequestResult(stdout)).toEqual({
			type: "graphql-errors",
			messages: ["Head branch was modified. Review and try the merge again."],
		});
	});

	test("surfaces a not-mergeable GraphQL error", () => {
		const stdout = JSON.stringify({
			data: { mergePullRequest: null },
			errors: [{ message: "Pull request is not mergeable" }],
		});
		expect(parseMergePullRequestResult(stdout)).toEqual({
			type: "graphql-errors",
			messages: ["Pull request is not mergeable"],
		});
	});

	test("flags a schema mismatch when the payload shape is wrong", () => {
		const stdout = JSON.stringify({ data: { mergePullRequest: { pullRequest: {} } } });
		expect(parseMergePullRequestResult(stdout)).toEqual({ type: "schema-mismatch" });
	});

	test("flags invalid JSON", () => {
		expect(parseMergePullRequestResult("<html>nope</html>")).toEqual({ type: "invalid-json" });
	});
});
