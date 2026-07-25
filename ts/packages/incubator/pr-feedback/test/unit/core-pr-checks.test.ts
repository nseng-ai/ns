import { describe, expect, test } from "vitest";

import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import type { GithubStatusChecks } from "@nseng-ai/pr-feedback/api";

import { collectPrChecks } from "../../src/core/pr-checks.ts";
import {
	InMemoryGithubPrFeedbackGateway,
	prSummary,
} from "../support/in-memory-pr-address-gateways.ts";

const GATEWAY_OPTIONS = { cwd: "/repo" };

describe("collectPrChecks", () => {
	test("loads an explicit PR number and normalizes target, counts, and check entries", async () => {
		const pr = prSummary({
			number: 12,
			title: "Add tests",
			url: "https://github.com/acme/repo/pull/12",
			headRefName: "feature/checks",
			baseRefName: "main",
			headRefOid: "abc123",
		});
		const prFeedback = new InMemoryGithubPrFeedbackGateway({
			prs: [pr],
			checks: {
				12: {
					counts: { passing: 1, pending: 2, failing: 3, cancelled: 0, unknown: 4, hasMore: true },
					checks: [fullCheckEntry()],
				},
			},
		});

		const result = await collectPrChecks({
			git: new InMemoryGitGateway(),
			prFeedback,
			gatewayOptions: GATEWAY_OPTIONS,
			prNumber: 12,
		});

		expect(result).toEqual({
			type: "ok",
			checks: {
				found: true,
				target: {
					kind: "github-pr",
					pr_number: 12,
					branch: null,
					title: "Add tests",
					url: "https://github.com/acme/repo/pull/12",
					head_ref_name: "feature/checks",
					base_ref_name: "main",
					head_ref_oid: "abc123",
				},
				counts: { passing: 1, pending: 2, failing: 3, cancelled: 0, unknown: 4, hasMore: true },
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
					},
				],
			},
		});
	});

	test("returns a successful not-found payload for an explicit PR miss", async () => {
		const result = await collectPrChecks({
			git: new InMemoryGitGateway(),
			prFeedback: new InMemoryGithubPrFeedbackGateway({ missingPrNumbers: new Set([404]) }),
			gatewayOptions: GATEWAY_OPTIONS,
			prNumber: 404,
		});

		expect(result).toEqual({
			type: "ok",
			checks: {
				found: false,
				target: {
					kind: "github-pr",
					pr_number: null,
					branch: null,
					title: null,
					url: null,
					head_ref_name: null,
					base_ref_name: null,
					head_ref_oid: null,
				},
				counts: { passing: 0, pending: 0, failing: 0, cancelled: 0, unknown: 0, hasMore: false },
				checks: [],
			},
		});
	});

	test("returns a PR feedback failure when explicit PR lookup fails", async () => {
		const result = await collectPrChecks({
			git: new InMemoryGitGateway(),
			prFeedback: new InMemoryGithubPrFeedbackGateway({
				lookupFailurePrNumbers: new Set([500]),
			}),
			gatewayOptions: GATEWAY_OPTIONS,
			prNumber: 500,
		});

		expect(result).toMatchObject({
			type: "pr_feedback_failure",
			message: "Failed to look up PR 500",
			failure: { details: { operation: "getPr" } },
		});
	});

	test("uses the current branch when no explicit PR number is provided", async () => {
		const prFeedback = new InMemoryGithubPrFeedbackGateway({
			prs: [prSummary({ number: 21, headRefName: "feature/current" })],
			checks: { 21: statusChecks({ passing: 1 }) },
		});

		const result = await collectPrChecks({
			git: new InMemoryGitGateway({ currentBranch: "feature/current" }),
			prFeedback,
			gatewayOptions: GATEWAY_OPTIONS,
		});

		expect(result).toMatchObject({
			type: "ok",
			checks: {
				found: true,
				target: { pr_number: 21, branch: "feature/current" },
				counts: { passing: 1, pending: 0, failing: 0, cancelled: 0, unknown: 0, hasMore: false },
			},
		});
	});

	test("returns a successful not-found payload for a current branch miss", async () => {
		const result = await collectPrChecks({
			git: new InMemoryGitGateway({ currentBranch: "feature/missing" }),
			prFeedback: new InMemoryGithubPrFeedbackGateway(),
			gatewayOptions: GATEWAY_OPTIONS,
		});

		expect(result).toMatchObject({
			type: "ok",
			checks: {
				found: false,
				target: { pr_number: null, branch: "feature/missing" },
				counts: { passing: 0, pending: 0, failing: 0, cancelled: 0, unknown: 0, hasMore: false },
				checks: [],
			},
		});
	});

	test("returns a git failure when current branch lookup fails", async () => {
		const result = await collectPrChecks({
			git: new InMemoryGitGateway({
				currentBranch: {
					type: "failure",
					error: { code: "current-branch-failed", message: "branch exploded" },
				},
			}),
			prFeedback: new InMemoryGithubPrFeedbackGateway(),
			gatewayOptions: GATEWAY_OPTIONS,
		});

		expect(result).toEqual({
			type: "git_failure",
			message: "Failed to determine current branch",
			failure: { code: "current-branch-failed", message: "branch exploded" },
		});
	});

	test("returns detached_head when current branch lookup finds a detached HEAD", async () => {
		const result = await collectPrChecks({
			git: new InMemoryGitGateway({ currentBranch: { type: "detached" } }),
			prFeedback: new InMemoryGithubPrFeedbackGateway(),
			gatewayOptions: GATEWAY_OPTIONS,
		});

		expect(result).toEqual({
			type: "detached_head",
			message: "Detached HEAD: pr-checks requires a checked-out branch or --pr-number.",
		});
	});

	test("returns a PR feedback failure when check loading fails", async () => {
		const result = await collectPrChecks({
			git: new InMemoryGitGateway(),
			prFeedback: new InMemoryGithubPrFeedbackGateway({
				prs: [prSummary({ number: 12 })],
				checksFailurePrNumbers: new Set([12]),
			}),
			gatewayOptions: GATEWAY_OPTIONS,
			prNumber: 12,
		});

		expect(result).toMatchObject({
			type: "pr_feedback_failure",
			message: "Failed to fetch checks for PR 12",
			failure: { details: { operation: "getPrChecks" } },
		});
	});

	test("defaults hasMore to false when the gateway reports no additional checks", async () => {
		const result = await collectPrChecks({
			git: new InMemoryGitGateway(),
			prFeedback: new InMemoryGithubPrFeedbackGateway({
				prs: [prSummary({ number: 13 })],
				checks: { 13: statusChecks({ passing: 1 }) },
			}),
			gatewayOptions: GATEWAY_OPTIONS,
			prNumber: 13,
		});

		expect(result.type).toBe("ok");
		if (result.type !== "ok") return;
		expect(result.checks.counts).toEqual({
			passing: 1,
			pending: 0,
			failing: 0,
			cancelled: 0,
			unknown: 0,
			hasMore: false,
		});
	});
});

function statusChecks(counts: {
	readonly passing?: number;
	readonly pending?: number;
	readonly failing?: number;
	readonly cancelled?: number;
	readonly unknown?: number;
	readonly hasMore?: boolean;
}): GithubStatusChecks {
	return {
		counts: {
			passing: counts.passing ?? 0,
			pending: counts.pending ?? 0,
			failing: counts.failing ?? 0,
			cancelled: counts.cancelled ?? 0,
			unknown: counts.unknown ?? 0,
			hasMore: counts.hasMore ?? false,
		},
		checks: [],
	};
}

function fullCheckEntry(): GithubStatusChecks["checks"][number] {
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
