import { describe, expect, test } from "vitest";

import type { GithubPrFeedbackFailure } from "@sdl/address/api";

import { mapBranchesToOpenPrs } from "../../src/core/branch-pr-mapping.ts";
import {
	InMemoryGithubPrFeedbackGateway,
	prSummary,
} from "../support/in-memory-pr-address-gateways.ts";

const GATEWAY_OPTIONS = { cwd: "/repo" };

function branchPrFeedback(): InMemoryGithubPrFeedbackGateway {
	return new InMemoryGithubPrFeedbackGateway({
		prs: [
			prSummary({
				number: 11,
				headRefName: "feature-a",
				baseRefName: "main",
				title: "A",
				url: "https://github.example/pr/11",
			}),
			prSummary({
				number: 12,
				headRefName: "feature-b",
				baseRefName: "feature-a",
				title: "B",
				url: "https://github.example/pr/12",
			}),
			prSummary({ number: 13, headRefName: "feature-merged", state: "MERGED" }),
		],
	});
}

describe("branch-to-PR mapping core", () => {
	test("maps requested branches to open PRs in request order", async () => {
		const result = await mapBranchesToOpenPrs({
			branches: ["feature-b", "feature-a"],
			prFeedback: branchPrFeedback(),
			gatewayOptions: GATEWAY_OPTIONS,
		});

		expect(result).toEqual({
			type: "ok",
			mapping: {
				branch_prs: [
					{
						branch: "feature-b",
						pr_number: 12,
						title: "B",
						url: "https://github.example/pr/12",
						head_ref_name: "feature-b",
						base_ref_name: "feature-a",
					},
					{
						branch: "feature-a",
						pr_number: 11,
						title: "A",
						url: "https://github.example/pr/11",
						head_ref_name: "feature-a",
						base_ref_name: "main",
					},
				],
				missing_branches: [],
				ambiguous_branches: [],
				summary: { requested: 2, matched: 2, missing: 0, ambiguous: 0 },
			},
		});
	});

	test("records missing branches and ignores non-open PRs", async () => {
		const result = await mapBranchesToOpenPrs({
			branches: ["feature-a", "no-such-branch", "feature-merged"],
			prFeedback: branchPrFeedback(),
			gatewayOptions: GATEWAY_OPTIONS,
		});

		expect(result).toMatchObject({
			type: "ok",
			mapping: {
				branch_prs: [expect.objectContaining({ branch: "feature-a", pr_number: 11 })],
				missing_branches: ["no-such-branch", "feature-merged"],
				ambiguous_branches: [],
				summary: { requested: 3, matched: 1, missing: 2, ambiguous: 0 },
			},
		});
	});

	test("records ambiguous branches when multiple open PRs share a head branch", async () => {
		const result = await mapBranchesToOpenPrs({
			branches: ["feature-shared"],
			prFeedback: new InMemoryGithubPrFeedbackGateway({
				prs: [
					prSummary({ number: 30, headRefName: "feature-shared" }),
					prSummary({ number: 21, headRefName: "feature-shared" }),
				],
			}),
			gatewayOptions: GATEWAY_OPTIONS,
		});

		expect(result).toMatchObject({
			type: "ok",
			mapping: {
				branch_prs: [],
				missing_branches: [],
				ambiguous_branches: [
					{
						branch: "feature-shared",
						candidates: expect.arrayContaining([
							expect.objectContaining({ branch: "feature-shared", pr_number: 30 }),
							expect.objectContaining({ branch: "feature-shared", pr_number: 21 }),
						]),
					},
				],
				summary: { requested: 1, matched: 0, missing: 0, ambiguous: 1 },
			},
		});
	});

	test("computes mixed summary counts", async () => {
		const result = await mapBranchesToOpenPrs({
			branches: ["feature-a", "feature-shared", "missing"],
			prFeedback: new InMemoryGithubPrFeedbackGateway({
				prs: [
					prSummary({ number: 11, headRefName: "feature-a" }),
					prSummary({ number: 30, headRefName: "feature-shared" }),
					prSummary({ number: 21, headRefName: "feature-shared" }),
				],
			}),
			gatewayOptions: GATEWAY_OPTIONS,
		});

		expect(result).toMatchObject({
			type: "ok",
			mapping: {
				branch_prs: [expect.objectContaining({ branch: "feature-a" })],
				missing_branches: ["missing"],
				ambiguous_branches: [expect.objectContaining({ branch: "feature-shared" })],
				summary: { requested: 3, matched: 1, missing: 1, ambiguous: 1 },
			},
		});
	});

	test("returns gateway failures as data for the adapter", async () => {
		const failure = {
			code: "github_pr_feedback_gh_failed",
			message: "gh: network down",
			details: { operation: "listOpenPrs", stderr: "gh: network down", stdout: "", exitCode: 1 },
		} satisfies GithubPrFeedbackFailure;

		const result = await mapBranchesToOpenPrs({
			branches: ["feature-a"],
			prFeedback: new InMemoryGithubPrFeedbackGateway({ listOpenPrsFailure: failure }),
			gatewayOptions: GATEWAY_OPTIONS,
		});

		expect(result).toEqual({
			type: "failure",
			message: "Failed to list open PRs",
			failure,
		});
	});
});
