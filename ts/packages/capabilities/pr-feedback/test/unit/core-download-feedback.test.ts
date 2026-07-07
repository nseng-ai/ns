import { describe, expect, test } from "vitest";

import { InMemoryGitGateway } from "@nseng-ai/capability-kit/git/testing";

import { collectDownloadFeedback } from "../../src/core/download-feedback.ts";
import {
	InMemoryGithubPrFeedbackGateway,
	discussionComment,
	prSummary,
	review,
	reviewThread,
} from "../support/in-memory-pr-address-gateways.ts";

const GATEWAY_OPTIONS = { cwd: "/repo" };

describe("collectDownloadFeedback", () => {
	test("loads current-branch feedback and builds the compatible payload and Markdown", async () => {
		const result = await collectDownloadFeedback({
			git: new InMemoryGitGateway({ currentBranch: "feature/demo" }),
			prFeedback: populatedPrFeedback(),
			gatewayOptions: GATEWAY_OPTIONS,
			includeResolved: false,
			includeAutomation: false,
			includeEmptyReviews: false,
		});

		expect(result.type).toBe("ok");
		if (result.type !== "ok") return;
		expect(result.feedback).toMatchObject({
			found: true,
			target: {
				kind: "github-pr",
				pr_number: 42,
				branch: "feature/demo",
				title: "Add primitive",
				url: "https://example.test/pr/42",
				head_ref_name: "feature/demo",
				base_ref_name: "main",
			},
			counts: {
				includedReviewThreads: 1,
				includedReviews: 1,
				includedDiscussionComments: 1,
				excludedResolvedThreads: 1,
				excludedEmptyReviews: 1,
				excludedAutomationComments: 1,
			},
		});
		expect(result.feedback.markdown).toContain("# PR feedback report");
		expect(result.feedback.markdown).not.toContain("# PR feedback triage request");
		expect(result.feedback.markdown).not.toContain("## Instructions before responding");
		expect(result.feedback.markdown).not.toContain(
			"ns address exec close-review-threads --thread-ids-json",
		);
		expect(result.feedback.markdown).not.toContain("resubmit the PR with `ns flow submit`");
		expect(result.feedback.markdown).toContain("RT_open");
		expect(result.feedback.markdown).not.toContain("RT_resolved");
		expect(result.feedback.markdown).toContain("Please explain the migration path.");
		expect(result.feedback.markdown).toContain("Can we document this?");
		expect(result.feedback.markdown).not.toContain("<!-- roaster: finding -->");
	});

	test("include flags alter selections and counts", async () => {
		const result = await collectDownloadFeedback({
			git: new InMemoryGitGateway({ currentBranch: "feature/demo" }),
			prFeedback: populatedPrFeedback(),
			gatewayOptions: GATEWAY_OPTIONS,
			includeResolved: true,
			includeAutomation: true,
			includeEmptyReviews: true,
		});

		expect(result.type).toBe("ok");
		if (result.type !== "ok") return;
		expect(result.feedback.counts).toEqual({
			includedReviewThreads: 2,
			includedReviews: 2,
			includedDiscussionComments: 2,
			excludedResolvedThreads: 0,
			excludedEmptyReviews: 0,
			excludedAutomationComments: 0,
		});
		expect(result.feedback.markdown).toContain("RT_resolved");
		expect(result.feedback.markdown).toContain("<!-- roaster: finding -->");
		expect(result.feedback.markdown).toContain("### Review 2: R_empty");
	});

	test("uses an explicit PR number without reading the current branch", async () => {
		const git = new InMemoryGitGateway({ currentBranch: { type: "detached" } });
		const result = await collectDownloadFeedback({
			git,
			prFeedback: populatedPrFeedback(),
			gatewayOptions: GATEWAY_OPTIONS,
			prNumber: 42,
			includeResolved: false,
			includeAutomation: false,
			includeEmptyReviews: false,
		});

		expect(result.type).toBe("ok");
		if (result.type !== "ok") return;
		expect(result.feedback.target).toMatchObject({
			pr_number: 42,
			branch: "feature/demo",
		});
		expect(git.currentBranchCalls).toHaveLength(0);
	});

	test("returns a branch miss payload without fetching feedback", async () => {
		const result = await collectDownloadFeedback({
			git: new InMemoryGitGateway({ currentBranch: "feature/missing" }),
			prFeedback: populatedPrFeedback(),
			gatewayOptions: GATEWAY_OPTIONS,
			includeResolved: false,
			includeAutomation: false,
			includeEmptyReviews: false,
		});

		const bodyMarkdown = [
			"No PR found for branch feature/missing: no PR found",
			"",
			"No GitHub PR was found for this target. Check out a branch with an open PR or run with `--pr-number <number>`.",
		].join("\n");
		expect(result).toEqual({
			type: "miss",
			message: "No PR found for branch feature/missing: no PR found",
			feedback: {
				found: false,
				target: {
					kind: "github-pr",
					pr_number: null,
					branch: "feature/missing",
					title: null,
					url: null,
					head_ref_name: null,
					base_ref_name: null,
				},
				counts: zeroCounts(),
				bodyMarkdown,
				markdown: ["# PR feedback report", "", bodyMarkdown].join("\n"),
			},
		});
		expect(result.type).toBe("miss");
		if (result.type !== "miss") return;
		expect(result.feedback.markdown).not.toContain("## Summary");
		expect(result.feedback.markdown).not.toContain("## Instructions before responding");
	});

	test("preserves the requested PR number for an explicit PR miss", async () => {
		const result = await collectDownloadFeedback({
			git: new InMemoryGitGateway(),
			prFeedback: new InMemoryGithubPrFeedbackGateway({ missingPrNumbers: new Set([404]) }),
			gatewayOptions: GATEWAY_OPTIONS,
			prNumber: 404,
			includeResolved: false,
			includeAutomation: false,
			includeEmptyReviews: false,
		});

		expect(result.type).toBe("miss");
		if (result.type !== "miss") return;
		expect(result.message).toBe("No PR found for PR 404: no PR found for PR 404");
		expect(result.feedback.target).toEqual({
			kind: "github-pr",
			pr_number: 404,
			branch: null,
			title: null,
			url: null,
			head_ref_name: null,
			base_ref_name: null,
		});
		expect(result.feedback.counts).toEqual(zeroCounts());
		expect(result.feedback.markdown).toContain("No PR found for PR 404");
	});

	test("returns detached_head when no PR number is provided on a detached HEAD", async () => {
		const result = await collectDownloadFeedback({
			git: new InMemoryGitGateway({ currentBranch: { type: "detached" } }),
			prFeedback: new InMemoryGithubPrFeedbackGateway(),
			gatewayOptions: GATEWAY_OPTIONS,
			includeResolved: false,
			includeAutomation: false,
			includeEmptyReviews: false,
		});

		expect(result).toEqual({
			type: "detached_head",
			message: "Detached HEAD: download-feedback requires a checked-out branch or --pr-number.",
		});
	});

	test("returns a git failure when current branch lookup fails", async () => {
		const result = await collectDownloadFeedback({
			git: new InMemoryGitGateway({
				currentBranch: {
					type: "failure",
					error: { code: "current-branch-failed", message: "branch exploded" },
				},
			}),
			prFeedback: new InMemoryGithubPrFeedbackGateway(),
			gatewayOptions: GATEWAY_OPTIONS,
			includeResolved: false,
			includeAutomation: false,
			includeEmptyReviews: false,
		});

		expect(result).toEqual({
			type: "git_failure",
			message: "Failed to determine current branch",
			failure: { code: "current-branch-failed", message: "branch exploded" },
		});
	});

	test("returns a PR feedback failure when lookup fails", async () => {
		const result = await collectDownloadFeedback({
			git: new InMemoryGitGateway(),
			prFeedback: new InMemoryGithubPrFeedbackGateway({
				lookupFailurePrNumbers: new Set([500]),
			}),
			gatewayOptions: GATEWAY_OPTIONS,
			prNumber: 500,
			includeResolved: false,
			includeAutomation: false,
			includeEmptyReviews: false,
		});

		expect(result).toMatchObject({
			type: "pr_feedback_failure",
			message: "Failed to look up PR 500",
			failure: { details: { operation: "getPr" } },
		});
	});

	test("returns a PR feedback failure when snapshot loading fails", async () => {
		const result = await collectDownloadFeedback({
			git: new InMemoryGitGateway(),
			prFeedback: new InMemoryGithubPrFeedbackGateway({
				prs: [prSummary({ number: 42 })],
				reviewFailurePrNumbers: new Set([42]),
			}),
			gatewayOptions: GATEWAY_OPTIONS,
			prNumber: 42,
			includeResolved: false,
			includeAutomation: false,
			includeEmptyReviews: false,
		});

		expect(result).toMatchObject({
			type: "pr_feedback_failure",
			message: "Failed to fetch reviews for PR 42",
			failure: { details: { operation: "getPrReviews" } },
		});
	});

	test("renders an empty-feedback report", async () => {
		const result = await collectDownloadFeedback({
			git: new InMemoryGitGateway({ currentBranch: "feature/quiet" }),
			prFeedback: new InMemoryGithubPrFeedbackGateway({
				prs: [prSummary({ number: 7, title: "Quiet PR", headRefName: "feature/quiet" })],
			}),
			gatewayOptions: GATEWAY_OPTIONS,
			includeResolved: false,
			includeAutomation: false,
			includeEmptyReviews: false,
		});

		expect(result.type).toBe("ok");
		if (result.type !== "ok") return;
		expect(result.feedback.counts).toEqual(zeroCounts());
		expect(result.feedback.markdown).toContain("No unresolved/human feedback was found");
		expect(result.feedback.markdown).toContain("## Summary");
		expect(result.feedback.markdown).toContain("Downloaded feedback for PR #7: Quiet PR");
		expect(result.feedback.markdown).not.toContain("## Instructions before responding");
	});
});

