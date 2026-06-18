import { describe, expect, test } from "vitest";

import {
	classifyGithubStatusCheck,
	githubPrIdentityFromUrl,
	githubRepositoryIdentityFromRemoteUrl,
	githubWorktreePrStatusArgs,
	githubWorktreePrStatusQuery,
	parseGithubWorktreePrStatusJson,
	tallyGithubStatusChecks,
} from "@asdl/core/github-status";

describe("GitHub status boundary parsing", () => {
	test("extracts canonical GitHub PR identity", () => {
		expect(githubPrIdentityFromUrl("https://github.com/dagster-io/asdl-tools/pull/1741", 1741)).toEqual({
			owner: "dagster-io",
			repo: "asdl-tools",
			number: 1741,
		});
		expect(githubPrIdentityFromUrl("https://github.com/dagster-io/asdl-tools/pull/1741", 12)).toBeUndefined();
		expect(githubPrIdentityFromUrl("https://example.com/dagster-io/asdl-tools/pull/1741", 1741)).toBeUndefined();
		expect(githubPrIdentityFromUrl("https://github.com/dagster-io/asdl-tools/issues/1741", 1741)).toBeUndefined();
	});

	test("builds bounded worktree PR status GraphQL args", () => {
		expect(githubWorktreePrStatusArgs({ owner: "dagster-io", repo: "asdl-tools", headRefName: "feature/current" })).toEqual([
			"api",
			"graphql",
			"-f",
			`query=${githubWorktreePrStatusQuery}`,
			"-f",
			"owner=dagster-io",
			"-f",
			"repo=asdl-tools",
			"-f",
			"headRefName=feature/current",
		]);
	});

	test("parses bounded worktree PR status GraphQL response with pagination flags", () => {
		const parsed = parseGithubWorktreePrStatusJson(JSON.stringify({
			data: {
				repository: {
					pullRequests: {
						nodes: [
							{
								number: 1741,
								url: "https://github.com/dagster-io/asdl-tools/pull/1741",
								headRefName: "feature/current",
								headRefOid: "abc123",
								statusCheckRollup: {
									contexts: {
										pageInfo: { hasNextPage: true },
										nodes: [
											{ __typename: "CheckRun", status: "COMPLETED", conclusion: "SUCCESS" },
											{ __typename: "StatusContext", state: "PENDING" },
										],
									},
								},
								reviewThreads: {
									totalCount: 200,
									pageInfo: { hasNextPage: true },
									nodes: [{ isResolved: false }, { isResolved: true }],
								},
							},
						],
					},
				},
			},
		}));

		expect(parsed).toEqual([
			{
				number: 1741,
				url: "https://github.com/dagster-io/asdl-tools/pull/1741",
				headRefName: "feature/current",
				headRefOid: "abc123",
				threads: { unresolved: 1, total: 2, hasMore: true },
				checks: { passing: 1, pending: 1, failing: 0, unknown: 0, hasMore: true },
			},
		]);
	});

	test("parses empty worktree PR status results and rejects malformed responses", () => {
		expect(parseGithubWorktreePrStatusJson(JSON.stringify({ data: { repository: { pullRequests: { nodes: [] } } } }))).toEqual([]);
		expect(parseGithubWorktreePrStatusJson("not json")).toBeUndefined();
		expect(parseGithubWorktreePrStatusJson(JSON.stringify({ errors: [{ message: "rate limit" }] }))).toBeUndefined();
		expect(parseGithubWorktreePrStatusJson(JSON.stringify({ data: { repository: {} } }))).toBeUndefined();
	});

	test("parses common GitHub remote URL forms", () => {
		expect(githubRepositoryIdentityFromRemoteUrl("https://github.com/dagster-io/asdl-tools.git")).toEqual({ owner: "dagster-io", repo: "asdl-tools" });
		expect(githubRepositoryIdentityFromRemoteUrl("https://github.com/dagster-io/asdl-tools")).toEqual({ owner: "dagster-io", repo: "asdl-tools" });
		expect(githubRepositoryIdentityFromRemoteUrl("git@github.com:dagster-io/asdl-tools.git")).toEqual({ owner: "dagster-io", repo: "asdl-tools" });
		expect(githubRepositoryIdentityFromRemoteUrl("ssh://git@github.com/dagster-io/asdl-tools.git")).toEqual({ owner: "dagster-io", repo: "asdl-tools" });
		expect(githubRepositoryIdentityFromRemoteUrl("https://example.com/dagster-io/asdl-tools.git")).toBeUndefined();
	});
});

describe("GitHub status check classification", () => {
	test("classifies CheckRun and StatusContext states", () => {
		expect(classifyGithubStatusCheck({ __typename: "CheckRun", status: "COMPLETED", conclusion: "SUCCESS" })).toBe("passing");
		expect(classifyGithubStatusCheck({ __typename: "CheckRun", status: "COMPLETED", conclusion: "NEUTRAL" })).toBe("passing");
		expect(classifyGithubStatusCheck({ __typename: "CheckRun", status: "IN_PROGRESS" })).toBe("pending");
		expect(classifyGithubStatusCheck({ __typename: "CheckRun", status: "COMPLETED", conclusion: "FAILURE" })).toBe("failing");
		expect(classifyGithubStatusCheck({ __typename: "CheckRun", status: "COMPLETED", conclusion: "MYSTERY" })).toBe("unknown");
		expect(classifyGithubStatusCheck({ __typename: "StatusContext", state: "SUCCESS" })).toBe("passing");
		expect(classifyGithubStatusCheck({ __typename: "StatusContext", state: "EXPECTED" })).toBe("pending");
		expect(classifyGithubStatusCheck({ __typename: "StatusContext", state: "ERROR" })).toBe("failing");
		expect(classifyGithubStatusCheck({ __typename: "StatusContext", state: "MYSTERY" })).toBe("unknown");
	});

	test("tallies checks in one coherent partition including unknown", () => {
		expect(tallyGithubStatusChecks([
			{ __typename: "CheckRun", status: "COMPLETED", conclusion: "SUCCESS" },
			{ __typename: "StatusContext", state: "PENDING" },
			{ __typename: "CheckRun", status: "COMPLETED", conclusion: "TIMED_OUT" },
			{ __typename: "CheckRun", status: "COMPLETED", conclusion: "MYSTERY" },
			null,
		])).toEqual({ passing: 1, pending: 1, failing: 1, unknown: 2 });
	});
});
