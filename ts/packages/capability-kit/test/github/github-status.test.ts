import { describe, expect, test } from "vitest";

import { githubCheckRun } from "@ji/capability-kit/github/testing";
import {
	githubPrIdentityFromUrl,
	githubRepositoryIdentityFromNormalizedRemoteUrl,
	githubRepositoryIdentityFromRemoteUrl,
	normalizeGitRemoteUrl,
} from "@ji/capability-kit/github/identity";
import {
	classifyGithubStatusCheck,
	githubWorktreePrStatusArgs,
	githubWorktreePrStatusQuery,
	normalizeGithubStatusChecks,
	parseGithubWorktreePrStatusJson,
	parseGithubWorktreePrStatusJsonResult,
	tallyGithubStatusChecks,
} from "@ji/capability-kit/github/pr-status";

describe("GitHub status boundary parsing", () => {
	test("extracts canonical GitHub PR identity", () => {
		expect(
			githubPrIdentityFromUrl("https://github.com/dagster-io/sdl-tools/pull/1741", 1741),
		).toEqual({
			owner: "dagster-io",
			repo: "sdl-tools",
			number: 1741,
		});
		expect(
			githubPrIdentityFromUrl("https://github.com/dagster-io/sdl-tools/pull/1741", 12),
		).toBeUndefined();
		expect(
			githubPrIdentityFromUrl("https://example.com/dagster-io/sdl-tools/pull/1741", 1741),
		).toBeUndefined();
		expect(
			githubPrIdentityFromUrl("https://github.com/dagster-io/sdl-tools/issues/1741", 1741),
		).toBeUndefined();
	});

	test("builds bounded worktree PR status GraphQL args", () => {
		expect(
			githubWorktreePrStatusArgs({
				owner: "dagster-io",
				repo: "sdl-tools",
				headRefName: "feature/current",
			}),
		).toEqual([
			"api",
			"graphql",
			"-f",
			`query=${githubWorktreePrStatusQuery}`,
			"-f",
			"owner=dagster-io",
			"-f",
			"repo=sdl-tools",
			"-f",
			"headRefName=feature/current",
		]);
		expect(githubWorktreePrStatusQuery).toContain(
			"name status conclusion startedAt completedAt detailsUrl",
		);
		expect(githubWorktreePrStatusQuery).toContain(
			"checkSuite{workflowRun{databaseId runNumber runAttempt createdAt updatedAt workflow{name}}}",
		);
		expect(githubWorktreePrStatusQuery).toContain("context state createdAt targetUrl");
	});

	test("parses bounded worktree PR status GraphQL response with pagination flags", () => {
		const parsed = parseGithubWorktreePrStatusJson(
			JSON.stringify({
				data: {
					repository: {
						pullRequests: {
							nodes: [
								{
									number: 1741,
									url: "https://github.com/dagster-io/sdl-tools/pull/1741",
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
			}),
		);

		expect(parsed).toEqual([
			{
				number: 1741,
				url: "https://github.com/dagster-io/sdl-tools/pull/1741",
				headRefName: "feature/current",
				headRefOid: "abc123",
				threads: { unresolved: 1, total: 2, hasMore: true },
				checks: { passing: 1, pending: 1, failing: 0, unknown: 0, hasMore: true },
			},
		]);
	});

	test("parses empty worktree PR status results and rejects malformed responses", () => {
		const emptyResponse = JSON.stringify({ data: { repository: { pullRequests: { nodes: [] } } } });
		expect(parseGithubWorktreePrStatusJson(emptyResponse)).toEqual([]);
		expect(parseGithubWorktreePrStatusJsonResult(emptyResponse)).toEqual({ type: "ok", prs: [] });
		expect(parseGithubWorktreePrStatusJson("not json")).toBeUndefined();
		expect(
			parseGithubWorktreePrStatusJson(JSON.stringify({ errors: [{ message: "rate limit" }] })),
		).toBeUndefined();
		expect(
			parseGithubWorktreePrStatusJson(JSON.stringify({ data: { repository: {} } })),
		).toBeUndefined();
	});

	test("classifies worktree PR status parse failures", () => {
		expect(
			parseGithubWorktreePrStatusJsonResult(
				"<!DOCTYPE html><html><head><title>Unicorn! &middot; GitHub</title></head><body></body></html>",
			),
		).toEqual({ type: "invalid-json", kind: "github-unicorn-html" });
		expect(
			parseGithubWorktreePrStatusJsonResult(
				"<!DOCTYPE html><html><head><title>502</title></head></html>",
			),
		).toEqual({ type: "invalid-json", kind: "html" });
		expect(parseGithubWorktreePrStatusJsonResult("not json")).toEqual({
			type: "invalid-json",
			kind: "non-json",
		});
		expect(
			parseGithubWorktreePrStatusJsonResult(
				JSON.stringify({ errors: [{ message: "API rate limit exceeded" }] }),
			),
		).toEqual({ type: "graphql-errors", messages: ["API rate limit exceeded"] });
		expect(
			parseGithubWorktreePrStatusJsonResult(JSON.stringify({ errors: [{ path: ["repository"] }] })),
		).toEqual({
			type: "graphql-errors",
			messages: ["GitHub returned GraphQL errors without messages"],
		});
		expect(
			parseGithubWorktreePrStatusJsonResult(JSON.stringify({ data: { repository: {} } })),
		).toEqual({ type: "schema-mismatch" });
	});

	test("normalizes git remote URLs host-agnostically", () => {
		expect(normalizeGitRemoteUrl("git@github.com:owner/repo.git")).toBe(
			"ssh://git@github.com/owner/repo",
		);
		expect(normalizeGitRemoteUrl("HTTPS://github.com/Owner/Repo.git")).toBe(
			"https://github.com/Owner/Repo",
		);
		expect(normalizeGitRemoteUrl("https://github.com/owner/repo.git///")).toBe(
			"https://github.com/owner/repo",
		);
		expect(normalizeGitRemoteUrl("git@gitlab.com:Owner/Repo.git")).toBe(
			"ssh://git@gitlab.com/Owner/Repo",
		);
		expect(normalizeGitRemoteUrl("not-a-url.git///")).toBe("not-a-url");
		expect(normalizeGitRemoteUrl("  ")).toBe("");
	});

	test("parses common GitHub remote URL forms", () => {
		expect(
			githubRepositoryIdentityFromRemoteUrl("https://github.com/dagster-io/sdl-tools.git"),
		).toEqual({ owner: "dagster-io", repo: "sdl-tools" });
		expect(
			githubRepositoryIdentityFromRemoteUrl("https://github.com/dagster-io/sdl-tools"),
		).toEqual({ owner: "dagster-io", repo: "sdl-tools" });
		expect(
			githubRepositoryIdentityFromRemoteUrl("git@github.com:dagster-io/sdl-tools.git"),
		).toEqual({ owner: "dagster-io", repo: "sdl-tools" });
		expect(
			githubRepositoryIdentityFromRemoteUrl("ssh://git@github.com/dagster-io/sdl-tools.git"),
		).toEqual({ owner: "dagster-io", repo: "sdl-tools" });
		expect(
			githubRepositoryIdentityFromRemoteUrl("https://example.com/dagster-io/sdl-tools.git"),
		).toBeUndefined();
		expect(
			githubRepositoryIdentityFromRemoteUrl("https://github.com/dagster-io/sdl-tools/extra"),
		).toBeUndefined();
	});

	test("parses GitHub identity from normalized remotes only", () => {
		expect(
			githubRepositoryIdentityFromNormalizedRemoteUrl("ssh://git@github.com/dagster-io/sdl-tools"),
		).toEqual({ owner: "dagster-io", repo: "sdl-tools" });
		expect(
			githubRepositoryIdentityFromNormalizedRemoteUrl("ssh://git@gitlab.com/dagster-io/sdl-tools"),
		).toBeUndefined();
		expect(githubRepositoryIdentityFromNormalizedRemoteUrl("not-a-url")).toBeUndefined();
	});
});

describe("GitHub status check classification", () => {
	test("normalizes latest checks and counts from the same deduped entries", () => {
		const normalized = normalizeGithubStatusChecks(
			[
				{
					__typename: "CheckRun",
					name: "test",
					status: "COMPLETED",
					conclusion: "SUCCESS",
					completedAt: "2026-06-01T00:00:00Z",
					checkSuite: { workflowRun: { workflow: { name: "CI" } } },
				},
				{
					__typename: "CheckRun",
					name: "test",
					status: "COMPLETED",
					conclusion: "FAILURE",
					completedAt: "2026-06-02T00:00:00Z",
					checkSuite: { workflowRun: { workflow: { name: "CI" } } },
				},
				{
					__typename: "StatusContext",
					context: "lint",
					state: "PENDING",
					createdAt: "2026-06-02T00:00:00Z",
					targetUrl: "https://example.com/lint",
				},
				{ __typename: "Mystery" },
			],
			{ hasMore: true },
		);

		expect(normalized.counts).toEqual({
			passing: 0,
			pending: 1,
			failing: 1,
			unknown: 1,
			hasMore: true,
		});
		expect(normalized.checks).toMatchObject([
			{ bucket: "failing", kind: "check_run", name: "test", workflowName: "CI" },
			{
				bucket: "pending",
				kind: "status_context",
				name: "lint",
				targetUrl: "https://example.com/lint",
			},
			{ bucket: "unknown", kind: "unknown", name: "Unknown check" },
		]);
	});

	test("classifies CheckRun and StatusContext states", () => {
		expect(
			classifyGithubStatusCheck({
				__typename: "CheckRun",
				status: "COMPLETED",
				conclusion: "SUCCESS",
			}),
		).toBe("passing");
		expect(
			classifyGithubStatusCheck({
				__typename: "CheckRun",
				status: "COMPLETED",
				conclusion: "NEUTRAL",
			}),
		).toBe("passing");
		expect(classifyGithubStatusCheck({ __typename: "CheckRun", status: "IN_PROGRESS" })).toBe(
			"pending",
		);
		expect(
			classifyGithubStatusCheck({
				__typename: "CheckRun",
				status: "COMPLETED",
				conclusion: "FAILURE",
			}),
		).toBe("failing");
		expect(
			classifyGithubStatusCheck({
				__typename: "CheckRun",
				status: "COMPLETED",
				conclusion: "MYSTERY",
			}),
		).toBe("unknown");
		expect(classifyGithubStatusCheck({ __typename: "StatusContext", state: "SUCCESS" })).toBe(
			"passing",
		);
		expect(classifyGithubStatusCheck({ __typename: "StatusContext", state: "EXPECTED" })).toBe(
			"pending",
		);
		expect(classifyGithubStatusCheck({ __typename: "StatusContext", state: "ERROR" })).toBe(
			"failing",
		);
		expect(classifyGithubStatusCheck({ __typename: "StatusContext", state: "MYSTERY" })).toBe(
			"unknown",
		);
	});

	test("tallies checks in one coherent partition including unknown", () => {
		expect(
			tallyGithubStatusChecks([
				{ __typename: "CheckRun", status: "COMPLETED", conclusion: "SUCCESS" },
				{ __typename: "StatusContext", state: "PENDING" },
				{ __typename: "CheckRun", status: "COMPLETED", conclusion: "TIMED_OUT" },
				{ __typename: "CheckRun", status: "COMPLETED", conclusion: "MYSTERY" },
				null,
			]),
		).toEqual({ passing: 1, pending: 1, failing: 1, unknown: 2, hasMore: false });
	});

	test("ignores a superseded canceled check run", () => {
		expect(
			tallyGithubStatusChecks([
				githubCheckRun({
					workflowName: "ci",
					name: "test",
					status: "COMPLETED",
					conclusion: "CANCELLED",
					completedAt: "2026-01-01T00:00:00Z",
				}),
				githubCheckRun({
					workflowName: "ci",
					name: "test",
					status: "COMPLETED",
					conclusion: "SUCCESS",
					completedAt: "2026-01-01T00:05:00Z",
				}),
			]),
		).toEqual({ passing: 1, pending: 0, failing: 0, unknown: 0, hasMore: false });
	});

	test("keeps the newest canceled or stale check run as failing", () => {
		expect(
			tallyGithubStatusChecks([
				githubCheckRun({
					workflowName: "ci",
					name: "test",
					status: "COMPLETED",
					conclusion: "SUCCESS",
					completedAt: "2026-01-01T00:00:00Z",
				}),
				githubCheckRun({
					workflowName: "ci",
					name: "test",
					status: "COMPLETED",
					conclusion: "STALE",
					completedAt: "2026-01-01T00:05:00Z",
				}),
			]),
		).toEqual({ passing: 0, pending: 0, failing: 1, unknown: 0, hasMore: false });
	});

	test("ignores check runs from older workflow runs even when matrix names change", () => {
		expect(
			tallyGithubStatusChecks([
				githubWorkflowCheckRun({
					workflowName: "roaster",
					workflowRunDatabaseId: 100,
					workflowRunUpdatedAt: "2026-06-26T14:18:05Z",
					name: "review",
					status: "COMPLETED",
					conclusion: "CANCELLED",
					completedAt: "2026-06-26T14:18:05Z",
				}),
				githubWorkflowCheckRun({
					workflowName: "roaster",
					workflowRunDatabaseId: 101,
					workflowRunUpdatedAt: "2026-06-26T14:22:00Z",
					name: "discover",
					status: "COMPLETED",
					conclusion: "SUCCESS",
					completedAt: "2026-06-26T14:18:40Z",
				}),
				githubWorkflowCheckRun({
					workflowName: "roaster",
					workflowRunDatabaseId: 101,
					workflowRunUpdatedAt: "2026-06-26T14:22:00Z",
					name: "review (reinvented-abstractions-tripwire)",
					status: "COMPLETED",
					conclusion: "SUCCESS",
					completedAt: "2026-06-26T14:21:23Z",
				}),
				githubWorkflowCheckRun({
					workflowName: "roaster",
					workflowRunDatabaseId: 101,
					workflowRunUpdatedAt: "2026-06-26T14:22:00Z",
					name: "review (sdl-typescript-style-tripwire)",
					status: "COMPLETED",
					conclusion: "SUCCESS",
					completedAt: "2026-06-26T14:22:00Z",
				}),
			]),
		).toEqual({ passing: 3, pending: 0, failing: 0, unknown: 0, hasMore: false });
	});

	test("keeps a canceled check run from the latest workflow run as failing", () => {
		expect(
			tallyGithubStatusChecks([
				githubWorkflowCheckRun({
					workflowName: "roaster",
					workflowRunDatabaseId: 100,
					workflowRunUpdatedAt: "2026-06-26T14:18:05Z",
					name: "review",
					status: "COMPLETED",
					conclusion: "SUCCESS",
					completedAt: "2026-06-26T14:18:05Z",
				}),
				githubWorkflowCheckRun({
					workflowName: "roaster",
					workflowRunDatabaseId: 101,
					workflowRunUpdatedAt: "2026-06-26T14:22:00Z",
					name: "review",
					status: "COMPLETED",
					conclusion: "CANCELLED",
					completedAt: "2026-06-26T14:22:00Z",
				}),
			]),
		).toEqual({ passing: 0, pending: 0, failing: 1, unknown: 0, hasMore: false });
	});

	test("keeps distinct workflow and check name pairs separate", () => {
		expect(
			tallyGithubStatusChecks([
				githubCheckRun({
					workflowName: "lint",
					name: "required",
					status: "COMPLETED",
					conclusion: "SUCCESS",
					completedAt: "2026-01-01T00:00:00Z",
				}),
				githubCheckRun({
					workflowName: "test",
					name: "required",
					status: "COMPLETED",
					conclusion: "FAILURE",
					completedAt: "2026-01-01T00:01:00Z",
				}),
			]),
		).toEqual({ passing: 1, pending: 0, failing: 1, unknown: 0, hasMore: false });
	});

	test("dedupes status contexts by context name", () => {
		expect(
			tallyGithubStatusChecks([
				{
					__typename: "StatusContext",
					context: "ci/provider",
					state: "FAILURE",
					createdAt: "2026-01-01T00:00:00Z",
				},
				{
					__typename: "StatusContext",
					context: "ci/provider",
					state: "SUCCESS",
					createdAt: "2026-01-01T00:05:00Z",
				},
			]),
		).toEqual({ passing: 1, pending: 0, failing: 0, unknown: 0, hasMore: false });
	});

	test("preserves multiple unknown-identity entries", () => {
		expect(
			tallyGithubStatusChecks([
				{ __typename: "CheckRun", status: "COMPLETED", conclusion: "MYSTERY" },
				{ __typename: "StatusContext", state: "MYSTERY" },
				null,
			]),
		).toEqual({ passing: 0, pending: 0, failing: 0, unknown: 3, hasMore: false });
	});

	test("uses the last returned check when matching identities have no timestamps", () => {
		expect(
			tallyGithubStatusChecks([
				githubCheckRun({
					workflowName: "ci",
					name: "test",
					status: "COMPLETED",
					conclusion: "CANCELLED",
				}),
				githubCheckRun({
					workflowName: "ci",
					name: "test",
					status: "COMPLETED",
					conclusion: "SUCCESS",
				}),
			]),
		).toEqual({ passing: 1, pending: 0, failing: 0, unknown: 0, hasMore: false });
	});
});

interface GithubWorkflowCheckRunFixture {
	readonly workflowName: string;
	readonly workflowRunDatabaseId: number;
	readonly workflowRunUpdatedAt: string;
	readonly name: string;
	readonly status: string;
	readonly conclusion: string;
	readonly completedAt: string;
}

function githubWorkflowCheckRun(fixture: GithubWorkflowCheckRunFixture): unknown {
	return {
		__typename: "CheckRun",
		name: fixture.name,
		status: fixture.status,
		conclusion: fixture.conclusion,
		completedAt: fixture.completedAt,
		checkSuite: {
			workflowRun: {
				databaseId: fixture.workflowRunDatabaseId,
				updatedAt: fixture.workflowRunUpdatedAt,
				workflow: { name: fixture.workflowName },
			},
		},
	};
}
