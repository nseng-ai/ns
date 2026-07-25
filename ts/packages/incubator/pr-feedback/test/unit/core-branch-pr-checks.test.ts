import { describe, expect, test } from "vitest";

import type { GithubStatusChecks } from "@nseng-ai/pr-feedback/api";

import {
	collectBranchPrChecks,
	type BranchPrChecksFoundEntry,
} from "../../src/core/branch-pr-checks.ts";
import {
	InMemoryGithubPrFeedbackGateway,
	fakePrFeedbackFailure,
	prSummary,
} from "../support/in-memory-pr-address-gateways.ts";

const GATEWAY_OPTIONS = { cwd: "/repo" };

describe("collectBranchPrChecks", () => {
	test("rejects a partial found outcome before deriving PR status", async () => {
		const prFeedback = new InMemoryGithubPrFeedbackGateway({
			prs: [
				prSummary({
					number: 11,
					title: "A",
					url: "https://github.example/pr/11",
					headRefName: "feature-a",
					baseRefName: "main",
					headRefOid: "oid-a",
				}),
			],
			checks: {
				11: {
					counts: { passing: 1, pending: 0, failing: 0, cancelled: 0, unknown: 0, hasMore: true },
					checks: [],
				},
			},
		});

		const result = await collectBranchPrChecks({
			branches: ["feature-a"],
			prFeedback,
			gatewayOptions: GATEWAY_OPTIONS,
		});

		expect(result).toEqual({
			type: "failure",
			message: "Failed to fetch complete branch PR checks",
			failure: {
				code: "github_pr_feedback_response_invalid",
				message:
					"GitHub branch PR checks for branch feature-a (PR 11) have incomplete check pagination.",
				details: { operation: "getBranchPrChecks", prNumber: 11 },
			},
		});
	});

	test("returns found entries in request order with target and check payloads", async () => {
		const prFeedback = new InMemoryGithubPrFeedbackGateway({
			prs: [
				prSummary({
					number: 11,
					title: "A",
					url: "https://github.example/pr/11",
					headRefName: "feature-a",
					baseRefName: "main",
					headRefOid: "oid-a",
				}),
				prSummary({
					number: 12,
					title: "B",
					url: "https://github.example/pr/12",
					headRefName: "feature-b",
					baseRefName: "feature-a",
					headRefOid: "oid-b",
				}),
			],
			checks: {
				11: {
					counts: { passing: 1, pending: 0, failing: 1, cancelled: 0, unknown: 0, hasMore: false },
					checks: [failingCheck()],
				},
			},
		});

		const result = await collectBranchPrChecks({
			branches: ["feature-b", "feature-a"],
			prFeedback,
			gatewayOptions: GATEWAY_OPTIONS,
		});

		expect(result).toEqual({
			type: "ok",
			collection: {
				entries: [
					{
						branch: "feature-b",
						status: "found",
						pr_status: "ready",
						head_commit_committed_at: null,
						review_threads: { total: 0, resolved: 0, unresolved: 0 },
						target: {
							kind: "github-pr",
							pr_number: 12,
							branch: "feature-b",
							title: "B",
							url: "https://github.example/pr/12",
							head_ref_name: "feature-b",
							base_ref_name: "feature-a",
							head_ref_oid: "oid-b",
						},
						counts: {
							passing: 0,
							pending: 0,
							failing: 0,
							cancelled: 0,
							unknown: 0,
							hasMore: false,
						},
						checks: [],
					},
					{
						branch: "feature-a",
						status: "found",
						pr_status: "checks-failing",
						head_commit_committed_at: null,
						review_threads: { total: 0, resolved: 0, unresolved: 0 },
						target: {
							kind: "github-pr",
							pr_number: 11,
							branch: "feature-a",
							title: "A",
							url: "https://github.example/pr/11",
							head_ref_name: "feature-a",
							base_ref_name: "main",
							head_ref_oid: "oid-a",
						},
						counts: {
							passing: 1,
							pending: 0,
							failing: 1,
							cancelled: 0,
							unknown: 0,
							hasMore: false,
						},
						checks: [
							{
								bucket: "failing",
								kind: "check_run",
								name: "unit",
								workflow_name: "CI",
								status: "COMPLETED",
								conclusion: "FAILURE",
								state: null,
								started_at: "2026-06-01T00:00:00Z",
								completed_at: "2026-06-01T00:02:00Z",
								created_at: null,
								details_url: "https://github.com/acme/repo/actions/runs/1",
								target_url: null,
								identity: "check-run:CI:unit",
								freshness: "unknown",
								is_trailing: false,
							},
						],
					},
				],
				summary: { requested: 2, matched: 2, missing: 0, ambiguous: 0 },
			},
		});
	});

	test.each([
		{
			name: "draft wins over current failures and unresolved threads",
			isDraft: true,
			checks: [{ ...failingCheck(), startedAt: "2026-06-01T11:00:00Z" }],
			unresolved: 1,
			expected: "draft",
		},
		{
			name: "a fresh failure fails the current head",
			checks: [{ ...failingCheck(), startedAt: "2026-06-01T11:00:00Z" }],
			expected: "checks-failing",
		},
		{
			name: "a failure with unknown freshness fails conservatively",
			checks: [{ ...failingCheck(), startedAt: "not-a-date" }],
			expected: "checks-failing",
		},
		{
			name: "only stale failures allow unresolved threads to win",
			checks: [{ ...failingCheck(), startedAt: "2026-06-01T09:00:00Z" }],
			unresolved: 1,
			expected: "unresolved",
		},
		{
			name: "only stale failures otherwise allow ready",
			checks: [{ ...failingCheck(), startedAt: "2026-06-01T09:00:00Z" }],
			expected: "ready",
		},
		{
			name: "an ordinary pending check may coexist with ready",
			checks: [pendingCheck({ name: "deploy", identity: "check-run:CI:deploy" })],
			expected: "ready",
		},
		{
			name: "the trailing Graphite pending check may coexist with ready",
			checks: [pendingCheck()],
			expected: "ready",
		},
		{ name: "no checks is ready", checks: [], expected: "ready" },
	] as const)("$name", async ({ isDraft = false, checks, unresolved = 0, expected }) => {
		const entry = await collectFoundEntry({ isDraft, checks, unresolved });
		expect(entry.pr_status).toBe(expected);
	});

	test("derives thread counts and all timestamp freshness rules", async () => {
		const entry = await collectFoundEntry({
			unresolved: 1,
			resolved: 1,
			checks: [
				{ ...failingCheck(), startedAt: "2026-06-01T10:00:00Z" },
				{
					...failingCheck(),
					name: "created fallback",
					startedAt: null,
					createdAt: "2026-06-01T10:01:00Z",
				},
				statusCheck({ name: "legacy", createdAt: "2026-06-01T09:59:00Z" }),
				statusCheck({ name: "missing", createdAt: null }),
				statusCheck({ name: "invalid", createdAt: "invalid" }),
			],
		});

		expect(entry.review_threads).toEqual({ total: 2, resolved: 1, unresolved: 1 });
		expect(entry.checks.map(({ name, freshness }) => ({ name, freshness }))).toEqual([
			{ name: "unit", freshness: "fresh" },
			{ name: "created fallback", freshness: "fresh" },
			{ name: "legacy", freshness: "stale" },
			{ name: "missing", freshness: "unknown" },
			{ name: "invalid", freshness: "unknown" },
		]);

		for (const headCommitCommittedAt of [null, "invalid"] as const) {
			const unknownAnchor = await collectFoundEntry({
				headCommitCommittedAt,
				checks: [statusCheck({ createdAt: "2026-06-01T11:00:00Z" })],
			});
			expect(unknownAnchor.checks[0]?.freshness).toBe("unknown");
		}
	});

	test.each([
		["exact trailing identity", pendingCheck(), true],
		["null identity uses exact name fallback", pendingCheck({ identity: null }), true],
		[
			"non-null mismatching identity prevents name fallback",
			pendingCheck({ identity: "other" }),
			false,
		],
		["non-pending Graphite status is not trailing", statusCheck({ bucket: "passing" }), false],
	] as const)("recognizes %s", async (_name, check, expected) => {
		const entry = await collectFoundEntry({ checks: [check] });
		expect(entry.checks[0]?.is_trailing).toBe(expected);
	});

	test("classifies missing and ambiguous branches alongside found entries", async () => {
		const prFeedback = new InMemoryGithubPrFeedbackGateway({
			prs: [prSummary({ number: 11, headRefName: "feature-a" })],
			ambiguousBranchPrs: {
				doubled: [
					prSummary({ number: 21, headRefName: "doubled", title: "first" }),
					prSummary({ number: 22, headRefName: "doubled", title: "second" }),
				],
			},
		});

		const result = await collectBranchPrChecks({
			branches: ["feature-a", "gone", "doubled"],
			prFeedback,
			gatewayOptions: GATEWAY_OPTIONS,
		});

		expect(result).toMatchObject({
			type: "ok",
			collection: {
				entries: [
					{ branch: "feature-a", status: "found" },
					{ branch: "gone", status: "missing", pr_status: "no-pr" },
					{
						branch: "doubled",
						status: "ambiguous",
						pr_status: null,
						candidates: [
							{ branch: "doubled", pr_number: 21, title: "first" },
							{ branch: "doubled", pr_number: 22, title: "second" },
						],
					},
				],
				summary: { requested: 3, matched: 1, missing: 1, ambiguous: 1 },
			},
		});
	});

	test("propagates gateway failures as a failure result", async () => {
		const result = await collectBranchPrChecks({
			branches: ["feature-a"],
			prFeedback: new InMemoryGithubPrFeedbackGateway({
				branchPrChecksFailure: fakePrFeedbackFailure("gh exploded", "getBranchPrChecks"),
			}),
			gatewayOptions: GATEWAY_OPTIONS,
		});

		expect(result).toMatchObject({
			type: "failure",
			message: "Failed to fetch branch PR checks",
			failure: { code: "github_pr_feedback_gh_failed" },
		});
	});
});

