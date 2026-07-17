import type {
	GithubPrDiscussionComment,
	GithubPrFeedbackFailure,
	GithubPrReviewThread,
} from "@nseng-ai/capability-kit/github/pr-feedback";
import {
	FakeGithubPrFeedbackGateway,
	type FakeGithubPrFeedbackGatewayOptions,
	type FakeGithubPrReviewThreadCall,
} from "@nseng-ai/capability-kit/github/testing";
import type { Result } from "@nseng-ai/foundation/result";
import { describe, expect, test } from "vitest";

import {
	buildFindingsCommentMachineState,
	inlineMarkerForFinding,
	renderFindingsComment,
	summaryMarkerForReview,
	type FindingsPayload,
	type LastReviewedHeadState,
} from "../../src/core/findings-comment.ts";
import type { ReviewFinding } from "../../src/core/models.ts";
import { gatherPriorFindingsContext } from "../../src/core/prior-findings-context.ts";
import { REVIEWS_BOT_LOGIN } from "../../src/core/reviews-bot.ts";
import { githubDiscussionComment } from "../support/github-fixtures.ts";

const LAST_REVIEWED_HEAD: LastReviewedHeadState = {
	headSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	baseRef: "main",
	baseMergeBaseSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
};

const WARNING_FINDING: ReviewFinding = {
	path: "src/app.ts",
	line: 12,
	severity: "warning",
	summary: "Avoid broad casts",
	details: "Validate the payload before casting it.",
};

const INFO_FINDING: ReviewFinding = {
	path: "src/other.ts",
	line: 5,
	severity: "info",
	summary: "Use a clearer name",
	details: "The name hides the domain concept.",
};

const ERROR_FINDING: ReviewFinding = {
	path: "src/final.ts",
	line: 30,
	severity: "error",
	summary: "Handle the error result",
	details: "The gateway error is ignored.",
};

describe("gatherPriorFindingsContext", () => {
	test("reads stamped prior findings and hydrates review-thread resolution status", async () => {
		const body = summaryBody([WARNING_FINDING, INFO_FINDING], { reviewName: "typescript-style" });
		const gateway = new FakeGithubPrFeedbackGateway({
			discussionCommentsByPr: new Map([[123, [summaryComment({ body })]]]),
			reviewThreadsByPr: new Map([
				[
					123,
					[
						reviewThread({
							id: "thread-resolved",
							isResolved: true,
							body: inlineMarkerForFinding("typescript-style", WARNING_FINDING),
						}),
						reviewThread({
							id: "thread-unresolved",
							isResolved: false,
							body: inlineMarkerForFinding("typescript-style", INFO_FINDING),
						}),
					],
				],
			]),
		});

		const result = await gatherPriorFindingsContext(gateway, request({ cap: 10 }));

		expect(result.type).toBe("with-context");
		if (result.type !== "with-context") return;
		expect(result.context).toMatchObject({
			prNumber: 123,
			reviewName: "typescript-style",
			summaryCommentId: 1,
			lastReviewedHead: LAST_REVIEWED_HEAD,
			cap: 10,
			stampedFindingCount: 2,
			omittedByContextCap: 0,
			cumulativePrunedCount: 0,
		});
		expect(result.context.findings.map((entry) => entry.finding.summary)).toEqual([
			"Avoid broad casts",
			"Use a clearer name",
		]);
		expect(result.context.findings.map((entry) => entry.resolutionStatus)).toEqual([
			"resolved",
			"unresolved",
		]);
		expect(result.context.findings.map((entry) => entry.reviewThreadIds)).toEqual([
			["thread-resolved"],
			["thread-unresolved"],
		]);
	});

	test("enforces the explicit context cap over the newest stamped records", async () => {
		const body = summaryBody([WARNING_FINDING, INFO_FINDING, ERROR_FINDING], {
			reviewName: "typescript-style",
		});
		const gateway = new FakeGithubPrFeedbackGateway({
			discussionCommentsByPr: new Map([[123, [summaryComment({ body })]]]),
			reviewThreadsByPr: new Map([[123, []]]),
		});

		const result = await gatherPriorFindingsContext(gateway, request({ cap: 2 }));

		expect(result.type).toBe("with-context");
		if (result.type !== "with-context") return;
		expect(result.context.stampedFindingCount).toBe(3);
		expect(result.context.omittedByContextCap).toBe(1);
		expect(result.context.findings.map((entry) => entry.finding.summary)).toEqual([
			"Use a clearer name",
			"Handle the error result",
		]);
		expect(result.context.findings.map((entry) => entry.resolutionStatus)).toEqual([
			"unknown",
			"unknown",
		]);
	});

	test("degrades to context-free review when the summary comment is missing", async () => {
		const gateway = new FakeGithubPrFeedbackGateway({
			discussionCommentsByPr: new Map([[123, [summaryComment({ body: "ordinary comment" })]]]),
			reviewThreadsByPr: new Map([[123, []]]),
		});

		const result = await gatherPriorFindingsContext(gateway, request({ cap: 10 }));

		expect(result).toMatchObject({
			type: "without-context",
			reason: "summary-comment-missing",
		});
	});

	test("degrades to context-free review when state parsing fails", async () => {
		const body = `${summaryMarkerForReview("typescript-style")}\n## reviews`;
		const gateway = new FakeGithubPrFeedbackGateway({
			discussionCommentsByPr: new Map([[123, [summaryComment({ body })]]]),
			reviewThreadsByPr: new Map([[123, []]]),
		});

		const result = await gatherPriorFindingsContext(gateway, request({ cap: 10 }));

		expect(result).toMatchObject({
			type: "without-context",
			reason: "machine-state-missing",
		});
	});

	test("degrades to context-free review when review-thread hydration fails", async () => {
		const body = summaryBody([WARNING_FINDING], { reviewName: "typescript-style" });
		const gateway = new FailingReviewThreadsGateway({
			discussionCommentsByPr: new Map([[123, [summaryComment({ body })]]]),
			threadsFailure: {
				code: "github_pr_feedback_graphql_failed",
				message: "GraphQL failed",
				details: { operation: "getPrReviewThreads" },
			},
		});

		const result = await gatherPriorFindingsContext(gateway, request({ cap: 10 }));

		expect(result).toMatchObject({
			type: "without-context",
			reason: "github-read-failed",
			error: {
				code: "github-read-failed",
				message: expect.stringContaining("GraphQL failed"),
				details: { githubCode: "github_pr_feedback_graphql_failed" },
			},
		});
	});

	test("rejects invalid caps without reading GitHub", async () => {
		const gateway = new FakeGithubPrFeedbackGateway({
			discussionCommentsByPr: new Map([[123, [summaryComment({ body: "unused" })]]]),
			reviewThreadsByPr: new Map([[123, []]]),
		});

		const result = await gatherPriorFindingsContext(gateway, request({ cap: 0 }));

		expect(result).toMatchObject({
			type: "without-context",
			reason: "invalid-cap",
		});
		expect(gateway.markerFindCalls()).toEqual([]);
		expect(gateway.reviewThreadCalls()).toEqual([]);
	});
});

