import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { InMemoryGitGateway } from "@ns/capability-kit/git/testing";
import { describe, expect, test } from "vitest";

import { createRoasterRuntime } from "../../src/core/context.ts";
import {
	buildFindingsCommentMachineState,
	renderFindingsComment,
	summaryMarkerForReview,
	type LastReviewedHeadState,
} from "../../src/core/findings-comment.ts";
import { ROASTER_BOT_LOGIN } from "../../src/core/roaster-bot.ts";
import { runReviewByKey } from "../../src/operations/cli-operations.ts";
import { runRoasterReview } from "../../src/operations/review-run.ts";
import { FakeReviewRunnerGateway } from "../../src/gateways/review-runner.ts";
import { FakeLocalDiffGateway } from "../../src/gateways/local-diff.ts";
import { FakeReviewCatalogGateway } from "../../src/gateways/review-catalog.ts";
import { FakeReviewLogGateway } from "../../src/gateways/review-log.ts";
import { FakeRoasterGitHubGateway } from "../../src/gateways/github.ts";
import {
	createFindingsReview,
	createLocalDiff,
	type PRDiscussionComment,
	type ReviewFinding,
} from "../../src/core/models.ts";
import { fakeRoasterContext } from "../support/fake-roaster-context.ts";

const REVIEW_SOURCE = `---
description: Review TypeScript diffs.
model_profile: deep
---

Flag concrete maintainability issues.
`;

const WARNING_FINDING: ReviewFinding = {
	path: "src/file.ts",
	line: 10,
	severity: "warning",
	summary: "Example finding",
	details: "Example details.",
};

const LAST_REVIEWED_HEAD: LastReviewedHeadState = {
	headSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	baseRef: "main",
	baseMergeBaseSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
};