function populatedPrFeedback(): InMemoryGithubPrFeedbackGateway {
	const pr = prSummary({
		number: 42,
		title: "Add primitive",
		url: "https://example.test/pr/42",
		headRefName: "feature/demo",
		baseRefName: "main",
	});
	return new InMemoryGithubPrFeedbackGateway({
		prs: [pr],
		reviews: {
			42: [
				review({ id: "R_human", body: "Please explain the migration path.", state: "COMMENTED" }),
				review({ id: "R_empty", body: "", state: "APPROVED" }),
			],
		},
		reviewThreads: {
			42: [
				reviewThread({
					id: "RT_open",
					path: "src/app.ts",
					line: 12,
					comments: [
						{
							id: 1,
							body: "Please add tests.",
							author: "alice",
							path: "src/app.ts",
							line: 12,
							startLine: null,
							createdAt: "2026-06-01T00:00:00Z",
						},
					],
				}),
				reviewThread({
					id: "RT_resolved",
					isResolved: true,
					comments: [
						{
							id: 2,
							body: "Resolved nit.",
							author: "bob",
							path: "src/app.ts",
							line: 20,
							startLine: null,
							createdAt: "2026-06-01T00:00:00Z",
						},
					],
				}),
			],
		},
		discussionComments: {
			42: [
				discussionComment({
					id: 10,
					body: "Can we document this?",
					author: "human",
					url: "https://example.test/comment/10",
				}),
				discussionComment({
					id: 11,
					body: "<!-- roaster: finding -->",
					author: "github-actions[bot]",
					url: "https://example.test/comment/11",
				}),
			],
		},
	});
}

function zeroCounts() {
	return {
		includedReviewThreads: 0,
		includedReviews: 0,
		includedDiscussionComments: 0,
		excludedResolvedThreads: 0,
		excludedEmptyReviews: 0,
		excludedAutomationComments: 0,
	};
}
