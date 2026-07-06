import { describe, expect, test } from "vitest";

import type {
	GithubCheckBucket,
	GithubCheckTally,
	GithubPrDiscussionComment,
	GithubPrFeedbackFailure,
	GithubPrFeedbackFailureCode,
	GithubPrFeedbackFailureDetails,
	PrAddressGithubGateway,
	GithubPrFeedbackOperation,
	GithubPrFeedbackOptions,
	GithubPrLookupMiss,
	GithubPrLookupOutcome,
	GithubPrReview,
	GithubPrReviewComment,
	GithubPrReviewThread,
	GithubPrSummary,
	GithubReviewThreadReply,
	GithubReviewThreadState,
	GithubStatusCheckEntry,
	GithubStatusCheckKind,
	GithubStatusChecks,
} from "@nseng-ai/pr-feedback/api";

import {
	InMemoryGithubPrFeedbackGateway,
	discussionComment,
	prSummary,
	review,
	reviewComment,
	reviewThread,
} from "../support/in-memory-pr-address-gateways.ts";

interface CapabilityApiConsumerFixture {
	readonly gateway: PrAddressGithubGateway;
	readonly options: GithubPrFeedbackOptions;
	readonly operation: GithubPrFeedbackOperation;
	readonly failureCode: GithubPrFeedbackFailureCode;
	readonly failureDetails: GithubPrFeedbackFailureDetails;
	readonly failure: GithubPrFeedbackFailure;
	readonly miss: GithubPrLookupMiss;
	readonly lookup: GithubPrLookupOutcome;
	readonly pr: GithubPrSummary;
	readonly review: GithubPrReview;
	readonly reviewComment: GithubPrReviewComment;
	readonly reviewThread: GithubPrReviewThread;
	readonly discussionComment: GithubPrDiscussionComment;
	readonly reply: GithubReviewThreadReply;
	readonly threadState: GithubReviewThreadState;
	readonly checkBucket: GithubCheckBucket;
	readonly checkKind: GithubStatusCheckKind;
	readonly checkEntry: GithubStatusCheckEntry;
	readonly checkTally: GithubCheckTally;
	readonly checks: GithubStatusChecks;
}

function describeCapabilityApiFixture(fixture: CapabilityApiConsumerFixture): string {
	const lookupLabel = fixture.lookup.found ? `PR ${fixture.lookup.pr.number}` : "missing PR";
	return [
		fixture.options.cwd,
		fixture.operation,
		fixture.failureCode,
		fixture.failureDetails.operation,
		fixture.failure.code,
		String(fixture.miss.exitCode),
		lookupLabel,
		fixture.pr.headRefName,
		fixture.review.id,
		String(fixture.reviewComment.id),
		fixture.reviewThread.id,
		String(fixture.discussionComment.id),
		fixture.reply.threadId,
		String(fixture.threadState.isResolved),
		fixture.checkBucket,
		fixture.checkKind,
		fixture.checkEntry.name,
		String(fixture.checkTally.passing),
		String(fixture.checks.checks.length),
		fixture.gateway instanceof InMemoryGithubPrFeedbackGateway ? "fake" : "other",
	].join("|");
}

describe("@nseng-ai/pr-feedback/api boundary", () => {
	test("exposes PR feedback and check payload vocabulary from the Capability API", () => {
		const checkEntry: GithubStatusCheckEntry = {
			bucket: "passing",
			kind: "check_run",
			name: "build",
			workflowName: "CI",
			status: "COMPLETED",
			conclusion: "SUCCESS",
			state: null,
			startedAt: "2026-06-01T00:00:00Z",
			completedAt: "2026-06-01T00:01:00Z",
			createdAt: "2026-06-01T00:00:00Z",
			detailsUrl: "https://github.com/acme/repo/actions/runs/1",
			targetUrl: null,
			identity: "build",
		};
		const checkTally: GithubCheckTally = {
			passing: 1,
			pending: 0,
			failing: 0,
			unknown: 0,
			hasMore: false,
		};
		const failureDetails: GithubPrFeedbackFailureDetails = {
			operation: "getPrChecks",
			stderr: "gh auth failed",
			exitCode: 4,
		};
		const fixture: CapabilityApiConsumerFixture = {
			gateway: new InMemoryGithubPrFeedbackGateway(),
			options: { cwd: "/repo" },
			operation: "getPrChecks",
			failureCode: "github_pr_feedback_gh_failed",
			failureDetails,
			failure: {
				code: "github_pr_feedback_gh_failed",
				message: "gh auth failed",
				details: failureDetails,
			},
			miss: { stderr: "no PR found", exitCode: 1 },
			lookup: { found: true, pr: prSummary({ number: 42, headRefName: "feature/api" }) },
			pr: prSummary({ number: 42, headRefName: "feature/api" }),
			review: review({ id: "PRR_api" }),
			reviewComment: reviewComment({ id: 20 }),
			reviewThread: reviewThread({ id: "PRRT_api" }),
			discussionComment: discussionComment({ id: 30 }),
			reply: { threadId: "PRRT_api", comment: reviewComment({ id: 21 }) },
			threadState: { threadId: "PRRT_api", isResolved: true },
			checkBucket: "passing",
			checkKind: "check_run",
			checkEntry,
			checkTally,
			checks: { counts: checkTally, checks: [checkEntry] },
		};

		expect(describeCapabilityApiFixture(fixture)).toBe(
			"/repo|getPrChecks|github_pr_feedback_gh_failed|getPrChecks|github_pr_feedback_gh_failed|1|PR 42|feature/api|PRR_api|20|PRRT_api|30|PRRT_api|true|passing|check_run|build|1|1|fake",
		);
	});
});
