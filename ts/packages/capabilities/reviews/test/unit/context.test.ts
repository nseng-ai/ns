import type {
	GithubPrChangedFile,
	GithubPrDiscussionComment,
	GithubPrFeedbackFailure,
	GithubPrFeedbackOptions,
	GithubPrInlineCommentInput,
	GithubPrReviewCommentSummary,
	GithubPrReviewThread,
} from "@nseng-ai/capability-kit/github/pr-feedback";
import type { Result } from "@nseng-ai/foundation/result";
import { describe, expect, test } from "vitest";

import {
	catalogOptions,
	createRealReviewsContext,
	createReviewsRuntime,
	environmentOptions,
	type ReviewsGithubPrFeedbackGateway,
} from "../../src/core/context.ts";
import type { ReviewResult } from "../../src/core/failures.ts";
import {
	RoutingReviewRunner,
	type ReviewRunnerGateway,
	type RunReviewOptions,
} from "../../src/gateways/review-runner.ts";
import type { LoadDiffOptions, LocalDiffGateway } from "../../src/gateways/local-diff.ts";
import type { ReviewCatalogGateway } from "../../src/gateways/review-catalog.ts";
import {
	createFindingsReview,
	createLocalDiff,
	type LocalDiff,
	type ReviewDefinition,
	type ReviewExecutionResponse,
	type ReviewRunnerRequest,
} from "../../src/core/models.ts";
import { fakeReviewsContext } from "../support/fake-reviews-context.ts";

const sampleReviewDefinition: ReviewDefinition = {
	name: "typescript-style",
	description: "Review TypeScript diffs.",
	instructions: "Flag concrete issues.",
	modelProfile: "deep",
	applicability: { include: ["**/*.ts"], exclude: [] },
	localOnly: false,
};

const sampleDiff = createLocalDiff({ baseRef: "main", diffText: "", files: [] });

class RecordingLocalDiffGateway implements LocalDiffGateway {
	readonly calls: LoadDiffOptions[] = [];

	async loadDiff(options: LoadDiffOptions): Promise<ReviewResult<LocalDiff>> {
		this.calls.push(options);
		return { ok: true, value: sampleDiff };
	}
}

class RecordingReviewCatalogGateway implements ReviewCatalogGateway {
	readonly listCalls: Parameters<ReviewCatalogGateway["listReviewKeys"]>[0][] = [];
	readonly sourceCalls: Parameters<ReviewCatalogGateway["loadReviewSource"]>[0][] = [];

	async listReviewKeys(
		options: Parameters<ReviewCatalogGateway["listReviewKeys"]>[0],
	): ReturnType<ReviewCatalogGateway["listReviewKeys"]> {
		this.listCalls.push(options);
		return { ok: true, value: { reviewsDir: "/repo/.ns/reviews", keys: ["typescript-style"] } };
	}

	async loadReviewSource(
		options: Parameters<ReviewCatalogGateway["loadReviewSource"]>[0],
	): ReturnType<ReviewCatalogGateway["loadReviewSource"]> {
		this.sourceCalls.push(options);
		return {
			ok: true,
			value: { key: options.key, path: "/repo/.ns/reviews/type/review.md", source: "" },
		};
	}
}

class RecordingReviewRunnerGateway implements ReviewRunnerGateway {
	readonly calls: { readonly request: ReviewRunnerRequest; readonly options: RunReviewOptions }[] =
		[];

	async runReview(
		request: ReviewRunnerRequest,
		options: RunReviewOptions,
	): Promise<ReviewResult<ReviewExecutionResponse>> {
		this.calls.push({ request, options });
		return {
			ok: true,
			value: { payload: createFindingsReview([]), usage: null, inputCoverage: null },
		};
	}
}

class RecordingGitHubGateway implements ReviewsGithubPrFeedbackGateway {
	readonly optionsCalls: GithubPrFeedbackOptions[] = [];
	readonly markerCalls: Array<
		GithubPrFeedbackOptions & {
			readonly prNumber: number;
			readonly marker: string;
			readonly authorLogin: string;
		}
	> = [];
	readonly reviewThreadCalls: Array<GithubPrFeedbackOptions & { readonly prNumber: number }> = [];

	async getPrChangedFiles(
		params: GithubPrFeedbackOptions & { readonly prNumber: number },
	): Promise<Result<readonly GithubPrChangedFile[], GithubPrFeedbackFailure>> {
		this.optionsCalls.push(params);
		return { ok: true, value: [] };
	}

	async getPrReviewComments(
		params: GithubPrFeedbackOptions & { readonly prNumber: number },
	): Promise<Result<readonly GithubPrReviewCommentSummary[], GithubPrFeedbackFailure>> {
		this.optionsCalls.push(params);
		return { ok: true, value: [] };
	}

	async getPrReviewThreads(
		params: GithubPrFeedbackOptions & { readonly prNumber: number },
	): Promise<Result<readonly GithubPrReviewThread[], GithubPrFeedbackFailure>> {
		this.reviewThreadCalls.push(params);
		return { ok: true, value: [] };
	}

	async createPrReview(
		params: GithubPrFeedbackOptions & {
			readonly prNumber: number;
			readonly comments: readonly GithubPrInlineCommentInput[];
		},
	): Promise<Result<void, GithubPrFeedbackFailure>> {
		this.optionsCalls.push(params);
		return { ok: true, value: undefined };
	}

	async findPrDiscussionCommentByMarker(
		params: GithubPrFeedbackOptions & {
			readonly prNumber: number;
			readonly marker: string;
			readonly authorLogin: string;
		},
	): Promise<Result<GithubPrDiscussionComment | null, GithubPrFeedbackFailure>> {
		this.markerCalls.push(params);
		return { ok: true, value: null };
	}

