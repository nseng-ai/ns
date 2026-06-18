import { describe, expect, test } from "vitest";

import {
	classifyGithubStatusCheck,
	githubPrIdentityFromUrl,
	githubReviewThreadCountsArgs,
	githubReviewThreadCountsQuery,
	parseGithubPrStatusViewJson,
	parseGithubReviewThreadCountsJson,
	tallyGithubStatusChecks,
} from "@asdl/core/github-status";

describe("GitHub status boundary parsing", () => {
	test("parses gh pr view status fields", () => {
		const parsed = parseGithubPrStatusViewJson(JSON.stringify({
			number: 1741,
			url: "https://github.com/dagster-io/asdl-tools/pull/1741",
			statusCheckRollup: [
				{ __typename: "CheckRun", status: "COMPLETED", conclusion: "SUCCESS" },
				{ __typename: "StatusContext", state: "PENDING" },
			],
		}));

		expect(parsed).toEqual({
			number: 1741,
			url: "https://github.com/dagster-io/asdl-tools/pull/1741",
			statusCheckRollup: [
				{ __typename: "CheckRun", status: "COMPLETED", conclusion: "SUCCESS" },
				{ __typename: "StatusContext", state: "PENDING" },
			],
		});
	});

	test("rejects malformed PR view output", () => {
		expect(parseGithubPrStatusViewJson("not json")).toBeUndefined();
		expect(parseGithubPrStatusViewJson(JSON.stringify({ number: 0, url: "https://github.com/o/r/pull/1" }))).toBeUndefined();
		expect(parseGithubPrStatusViewJson(JSON.stringify({ number: 1 }))).toBeUndefined();
	});

	test("defaults missing or malformed check rollup to empty", () => {
		expect(parseGithubPrStatusViewJson(JSON.stringify({ number: 1, url: "https://github.com/o/r/pull/1" }))).toEqual({
			number: 1,
			url: "https://github.com/o/r/pull/1",
			statusCheckRollup: [],
		});
		expect(parseGithubPrStatusViewJson(JSON.stringify({ number: 1, url: "https://github.com/o/r/pull/1", statusCheckRollup: "bad" }))).toEqual({
			number: 1,
			url: "https://github.com/o/r/pull/1",
			statusCheckRollup: [],
		});
	});

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

	test("builds review thread count GraphQL args", () => {
		expect(githubReviewThreadCountsArgs({ owner: "dagster-io", repo: "asdl-tools", number: 1741 })).toEqual([
			"api",
			"graphql",
			"-f",
			`query=${githubReviewThreadCountsQuery}`,
			"-f",
			"owner=dagster-io",
			"-f",
			"repo=asdl-tools",
			"-F",
			"number=1741",
		]);
	});

	test("parses review thread count GraphQL response", () => {
		const parsed = parseGithubReviewThreadCountsJson(JSON.stringify({
			data: {
				repository: {
					pullRequest: {
						reviewThreads: {
							totalCount: 4,
							pageInfo: { hasNextPage: false },
							nodes: [{ isResolved: false }, { isResolved: true }, { isResolved: false }],
						},
					},
				},
			},
		}));

		expect(parsed).toEqual({ unresolved: 2, total: 4, hasMore: false });
	});

	test("uses loaded node count and hasMore when review thread response is paginated", () => {
		const parsed = parseGithubReviewThreadCountsJson(JSON.stringify({
			data: {
				repository: {
					pullRequest: {
						reviewThreads: {
							totalCount: 200,
							pageInfo: { hasNextPage: true },
							nodes: [{ isResolved: false }, { isResolved: true }],
						},
					},
				},
			},
		}));

		expect(parsed).toEqual({ unresolved: 1, total: 2, hasMore: true });
	});

	test("rejects malformed or error GraphQL responses", () => {
		expect(parseGithubReviewThreadCountsJson("not json")).toBeUndefined();
		expect(parseGithubReviewThreadCountsJson(JSON.stringify({ errors: [{ message: "rate limit" }] }))).toBeUndefined();
		expect(parseGithubReviewThreadCountsJson(JSON.stringify({ data: { repository: {} } }))).toBeUndefined();
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