async function collectFoundEntry(options: {
	readonly isDraft?: boolean;
	readonly headCommitCommittedAt?: string | null;
	readonly checks: readonly GithubStatusChecks["checks"][number][];
	readonly resolved?: number;
	readonly unresolved?: number;
}): Promise<BranchPrChecksFoundEntry> {
	const resolved = options.resolved ?? 0;
	const unresolved = options.unresolved ?? 0;
	const result = await collectBranchPrChecks({
		branches: ["feature-a"],
		prFeedback: new InMemoryGithubPrFeedbackGateway({
			prs: [prSummary({ number: 11, headRefName: "feature-a" })],
			branchPrFacts: {
				11: {
					isDraft: options.isDraft ?? false,
					headCommitCommittedAt:
						options.headCommitCommittedAt === undefined
							? "2026-06-01T10:00:00Z"
							: options.headCommitCommittedAt,
				},
			},
			reviewThreads: {
				11: Array.from({ length: resolved + unresolved }, (_, index) => ({
					id: `thread-${index}`,
					path: "a.ts",
					line: 1,
					startLine: null,
					isResolved: index < resolved,
					isOutdated: false,
					comments: [],
				})),
			},
			checks: {
				11: {
					counts: {
						passing: options.checks.filter((check) => check.bucket === "passing").length,
						pending: options.checks.filter((check) => check.bucket === "pending").length,
						failing: options.checks.filter((check) => check.bucket === "failing").length,
						cancelled: options.checks.filter((check) => check.bucket === "cancelled").length,
						unknown: options.checks.filter((check) => check.bucket === "unknown").length,
						hasMore: false,
					},
					checks: options.checks,
				},
			},
		}),
		gatewayOptions: GATEWAY_OPTIONS,
	});
	if (result.type !== "ok" || result.collection.entries[0]?.status !== "found") {
		throw new Error("expected a found branch PR checks entry");
	}
	return result.collection.entries[0];
}