	async addPrDiscussionComment(
		params: GithubPrFeedbackOptions & { readonly prNumber: number; readonly body: string },
	): Promise<Result<GithubPrDiscussionComment, GithubPrFeedbackFailure>> {
		this.optionsCalls.push(params);
		return { ok: true, value: { id: 1, body: "created", author: "github-actions[bot]", url: "" } };
	}

	async updatePrDiscussionComment(
		params: GithubPrFeedbackOptions & { readonly commentId: number; readonly body: string },
	): Promise<Result<GithubPrDiscussionComment, GithubPrFeedbackFailure>> {
		this.optionsCalls.push(params);
		return { ok: true, value: { id: 1, body: "updated", author: "github-actions[bot]", url: "" } };
	}
}

describe("createRealReviewsContext", () => {
	test("binds the provider-routing real review runner by default", () => {
		const context = createRealReviewsContext({
			cwd: "/repo",
			env: {},
			stdin: async () => "",
			stdout: () => {},
			stderr: () => {},
		});

		expect(context.reviewRunner).toBeInstanceOf(RoutingReviewRunner);
	});
});

describe("createReviewsRuntime", () => {
	test("derives operation capabilities from the full CLI context", async () => {
		const localDiff = new RecordingLocalDiffGateway();
		const reviewCatalog = new RecordingReviewCatalogGateway();
		const github = new RecordingGitHubGateway();
		const reviewRunner = new RecordingReviewRunnerGateway();
		const env = { REVIEWS_TEST: "1" };
		const signal = new AbortController().signal;
		const stderr: string[] = [];
		const context = fakeReviewsContext({
			localDiff,
			reviewCatalog,
			github,
			reviewRunner,
			cwd: "/repo",
			env,
			signal,
			stdin: async () => "envelope",
			stderr: (text) => stderr.push(text),
		});

		const ctx = createReviewsRuntime(context);
		const runOptions = environmentOptions(ctx.runScope);
		const catalogRunOptions = catalogOptions(ctx.runScope);

		expect(ctx.gitGateway).toBe(context.gitGateway);
		expect(ctx.localDiff).toBe(localDiff);
		expect(ctx.reviewCatalog).toBe(reviewCatalog);
		expect(ctx.reviewLog).toBe(context.reviewLog);
		expect(ctx.github).toBe(github);
		expect(ctx.reviewRunner).toBe(reviewRunner);
		expect(ctx.runScope).toEqual({ cwd: "/repo", env, signal });

		await ctx.localDiff.loadDiff({ ...runOptions, baseRef: "origin/main" });
		await ctx.reviewCatalog.listReviewKeys(catalogRunOptions);
		await ctx.reviewCatalog.loadReviewSource({ ...catalogRunOptions, key: "typescript-style" });
		await ctx.reviewRunner.runReview(
			{
				modelSelection: { provider: "anthropic", modelId: "claude-sonnet-4-6" },
				reviewDefinition: sampleReviewDefinition,
				reviewDir: "/repo/.ns/reviews/typescript-style",
				target: { localDiff: sampleDiff },
			},
			runOptions,
		);
		await ctx.github.getPrChangedFiles({ ...runOptions, prNumber: 47 });
		await ctx.github.getPrReviewComments({ ...runOptions, prNumber: 47 });
		await ctx.github.getPrReviewThreads({ ...runOptions, prNumber: 47 });
		await ctx.github.createPrReview({ ...runOptions, prNumber: 47, comments: [] });
		await ctx.github.findPrDiscussionCommentByMarker({
			...runOptions,
			prNumber: 47,
			marker: "<!-- reviews:typescript-style -->",
			authorLogin: "github-actions[bot]",
		});
		await ctx.github.addPrDiscussionComment({ ...runOptions, prNumber: 47, body: "body" });
		await ctx.github.updatePrDiscussionComment({ ...runOptions, commentId: 1, body: "body" });

		ctx.stderr("diagnostic");
		expect(await ctx.stdin()).toBe("envelope");
		expect(stderr).toEqual(["diagnostic"]);
		expect("execApi" in ctx).toBe(false);
		expect("stdout" in ctx).toBe(false);
		expect(localDiff.calls[0]).toMatchObject({ cwd: "/repo", baseRef: "origin/main" });
		expect(localDiff.calls[0]?.env).toBe(env);
		expect(localDiff.calls[0]?.signal).toBe(signal);
		expect(reviewCatalog.listCalls[0]).toEqual({ cwd: "/repo", signal });
		expect(reviewCatalog.sourceCalls[0]).toEqual({ cwd: "/repo", key: "typescript-style", signal });
		expect(reviewRunner.calls[0]?.options).toMatchObject({ cwd: "/repo" });
		expect(reviewRunner.calls[0]?.options.env).toBe(env);
		expect(reviewRunner.calls[0]?.options.signal).toBe(signal);
		expect(github.markerCalls[0]).toEqual({
			cwd: "/repo",
			env,
			signal,
			prNumber: 47,
			marker: "<!-- reviews:typescript-style -->",
			authorLogin: "github-actions[bot]",
		});
		expect(github.reviewThreadCalls[0]).toEqual({ cwd: "/repo", env, signal, prNumber: 47 });
		for (const options of github.optionsCalls) {
			expect(options.cwd).toBe("/repo");
			expect(options.env).toBe(env);
			expect(options.signal).toBe(signal);
		}
	});
});
