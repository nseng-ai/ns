import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { describe, expect, test } from "vitest";

import { createReviewsRuntime } from "../../src/core/context.ts";
import {
	buildFindingsCommentMachineState,
	renderFindingsComment,
	summaryMarkerForReview,
	type LastReviewedHeadState,
} from "../../src/core/findings-comment.ts";
import { REVIEWS_BOT_LOGIN } from "../../src/core/reviews-bot.ts";
import { runReviewByKey } from "../../src/operations/cli-operations.ts";
import { runReview } from "../../src/operations/review-run.ts";
import { FakeReviewRunnerGateway } from "../../src/gateways/review-runner.ts";
import { FakeLocalDiffGateway } from "../../src/gateways/local-diff.ts";
import { FakeReviewCatalogGateway } from "../../src/gateways/review-catalog.ts";
import { FakeReviewLogGateway } from "../../src/gateways/review-log.ts";
import { FakeGithubPrFeedbackGateway } from "@nseng-ai/extension-kit/github/testing";
import type { GithubPrDiscussionComment } from "@nseng-ai/extension-kit/github/pr-feedback";
import {
	createFindingsReview,
	createLocalDiff,
	type DiffFile,
	type ReviewFinding,
} from "../../src/core/models.ts";
import { fakeReviewsContext } from "../support/fake-reviews-context.ts";
import { githubDiscussionComment } from "../support/github-fixtures.ts";

const REVIEW_SOURCE = `---
description: Review TypeScript diffs.
model_profile: fast
---

Flag concrete maintainability issues.
`;

const DEEP_REVIEW_SOURCE = REVIEW_SOURCE.replace("model_profile: fast", "model_profile: deep");

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

