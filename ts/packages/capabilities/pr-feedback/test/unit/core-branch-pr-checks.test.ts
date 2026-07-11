import { describe, expect, test } from "vitest";

import type { GithubStatusChecks } from "@nseng-ai/pr-feedback/api";

import { collectBranchPrChecks } from "../../src/core/branch-pr-checks.ts";
import {
	InMemoryGithubPrFeedbackGateway,
	fakePrFeedbackFailure,
	prSummary,
} from "../support/in-memory-pr-address-gateways.ts";

const GATEWAY_OPTIONS = { cwd: "/repo" };

describe("collectBranchPrChecks", () => {
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
					counts: { passing: 1, pending: 0, failing: 1, cancelled: 0, unknown: 0, hasMore: true },
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
						counts: { passing: 1, pending: 0, failing: 1, cancelled: 0, unknown: 0, hasMore: true },
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
				],
				summary: { requested: 2, matched: 2, missing: 0, ambiguous: 0 },
			},
		});
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
					{ branch: "gone", status: "missing" },
					{
						branch: "doubled",
						status: "ambiguous",
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