function pendingCheck(
	overrides: Partial<GithubStatusChecks["checks"][number]> = {},
): GithubStatusChecks["checks"][number] {
	return statusCheck({
		bucket: "pending",
		name: "Graphite / mergeability_check",
		identity: "status-context:Graphite / mergeability_check",
		state: "PENDING",
		...overrides,
	});
}

function statusCheck(
	overrides: Partial<GithubStatusChecks["checks"][number]> = {},
): GithubStatusChecks["checks"][number] {
	return {
		...failingCheck(),
		kind: "status_context",
		name: "Graphite / mergeability_check",
		workflowName: null,
		status: null,
		conclusion: null,
		state: "FAILURE",
		startedAt: null,
		completedAt: null,
		createdAt: "2026-06-01T10:00:00Z",
		detailsUrl: null,
		targetUrl: null,
		identity: "status-context:Graphite / mergeability_check",
		...overrides,
	};
}

function failingCheck(): GithubStatusChecks["checks"][number] {
	return {
		bucket: "failing",
		kind: "check_run",
		name: "unit",
		workflowName: "CI",
		status: "COMPLETED",
		conclusion: "FAILURE",
		state: null,
		startedAt: "2026-06-01T00:00:00Z",
		completedAt: "2026-06-01T00:02:00Z",
		createdAt: null,
		detailsUrl: "https://github.com/acme/repo/actions/runs/1",
		targetUrl: null,
		identity: "check-run:CI:unit",
	};
}
