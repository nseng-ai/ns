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
import {
	gatherPriorFindingsContext,
	type PriorFindingsDiscussionComment,
	type PriorFindingsGatewayFailure,
	type PriorFindingsReviewThread,
} from "../../src/core/prior-findings-context.ts";
import { ROASTER_BOT_LOGIN } from "../../src/core/roaster-bot.ts";
import { FakePriorFindingsContextGithubGateway } from "../support/fake-prior-findings-context-gateway.ts";

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
		const gateway = new FakePriorFindingsContextGithubGateway({
			discussionComments: [summaryComment({ body })],
			reviewThreads: [
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
		const gateway = new FakePriorFindingsContextGithubGateway({
			discussionComments: [summaryComment({ body })],
			reviewThreads: [],
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
		const gateway = new FakePriorFindingsContextGithubGateway({
			discussionComments: [summaryComment({ body: "ordinary comment" })],
			reviewThreads: [],
		});

		const result = await gatherPriorFindingsContext(gateway, request({ cap: 10 }));

		expect(result).toMatchObject({
			type: "without-context",
			reason: "summary-comment-missing",
		});
	});

	test("degrades to context-free review when state parsing fails", async () => {
		const body = `${summaryMarkerForReview("typescript-style")}\n## roaster`;
		const gateway = new FakePriorFindingsContextGithubGateway({
			discussionComments: [summaryComment({ body })],
			reviewThreads: [],
		});

		const result = await gatherPriorFindingsContext(gateway, request({ cap: 10 }));

		expect(result).toMatchObject({
			type: "without-context",
			reason: "machine-state-missing",
		});
	});

	test("degrades to context-free review when review-thread hydration fails", async () => {
		const body = summaryBody([WARNING_FINDING], { reviewName: "typescript-style" });
		const gateway = new FakePriorFindingsContextGithubGateway({
			discussionComments: [summaryComment({ body })],
			reviewThreadsFailure: failure("getPrReviewThreads", "GraphQL failed"),
		});

		const result = await gatherPriorFindingsContext(gateway, request({ cap: 10 }));

		expect(result).toMatchObject({
			type: "without-context",
			reason: "github-read-failed",
			error: { message: "GraphQL failed" },
		});
	});

	test("rejects invalid caps without reading GitHub", async () => {
		const gateway = new FakePriorFindingsContextGithubGateway({
			discussionComments: [summaryComment({ body: "unused" })],
			reviewThreads: [],
		});

		const result = await gatherPriorFindingsContext(gateway, request({ cap: 0 }));

		expect(result).toMatchObject({
			type: "without-context",
			reason: "invalid-cap",
		});
		expect(gateway.calls()).toEqual([]);
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
		modelProfile: "quick",
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

function summaryComment(options: { readonly body: string }): PriorFindingsDiscussionComment {
	return { id: 1, author: ROASTER_BOT_LOGIN, body: options.body };
}

function reviewThread(options: {
	readonly id: string;
	readonly isResolved: boolean;
	readonly body: string;
	readonly isOutdated?: boolean;
}): PriorFindingsReviewThread {
	return {
		id: options.id,
		isResolved: options.isResolved,
		isOutdated: options.isOutdated ?? false,
		comments: [{ body: options.body }],
	};
}

function failure(
	operation: PriorFindingsGatewayFailure["details"]["operation"],
	message: string,
): PriorFindingsGatewayFailure {
	return {
		code: "fake_failure",
		message,
		details: { operation, prNumber: 123 },
	};
}