describe("runRoasterReview", () => {
	test("runs the shared review operation, resolves model profiles, threads excludes, and logs success", async () => {
		const repoRoot = await tempRepoRoot();
		await writeFile(
			join(repoRoot, "ns.toml"),
			'[roaster.diff]\nexclude = ["generated/**"]\n[roaster.model_profiles]\ndeep = "opus"\n',
		);
		const localDiff = new FakeLocalDiffGateway({
			defaultDiff: {
				type: "ok",
				value: createLocalDiff({ baseRef: "main", diffText: "", files: [] }),
			},
		});
		const reviewRunner = new FakeReviewRunnerGateway({
			defaultResult: {
				type: "ok",
				value: {
					payload: createFindingsReview([
						{
							path: "src/file.ts",
							line: 10,
							severity: "warning",
							summary: "Example finding",
							details: "Example details.",
						},
					]),
					usage: null,
					inputCoverage: null,
				},
			},
		});
		const reviewLog = new FakeReviewLogGateway();
		const ctx = createRoasterRuntime(
			fakeRoasterContext({
				gitGateway: gitGateway(repoRoot),
				localDiff,
				reviewCatalog: new FakeReviewCatalogGateway({
					reviewSourcesByKey: { "typescript-style": REVIEW_SOURCE },
				}),
				reviewRunner,
				reviewLog,
				cwd: repoRoot,
			}),
		);

		const outcome = await runRoasterReview(ctx, { key: "typescript-style" });

		expect(outcome.type).toBe("completed");
		if (outcome.type !== "completed") return;
		expect(outcome.result).toMatchObject({
			reviewName: "typescript-style",
			modelProfile: "deep",
			model: "opus",
			baseRef: "main",
			count: 1,
		});
		expect(outcome.progress.modelProfile).toBe("deep");
		expect(reviewRunner.calls()[0]?.request.model).toBe("opus");
		expect(reviewRunner.calls()[0]?.request.reviewDir).toBe("/repo/.ns/reviews/typescript-style");
		expect(localDiff.requestedExcludeGlobs()).toEqual([["generated/**"]]);
		expect(reviewLog.writtenEntries()).toHaveLength(1);
		expect(reviewLog.writtenEntries()[0]?.reviewKey).toBe("typescript-style");
	});

	test("keeps review runs PR-free unless prior-findings PR context is requested", async () => {
		const github = new FakeRoasterGitHubGateway({
			discussionCommentsByPr: new Map([[123, [priorFindingsSummaryComment()]]]),
		});
		const reviewRunner = new FakeReviewRunnerGateway();
		const ctx = createRoasterRuntime(
			fakeRoasterContext({
				reviewCatalog: new FakeReviewCatalogGateway({
					reviewSourcesByKey: { "typescript-style": REVIEW_SOURCE },
				}),
				github,
				reviewRunner,
			}),
		);

		const exit = await runReviewByKey(ctx, { key: "typescript-style" });

		expect(exit.type).toBe("ok");
		expect(github.markerCalls()).toEqual([]);
		expect(github.reviewThreadCalls()).toEqual([]);
		expect(reviewRunner.calls()[0]?.request.priorFindingsContext).toBeUndefined();
	});

	test("gathers prior-findings context for opt-in PR review runs", async () => {
		const github = new FakeRoasterGitHubGateway({
			discussionCommentsByPr: new Map([[123, [priorFindingsSummaryComment()]]]),
		});
		const reviewRunner = new FakeReviewRunnerGateway();
		const stderr: string[] = [];
		const ctx = createRoasterRuntime(
			fakeRoasterContext({
				reviewCatalog: new FakeReviewCatalogGateway({
					reviewSourcesByKey: { "typescript-style": REVIEW_SOURCE },
				}),
				github,
				reviewRunner,
				stderr: (text) => stderr.push(text),
			}),
		);

		const exit = await runReviewByKey(ctx, {
			key: "typescript-style",
			priorFindingsPrNumber: 123,
			priorFindingsCap: 7,
		});

		expect(exit.type).toBe("ok");
		expect(github.markerCalls()).toEqual([
			{
				cwd: "/repo",
				env: {},
				prNumber: 123,
				marker: summaryMarkerForReview("typescript-style"),
				authorLogin: ROASTER_BOT_LOGIN,
			},
		]);
		expect(github.reviewThreadCalls()).toEqual([{ cwd: "/repo", env: {}, prNumber: 123 }]);
		expect(reviewRunner.calls()[0]?.request.priorFindingsContext).toMatchObject({
			prNumber: 123,
			reviewName: "typescript-style",
			cap: 7,
			lastReviewedHead: LAST_REVIEWED_HEAD,
			findings: [{ finding: WARNING_FINDING, resolutionStatus: "unknown" }],
		});
		expect(stderr.join("")).toContain(
			"prior-findings context: loaded 1 findings for PR #123 review typescript-style.",
		);
	});

	test("does not write a review log when the runner fails", async () => {
		const reviewLog = new FakeReviewLogGateway();
		const ctx = createRoasterRuntime(
			fakeRoasterContext({
				reviewCatalog: new FakeReviewCatalogGateway({
					reviewSourcesByKey: { "typescript-style": REVIEW_SOURCE },
				}),
				reviewRunner: new FakeReviewRunnerGateway({
					defaultResult: {
						type: "error",
						error: { type: "review-execution-failed", message: "runner failed" },
					},
				}),
				reviewLog,
			}),
		);

		const outcome = await runRoasterReview(ctx, { key: "typescript-style" });

		expect(outcome).toEqual({
			type: "failed",
			error: { type: "review-execution-failed", message: "runner failed" },
		});
		expect(reviewLog.writtenEntries()).toEqual([]);
	});

	test("returns completed_log_failed when only the Branch Memory review-log write fails", async () => {
		const reviewLog = new FakeReviewLogGateway({
			writeFailure: { type: "review-log-write-failed", message: "brmem put failed" },
		});
		const ctx = createRoasterRuntime(
			fakeRoasterContext({
				reviewCatalog: new FakeReviewCatalogGateway({
					reviewSourcesByKey: { "typescript-style": REVIEW_SOURCE },
				}),
				reviewRunner: new FakeReviewRunnerGateway(),
				reviewLog,
			}),
		);

		const outcome = await runRoasterReview(ctx, { key: "typescript-style" });

		expect(outcome.type).toBe("completed_log_failed");
		if (outcome.type !== "completed_log_failed") return;
		expect(outcome.result.reviewName).toBe("typescript-style");
		expect(outcome.error).toEqual({
			type: "review-log-write-failed",
			message: "brmem put failed",
		});
	});
});

async function tempRepoRoot(): Promise<string> {
	return await mkdtemp(join(tmpdir(), "roaster-review-run-"));
}

function gitGateway(repoRoot: string): InMemoryGitGateway {
	return new InMemoryGitGateway({
		repoRoot,
		optionalRepoRoot: repoRoot,
		currentBranch: "feature",
		trunkBranch: "main",
		originUrl: "git@example.com:repo.git\n",
		headCommit: "abc123",
		existingBranches: ["feature", "main"],
	});
}

function priorFindingsSummaryComment(): PRDiscussionComment & { readonly author: string } {
	const payload = {
		reviewName: "typescript-style",
		baseRef: "main",
		modelProfile: "deep",
		count: 1,
		findings: [WARNING_FINDING],
		inputCoverage: null,
		errorType: null,
		errorMessage: null,
	};
	return {
		id: 1,
		author: ROASTER_BOT_LOGIN,
		body: renderFindingsComment(payload, {
			machineState: buildFindingsCommentMachineState({
				payload,
				lastReviewedHead: LAST_REVIEWED_HEAD,
			}),
		}),
	};
}
