import type {
	GithubPrFeedbackFailure,
	GithubPrFeedbackOptions,
	GithubPrReviewThread,
} from "@nseng-ai/capability-kit/github/pr-feedback";
import { optionalEntry } from "@nseng-ai/foundation/primitives";

import {
	capTrailingRecords,
	inlineMarkerForFinding,
	parseFindingsCommentMachineState,
	summaryMarkerForReview,
	type PriorFindingRecord,
} from "./findings-comment.ts";
import type { GitHubGatewayFailure } from "./failures.ts";
import type { PriorFindingsPromptContext, PriorFindingsPromptContextEntry } from "./models.ts";
import { ROASTER_BOT_LOGIN } from "./roaster-bot.ts";
import type { ReviewsGithubPrFeedbackGateway } from "./context.ts";

export type PriorFindingResolutionStatus = PriorFindingsPromptContextEntry["resolutionStatus"];
export type PriorFindingContextEntry = PriorFindingsPromptContextEntry;
export type PriorFindingsContext = PriorFindingsPromptContext;

type PriorFindingsContextGateway = Pick<
	ReviewsGithubPrFeedbackGateway,
	"findPrDiscussionCommentByMarker" | "getPrReviewThreads"
>;

export type PriorFindingsContextMissingReason =
	| "invalid-cap"
	| "summary-comment-missing"
	| "machine-state-missing"
	| "no-prior-findings"
	| "github-read-failed";

export type GatherPriorFindingsContextResult =
	| { readonly type: "with-context"; readonly context: PriorFindingsPromptContext }
	| {
			readonly type: "without-context";
			readonly reason: PriorFindingsContextMissingReason;
			readonly message: string;
			readonly error?: GitHubGatewayFailure;
	  };

export interface GatherPriorFindingsContextOptions extends GithubPrFeedbackOptions {
	readonly prNumber: number;
	readonly reviewName: string;
	readonly cap: number;
}

export async function gatherPriorFindingsContext(
	gateway: PriorFindingsContextGateway,
	options: GatherPriorFindingsContextOptions,
): Promise<GatherPriorFindingsContextResult> {
	if (!Number.isInteger(options.cap) || options.cap <= 0) {
		return withoutContext(
			"invalid-cap",
			`Prior-findings context cap must be a positive integer; received ${options.cap}.`,
		);
	}

	const githubOptions = copyFeedbackOptions(options);
	const marker = summaryMarkerForReview(options.reviewName);
	const summaryComment = await gateway.findPrDiscussionCommentByMarker({
		...githubOptions,
		prNumber: options.prNumber,
		marker,
		authorLogin: ROASTER_BOT_LOGIN,
	});
	if (!summaryComment.ok) {
		return withoutContext(
			"github-read-failed",
			`Could not read PR discussion comments for prior findings: ${summaryComment.error.message}`,
			githubReadFailure(summaryComment.error),
		);
	}
	if (summaryComment.value === null) {
		return withoutContext(
			"summary-comment-missing",
			`No roaster Findings summary comment for review ${options.reviewName} was found on PR #${options.prNumber}.`,
		);
	}

	const machineState = parseFindingsCommentMachineState(summaryComment.value.body);
	if (machineState === null) {
		return withoutContext(
			"machine-state-missing",
			`The roaster Findings summary comment for review ${options.reviewName} did not contain a parseable roaster-state:v1 block.`,
		);
	}

	const stampedFindings = machineState.priorFindings.findings;
	if (stampedFindings.length === 0) {
		return withoutContext(
			"no-prior-findings",
			`The roaster Findings summary comment for review ${options.reviewName} contained no prior findings.`,
		);
	}

	const reviewThreads = await gateway.getPrReviewThreads({
		...githubOptions,
		prNumber: options.prNumber,
	});
	if (!reviewThreads.ok) {
		return withoutContext(
			"github-read-failed",
			`Could not read PR review threads for prior-finding resolution status: ${reviewThreads.error.message}`,
			githubReadFailure(reviewThreads.error),
		);
	}

	const { kept: cappedFindings, omittedCount: omittedByContextCap } = capTrailingRecords(
		stampedFindings,
		options.cap,
	);
	const context: PriorFindingsPromptContext = {
		prNumber: options.prNumber,
		reviewName: options.reviewName,
		summaryCommentId: summaryComment.value.id,
		lastReviewedHead: machineState.lastReviewedHead,
		cap: options.cap,
		stampedFindingCount: stampedFindings.length,
		omittedByContextCap,
		cumulativePrunedCount: machineState.priorFindings.prunedCount,
		findings: cappedFindings.map((record) =>
			contextEntryForRecord(options.reviewName, record, reviewThreads.value),
		),
	};
	return { type: "with-context", context };
}

function contextEntryForRecord(
	reviewName: string,
	record: PriorFindingRecord,
	reviewThreads: readonly GithubPrReviewThread[],
): PriorFindingContextEntry {
	const marker = inlineMarkerForFinding(reviewName, record.finding);
	const matchingThreads = reviewThreads.filter((thread) =>
		thread.comments.some((comment) => comment.body.includes(marker)),
	);
	return {
		id: record.id,
		finding: record.finding,
		firstSeenHeadSha: record.firstSeenHeadSha,
		lastSeenHeadSha: record.lastSeenHeadSha,
		resolutionStatus: resolutionStatusForThreads(matchingThreads),
		reviewThreadIds: matchingThreads.map((thread) => thread.id),
		hasOutdatedReviewThread: matchingThreads.some((thread) => thread.isOutdated),
	};
}

function resolutionStatusForThreads(
	threads: readonly GithubPrReviewThread[],
): PriorFindingResolutionStatus {
	if (threads.length === 0) return "unknown";
	return threads.some((thread) => !thread.isResolved) ? "unresolved" : "resolved";
}

function copyFeedbackOptions(options: GithubPrFeedbackOptions): GithubPrFeedbackOptions {
	return {
		cwd: options.cwd,
		...optionalEntry("env", options.env),
		...optionalEntry("signal", options.signal),
	};
}

function githubReadFailure(error: GithubPrFeedbackFailure): GitHubGatewayFailure {
	return {
		code: "github-read-failed",
		message: error.message,
		details: { githubCode: error.code },
	};
}

function withoutContext(
	reason: PriorFindingsContextMissingReason,
	message: string,
	error?: GitHubGatewayFailure,
): GatherPriorFindingsContextResult {
	return {
		type: "without-context",
		reason,
		message,
		...optionalEntry("error", error),
	};
}
