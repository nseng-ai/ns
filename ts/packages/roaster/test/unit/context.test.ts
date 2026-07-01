import { describe, expect, test } from "vitest";

import { catalogOptions, createRoasterRuntime, environmentOptions } from "../../src/context.ts";
import type { RoasterResult } from "../../src/failures.ts";
import type { ReviewRunnerGateway, RunReviewOptions } from "../../src/gateways/review-runner.ts";
import type {
	FindPrDiscussionCommentByMarkerOptions,
	GitHubGatewayOptions,
	RoasterGitHubGateway,
} from "../../src/gateways/github.ts";
import type { LoadDiffOptions, LocalDiffGateway } from "../../src/gateways/local-diff.ts";
import type { ReviewCatalogGateway } from "../../src/gateways/review-catalog.ts";
import {
	createFindingsReview,
	createLocalDiff,
	type ReviewRunnerRequest,
	type LocalDiff,
	type PRChangedFile,
	type PRDiscussionComment,
	type PRInlineCommentInput,
	type PRReviewComment,
	type ReviewDefinition,
	type ReviewExecutionResponse,
} from "../../src/models.ts";
import { fakeRoasterContext } from "../support/fake-roaster-context.ts";

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

	async loadDiff(options: LoadDiffOptions): Promise<RoasterResult<LocalDiff>> {
		this.calls.push(options);
		return { type: "ok", value: sampleDiff };
	}
}

class RecordingReviewCatalogGateway implements ReviewCatalogGateway {
	readonly listCalls: Parameters<ReviewCatalogGateway["listReviewKeys"]>[0][] = [];
	readonly sourceCalls: Parameters<ReviewCatalogGateway["loadReviewSource"]>[0][] = [];

	async listReviewKeys(
		options: Parameters<ReviewCatalogGateway["listReviewKeys"]>[0],
	): ReturnType<ReviewCatalogGateway["listReviewKeys"]> {
		this.listCalls.push(options);
		return { type: "ok", value: { reviewsDir: "/repo/.sdl/reviews", keys: ["typescript-style"] } };
	}

	async loadReviewSource(
		options: Parameters<ReviewCatalogGateway["loadReviewSource"]>[0],
	): ReturnType<ReviewCatalogGateway["loadReviewSource"]> {
		this.sourceCalls.push(options);
		return {
			type: "ok",
			value: { key: options.key, path: "/repo/.sdl/reviews/type/review.md", source: "" },
		};
	}
}

class RecordingReviewRunnerGateway implements ReviewRunnerGateway {
	readonly calls: { readonly request: ReviewRunnerRequest; readonly options: RunReviewOptions }[] =
		[];

	async runReview(
		request: ReviewRunnerRequest,
		options: RunReviewOptions,
	): Promise<RoasterResult<ReviewExecutionResponse>> {
		this.calls.push({ request, options });
		return {
			type: "ok",
			value: { payload: createFindingsReview([]), usage: null, inputCoverage: null },
		};
	}
}

class RecordingGitHubGateway implements RoasterGitHubGateway {
	readonly optionsCalls: GitHubGatewayOptions[] = [];
	readonly markerCalls: FindPrDiscussionCommentByMarkerOptions[] = [];

	async getPrChangedFiles(
		_prNumber: number,
		options: GitHubGatewayOptions,
	): Promise<RoasterResult<readonly PRChangedFile[]>> {
		this.optionsCalls.push(options);
		return { type: "ok", value: [] };
	}

	async getPrReviewComments(
		_prNumber: number,
		options: GitHubGatewayOptions,
	): Promise<RoasterResult<readonly PRReviewComment[]>> {
		this.optionsCalls.push(options);
		return { type: "ok", value: [] };
	}

	async createPrReview(
		_prNumber: number,
		_comments: readonly PRInlineCommentInput[],
		options: GitHubGatewayOptions,
	): Promise<RoasterResult<void>> {
		this.optionsCalls.push(options);
		return { type: "ok", value: undefined };
	}

	async findPrDiscussionCommentByMarker(
		options: FindPrDiscussionCommentByMarkerOptions,
	): Promise<RoasterResult<PRDiscussionComment | null>> {
		this.markerCalls.push(options);
		return { type: "ok", value: null };
	}

	async addPrDiscussionComment(
		_prNumber: number,
		_body: string,
		options: GitHubGatewayOptions,
	): Promise<RoasterResult<PRDiscussionComment>> {
		this.optionsCalls.push(options);
		return { type: "ok", value: { id: 1, body: "created" } };
	}

	async updatePrDiscussionComment(
		_commentId: number,
		_body: string,
		options: GitHubGatewayOptions,
	): Promise<RoasterResult<PRDiscussionComment>> {
		this.optionsCalls.push(options);
		return { type: "ok", value: { id: 1, body: "updated" } };
	}
}

describe("createRoasterRuntime", () => {
	test("derives operation capabilities from the full CLI context", async () => {
		const localDiff = new RecordingLocalDiffGateway();
		const reviewCatalog = new RecordingReviewCatalogGateway();
		const github = new RecordingGitHubGateway();
		const reviewRunner = new RecordingReviewRunnerGateway();
		const env = { ROASTER_TEST: "1" };
		const signal = new AbortController().signal;
		const stderr: string[] = [];
		const context = fakeRoasterContext({
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

		const ctx = createRoasterRuntime(context);
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
				model: "sonnet",
				reviewDefinition: sampleReviewDefinition,
				reviewDir: "/repo/.sdl/reviews/typescript-style",
				target: { localDiff: sampleDiff },
			},
			runOptions,
		);
		await ctx.github.getPrChangedFiles(47, runOptions);
		await ctx.github.getPrReviewComments(47, runOptions);
		await ctx.github.createPrReview(47, [], runOptions);
		await ctx.github.findPrDiscussionCommentByMarker({
			...runOptions,
			prNumber: 47,
			marker: "<!-- roaster:typescript-style -->",
			authorLogin: "github-actions[bot]",
		});
		await ctx.github.addPrDiscussionComment(47, "body", runOptions);
		await ctx.github.updatePrDiscussionComment(1, "body", runOptions);

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
			marker: "<!-- roaster:typescript-style -->",
			authorLogin: "github-actions[bot]",
		});
		for (const options of github.optionsCalls) {
			expect(options.cwd).toBe("/repo");
			expect(options.env).toBe(env);
			expect(options.signal).toBe(signal);
		}
	});
});