describe("runReview", () => {
	test("runs the shared review operation, resolves model profiles, threads excludes, and logs success", async () => {
		const repoRoot = await tempRepoRoot();
		await writeFile(
			join(repoRoot, "ns.toml"),
			'[reviews.diff]\nexclude = ["generated/**"]\n[models.profiles.fast]\nmodel = "openai-codex/gpt-5.6-luna"\nthinking = "minimal"\n[models.profiles.deep]\nmodel = "anthropic/claude-opus-4-6"\nthinking = "high"\n',
		);
		const localDiff = new FakeLocalDiffGateway({
			defaultDiff: {
				ok: true,
				value: createLocalDiff({ baseRef: "main", diffText: "", files: [] }),
			},
		});
		const reviewRunner = new FakeReviewRunnerGateway({
			defaultResult: {
				ok: true,
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
		const ctx = createReviewsRuntime(
			fakeReviewsContext({
				gitGateway: gitGateway(repoRoot),
				localDiff,
				reviewCatalog: new FakeReviewCatalogGateway({
					reviewSourcesByKey: { "typescript-style": DEEP_REVIEW_SOURCE },
				}),
				reviewRunner,
				reviewLog,
				cwd: repoRoot,
			}),
		);

		const outcome = await runReview(ctx, { key: "typescript-style" });

		expect(outcome.type).toBe("completed");
		if (outcome.type !== "completed") return;
		expect(outcome.result).toMatchObject({
			reviewName: "typescript-style",
			modelProfile: "deep",
			model: "anthropic/claude-opus-4-6",
			baseRef: "main",
			count: 1,
		});
		expect(outcome.progress.modelProfile).toBe("deep");
		expect(reviewRunner.calls()[0]?.request.modelSelection).toEqual({
			provider: "anthropic",
			modelId: "claude-opus-4-6",
			thinking: "high",
		});
		expect(reviewRunner.calls()[0]?.request.reviewDir).toBe("/repo/.ns/reviews/typescript-style");
		expect(localDiff.requestedExcludeGlobs()).toEqual([["generated/**"]]);
		expect(reviewLog.writtenEntries()).toHaveLength(1);
		expect(reviewLog.writtenEntries()[0]?.reviewKey).toBe("typescript-style");
	});

	test("resolves an arbitrary configured profile alias directly", async () => {
		const repoRoot = await tempRepoRoot();
		await writeFile(
			join(repoRoot, "ns.toml"),
			'[models.profiles.fast]\nmodel = "openai-codex/gpt-5.6-luna"\nthinking = "minimal"\n[models.profiles.architecture]\nmodel = "anthropic/claude-opus-4-6"\nthinking = "xhigh"\n',
		);
		const reviewRunner = new FakeReviewRunnerGateway();
		const ctx = createReviewsRuntime(
			fakeReviewsContext({
				gitGateway: gitGateway(repoRoot),
				reviewCatalog: new FakeReviewCatalogGateway({
					reviewSourcesByKey: { "typescript-style": REVIEW_SOURCE },
				}),
				reviewRunner,
				cwd: repoRoot,
			}),
		);

		const outcome = await runReview(ctx, {
			key: "typescript-style",
			modelProfile: "architecture",
		});

		expect(outcome.type).toBe("completed");
		if (outcome.type !== "completed") return;
		expect(outcome.progress.modelProfile).toBe("architecture");
		expect(outcome.progress.model).toBe("anthropic/claude-opus-4-6");
		expect(reviewRunner.calls()[0]?.request.modelSelection).toEqual({
			provider: "anthropic",
			modelId: "claude-opus-4-6",
			thinking: "xhigh",
		});
	});

	test("reports an actionable error for a missing profile alias", async () => {
		const reviewRunner = new FakeReviewRunnerGateway();
		const ctx = createReviewsRuntime(
			fakeReviewsContext({
				reviewCatalog: new FakeReviewCatalogGateway({
					reviewSourcesByKey: { "typescript-style": DEEP_REVIEW_SOURCE },
				}),
				reviewRunner,
			}),
		);

		const outcome = await runReview(ctx, { key: "typescript-style" });

		expect(outcome.type).toBe("failed");
		if (outcome.type === "failed") {
			expect(outcome.error.code).toBe("project-config-invalid");
			expect(outcome.error.message).toContain('"deep" is not configured');
			expect(outcome.error.message).toContain("[models.profiles]");
			expect(outcome.error.message).toContain("--model-profile");
		}
		expect(reviewRunner.calls()).toEqual([]);
	});

	test("retains a qualified OpenAI override in progress, results, runner input, and logs", async () => {
		const reviewRunner = new FakeReviewRunnerGateway();
		const reviewLog = new FakeReviewLogGateway();
		const ctx = createReviewsRuntime(
			fakeReviewsContext({
				reviewCatalog: new FakeReviewCatalogGateway({
					reviewSourcesByKey: { "typescript-style": REVIEW_SOURCE },
				}),
				reviewRunner,
				reviewLog,
			}),
		);

		const outcome = await runReview(ctx, {
			key: "typescript-style",
			model: " openai/gpt-5.6-luna ",
		});

		expect(outcome.type).toBe("completed");
		if (outcome.type !== "completed") return;
		expect(outcome.progress.model).toBe("openai/gpt-5.6-luna");
		expect(outcome.result.model).toBe("openai/gpt-5.6-luna");
		expect(reviewRunner.calls()[0]?.request.modelSelection).toEqual({
			provider: "openai",
			modelId: "gpt-5.6-luna",
			thinking: "minimal",
		});
		expect(reviewLog.writtenEntries()[0]?.content).toContain("openai/gpt-5.6-luna");
	});

	test("rejects an unqualified one-run model override before invoking the runner", async () => {
		const reviewRunner = new FakeReviewRunnerGateway();
		const ctx = createReviewsRuntime(
			fakeReviewsContext({
				reviewCatalog: new FakeReviewCatalogGateway({
					reviewSourcesByKey: { "typescript-style": REVIEW_SOURCE },
				}),
				reviewRunner,
			}),
		);

		const outcome = await runReview(ctx, { key: "typescript-style", model: "haiku" });

		expect(outcome.type).toBe("failed");
		if (outcome.type === "failed") {
			expect(outcome.error.code).toBe("model-not-supported-by-harness");
		}
		expect(reviewRunner.calls()).toEqual([]);
	});

	test("sends only applicability-matching files to the review runner", async () => {
		const tsFile = diffFile(
			"src/file.ts",
			"diff --git a/src/file.ts b/src/file.ts\n+const value = 1;\n",
		);
		const markdownFile = diffFile(
			"download-feedback-instructions.md",
			"diff --git a/download-feedback-instructions.md b/download-feedback-instructions.md\n+# Docs\n",
		);
		const reviewRunner = new FakeReviewRunnerGateway();
		const ctx = createReviewsRuntime(
			fakeReviewsContext({
				localDiff: new FakeLocalDiffGateway({
					defaultDiff: {
						ok: true,
						value: createLocalDiff({
							baseRef: "main",
							diffText: [tsFile.rawText, markdownFile.rawText].join(""),
							files: [tsFile, markdownFile],
						}),
					},
				}),
				reviewCatalog: new FakeReviewCatalogGateway({
					reviewSourcesByKey: {
						"code-smell-reviews":
							"---\n" +
							"description: Review code smells.\n" +
							"applies_to:\n" +
							"  include:\n" +
							"    - '**/*.ts'\n" +
							"    - '**/*.py'\n" +
							"---\n" +
							"\n" +
							"Flag code smells.\n",
					},
				}),
				reviewRunner,
			}),
		);

		const outcome = await runReview(ctx, { key: "code-smell-reviews" });

		expect(outcome.type).toBe("completed");
		expect(reviewRunner.calls()[0]?.request.target.localDiff.changedPaths).toEqual(["src/file.ts"]);
		expect(reviewRunner.calls()[0]?.request.target.localDiff.diffText).toBe(tsFile.rawText);
		if (outcome.type === "completed") expect(outcome.progress.changedPathCount).toBe(1);
	});

	test("keeps review runs PR-free unless prior-findings PR context is requested", async () => {
		const github = new FakeGithubPrFeedbackGateway({
			discussionCommentsByPr: new Map([[123, [priorFindingsSummaryComment()]]]),
		});
		const reviewRunner = new FakeReviewRunnerGateway();
		const ctx = createReviewsRuntime(
			fakeReviewsContext({
				reviewCatalog: new FakeReviewCatalogGateway({
					reviewSourcesByKey: { "typescript-style": REVIEW_SOURCE },
				}),
				github,
				reviewRunner,
			}),
		);

		const exit = await runReviewByKey(ctx, { key: "typescript-style" });

		expect(exit.type).toBe("ok");
		expect(github.markerFindCalls()).toEqual([]);
		expect(github.reviewThreadCalls()).toEqual([]);
		expect(reviewRunner.calls()[0]?.request.priorFindingsContext).toBeUndefined();
	});

	test("gathers prior-findings context for opt-in PR review runs", async () => {
		const github = new FakeGithubPrFeedbackGateway({
			discussionCommentsByPr: new Map([[123, [priorFindingsSummaryComment()]]]),
		});
		const reviewRunner = new FakeReviewRunnerGateway();
		const stderr: string[] = [];
		const ctx = createReviewsRuntime(
			fakeReviewsContext({
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
		expect(github.markerFindCalls()).toEqual([
			{
				cwd: ctx.runScope.cwd,
				env: {},
				prNumber: 123,
				marker: summaryMarkerForReview("typescript-style"),
				authorLogin: REVIEWS_BOT_LOGIN,
			},
		]);
		expect(github.reviewThreadCalls()).toEqual([{ cwd: ctx.runScope.cwd, env: {}, prNumber: 123 }]);
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
		const ctx = createReviewsRuntime(
			fakeReviewsContext({
				reviewCatalog: new FakeReviewCatalogGateway({
					reviewSourcesByKey: { "typescript-style": REVIEW_SOURCE },
				}),
				reviewRunner: new FakeReviewRunnerGateway({
					defaultResult: {
						ok: false,
						error: { code: "review-execution-failed", message: "runner failed" },
					},
				}),
				reviewLog,
			}),
		);

		const outcome = await runReview(ctx, { key: "typescript-style" });

		expect(outcome).toEqual({
			type: "failed",
			error: { code: "review-execution-failed", message: "runner failed" },
		});
		expect(reviewLog.writtenEntries()).toEqual([]);
	});

	test("returns completed_log_failed when only the Branch Memory review-log write fails", async () => {
		const reviewLog = new FakeReviewLogGateway({
			writeFailure: { code: "review-log-write-failed", message: "brmem put failed" },
		});
		const ctx = createReviewsRuntime(
			fakeReviewsContext({
				reviewCatalog: new FakeReviewCatalogGateway({
					reviewSourcesByKey: { "typescript-style": REVIEW_SOURCE },
				}),
				reviewRunner: new FakeReviewRunnerGateway(),
				reviewLog,
			}),
		);

		const outcome = await runReview(ctx, { key: "typescript-style" });

		expect(outcome.type).toBe("completed_log_failed");
		if (outcome.type !== "completed_log_failed") return;
		expect(outcome.result.reviewName).toBe("typescript-style");
		expect(outcome.error).toEqual({
			code: "review-log-write-failed",
			message: "brmem put failed",
		});
	});
});

async function tempRepoRoot(): Promise<string> {
	return await mkdtemp(join(tmpdir(), "reviews-review-run-"));
}

function diffFile(path: string, rawText: string): DiffFile {
	return {
		path,
		oldPath: null,
		changeKind: "modified",
		rawText,
		isBinary: false,
		addedLines: 1,
		removedLines: 0,
		hunkCount: 1,
		byteSize: rawText.length,
		estimatedTokens: 1,
	};
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

function priorFindingsSummaryComment(): GithubPrDiscussionComment {
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
	return githubDiscussionComment({
		id: 1,
		author: REVIEWS_BOT_LOGIN,
		body: renderFindingsComment(payload, {
			machineState: buildFindingsCommentMachineState({
				payload,
				lastReviewedHead: LAST_REVIEWED_HEAD,
			}),
		}),
	});
}