function summaryBody(
	findings: readonly ReviewFinding[],
	options: { readonly reviewName: string },
): string {
	const payload = findingsPayload({ findings, reviewName: options.reviewName });
	const machineState = buildFindingsCommentMachineState({
		payload,
		lastReviewedHead: LAST_REVIEWED_HEAD,
	});
	return renderFindingsComment(payload, { machineState });
}

function findingsPayload(options: {
	readonly findings: readonly ReviewFinding[];
	readonly reviewName: string;
}): FindingsPayload {
	return {
		reviewName: options.reviewName,
		baseRef: "main",
		modelProfile: "fast",
		count: options.findings.length,
		findings: options.findings,
		inputCoverage: null,
		errorType: null,
		errorMessage: null,
	};
}

function request(options: { readonly cap: number }) {
	return {
		cwd: "/repo",
		prNumber: 123,
		reviewName: "typescript-style",
		cap: options.cap,
	};
}

function summaryComment(options: { readonly body: string }): GithubPrDiscussionComment {
	return githubDiscussionComment({ id: 1, author: REVIEWS_BOT_LOGIN, body: options.body });
}

function reviewThread(options: {
	readonly id: string;
	readonly isResolved: boolean;
	readonly body: string;
	readonly isOutdated?: boolean;
}): GithubPrReviewThread {
	return {
		id: options.id,
		path: "src/app.ts",
		line: 12,
		startLine: null,
		isResolved: options.isResolved,
		isOutdated: options.isOutdated ?? false,
		comments: [
			{
				id: 1,
				body: options.body,
				author: REVIEWS_BOT_LOGIN,
				path: "src/app.ts",
				line: 12,
				startLine: null,
				createdAt: "2026-01-01T00:00:00Z",
			},
		],
	};
}

class FailingReviewThreadsGateway extends FakeGithubPrFeedbackGateway {
	private readonly threadsFailure: GithubPrFeedbackFailure;

	constructor(
		options: FakeGithubPrFeedbackGatewayOptions & {
			readonly threadsFailure: GithubPrFeedbackFailure;
		},
	) {
		const { threadsFailure, ...rest } = options;
		super(rest);
		this.threadsFailure = threadsFailure;
	}

	override async getPrReviewThreads(
		params: FakeGithubPrReviewThreadCall,
	): Promise<Result<readonly GithubPrReviewThread[], GithubPrFeedbackFailure>> {
		await super.getPrReviewThreads(params);
		return { ok: false, error: this.threadsFailure };
	}
}
