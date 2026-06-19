import { describe, expect, test } from "vitest";

import {
	InMemoryGithubPrFeedbackGateway,
	InMemoryPrAddressGitGateway,
	discussionComment,
	prSummary,
	review,
	reviewThread,
} from "../support/in-memory-pr-address-gateways.ts";
import { runScenario } from "../support/run-scenario.ts";

function parseEnvelope(stdout: readonly string[]): Record<string, unknown> {
	return JSON.parse(stdout.join("")) as Record<string, unknown>;
}

function dataFrom(runStdout: readonly string[]): Record<string, unknown> {
	const envelope = parseEnvelope(runStdout);
	const data = envelope.data;
	if (typeof data !== "object" || data === null || Array.isArray(data))
		throw new Error("expected envelope data object");
	return data as Record<string, unknown>;
}

function defaultPrFeedback(): InMemoryGithubPrFeedbackGateway {
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

describe("pr-address exec download-feedback", () => {
	test("downloads current-branch PR feedback as a Markdown triage prompt", async () => {
		const run = runScenario(["exec", "download-feedback", "--format", "json"], {
			git: new InMemoryPrAddressGitGateway({ currentBranch: "feature/demo" }),
			prFeedback: defaultPrFeedback(),
		});

		expect(await run.exit).toBe(0);
		const data = dataFrom(run.stdout);
		expect(data.found).toBe(true);
		expect(data.target).toMatchObject({
			pr_number: 42,
			branch: "feature/demo",
			title: "Add primitive",
			url: "https://example.test/pr/42",
		});
		expect(data.counts).toEqual({
			included_review_threads: 1,
			included_reviews: 1,
			included_discussion_comments: 1,
			excluded_resolved_threads: 1,
			excluded_empty_reviews: 1,
			excluded_automation_comments: 1,
		});
		const markdown = data.markdown;
		if (typeof markdown !== "string") throw new Error("expected markdown string");
		expect(markdown).toContain("# PR feedback triage request");
		expect(markdown).toContain(
			"Downloaded PR feedback is below. Review the summary and instructions at the bottom before responding.",
		);
		expect(markdown.indexOf("Triage and group the feedback above")).toBeGreaterThan(
			markdown.indexOf("## Instructions before responding"),
		);
		expect(markdown.indexOf("## Summary")).toBeGreaterThan(
			markdown.indexOf("## Discussion comments"),
		);
		expect(markdown.indexOf("## Instructions before responding")).toBeGreaterThan(
			markdown.indexOf("## Summary"),
		);
		expect(markdown.indexOf("Triage and group the feedback above")).toBeGreaterThan(
			markdown.indexOf("## Summary"),
		);
		expect(markdown.indexOf("Triage and group the feedback below")).toBe(-1);
		expect(markdown.indexOf("Do not edit files yet")).toBeGreaterThan(
			markdown.indexOf("## Instructions before responding"),
		);
		expect(markdown.trim()).toMatch(
			/Do not edit files yet; propose a plan and wait for human confirmation\. Do not resolve or reply to GitHub threads from this prompt\.$/u,
		);
		expect(markdown).toContain("Downloaded feedback for PR #42: Add primitive");
		expect(markdown).toContain("- URL: https://example.test/pr/42");
		expect(markdown).toContain("- Branch: feature/demo");
		expect(markdown).toContain("- Unresolved review threads included: 1");
		expect(markdown).toContain("- PR-level review bodies included: 1");
		expect(markdown).toContain("- Discussion comments included: 1");
		expect(markdown).toContain("- Resolved review threads excluded: 1");
		expect(markdown).toContain("- Empty PR-level reviews excluded: 1");
		expect(markdown).toContain("- Automation-like discussion comments excluded: 1");
		expect(markdown).not.toContain("## Excluded by default");
		expect(markdown).toContain("RT_open");
		expect(markdown).toContain("Please add tests.");
		expect(markdown).not.toContain("RT_resolved");
		expect(markdown).toContain("Please explain the migration path.");
		expect(markdown).toContain("Can we document this?");
		expect(markdown).not.toContain("<!-- roaster: finding -->");
	});

	test("accepts an explicit PR number without a current branch", async () => {
		const run = runScenario(
			["exec", "download-feedback", "--pr-number", "42", "--format", "json"],
			{
				git: new InMemoryPrAddressGitGateway({ currentBranch: null }),
				prFeedback: defaultPrFeedback(),
			},
		);

		expect(await run.exit).toBe(0);
		const data = dataFrom(run.stdout);
		expect(data.target).toMatchObject({ pr_number: 42, branch: "feature/demo" });
	});

	test("returns a negative no-PR report with markdown", async () => {
		const run = runScenario(["exec", "download-feedback", "--format", "json"], {
			git: new InMemoryPrAddressGitGateway({ currentBranch: "feature/missing" }),
			prFeedback: defaultPrFeedback(),
		});

		expect(await run.exit).toBe(0);
		const data = dataFrom(run.stdout);
		expect(data.found).toBe(false);
		expect(data.markdown).toContain("No PR found for branch feature/missing");
		expect(data.markdown).not.toContain("## Summary");
		expect(data.markdown).not.toContain("## Instructions before responding");
		expect(data.markdown).not.toContain("Triage and group the feedback above");
	});

	test("fails clearly on detached HEAD without --pr-number", async () => {
		const run = runScenario(["exec", "download-feedback", "--format", "json"], {
			git: new InMemoryPrAddressGitGateway({ currentBranch: null }),
			prFeedback: defaultPrFeedback(),
		});

		expect(await run.exit).toBe(2);
		const envelope = parseEnvelope(run.stdout);
		expect(envelope.error_type).toBe("detached_head");
		expect(envelope.message).toContain("requires a checked-out branch or --pr-number");
	});

	test("renders an empty-feedback report without mutating", async () => {
		const pr = prSummary({ number: 7, title: "Quiet PR", headRefName: "feature/quiet" });
		const run = runScenario(["exec", "download-feedback", "--format", "json"], {
			git: new InMemoryPrAddressGitGateway({ currentBranch: "feature/quiet" }),
			prFeedback: new InMemoryGithubPrFeedbackGateway({ prs: [pr] }),
		});

		expect(await run.exit).toBe(0);
		const data = dataFrom(run.stdout);
		expect(data.counts).toMatchObject({
			included_review_threads: 0,
			included_reviews: 0,
			included_discussion_comments: 0,
		});
		expect(data.markdown).toContain("No unresolved/human feedback was found");
		expect(data.markdown).toContain("## Summary");
		expect(data.markdown).toContain("Downloaded feedback for PR #7: Quiet PR");
		expect(data.markdown).toContain("- Unresolved review threads included: 0");
		expect(data.markdown).toContain("## Instructions before responding");
	});
});
