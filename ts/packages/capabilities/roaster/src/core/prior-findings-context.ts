import type { ExplicitUndefined } from "@ns/core/primitives";
import type { ErrorInfo, Result } from "@ns/core/result";

import {
	inlineMarkerForFinding,
	parseFindingsCommentBody,
	parseFindingsCommentMachineState,
	summaryMarkerForReview,
	type LastReviewedHeadState,
	type PriorFindingRecord,
} from "./findings-comment.ts";
import type { ReviewFinding } from "./models.ts";
import { ROASTER_BOT_LOGIN } from "./roaster-bot.ts";

export type PriorFindingResolutionStatus = "resolved" | "unresolved" | "unknown";

export interface PriorFindingsGatewayOptions {
	readonly cwd: string;
	readonly env?: ExplicitUndefined<"env-map", NodeJS.ProcessEnv>;
	readonly signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
}

export interface PriorFindingsPrOptions extends PriorFindingsGatewayOptions {
	readonly prNumber: number;
}

export type PriorFindingsGatewayOperation = "getPrDiscussionComments" | "getPrReviewThreads";

export interface PriorFindingsGatewayFailureDetails {
	readonly operation: PriorFindingsGatewayOperation;
	readonly prNumber: number;
	readonly displayCommand?: string;
}

export interface PriorFindingsGatewayFailure extends ErrorInfo<PriorFindingsGatewayFailureDetails> {
	readonly code: string;
	readonly details: PriorFindingsGatewayFailureDetails;
}

export interface PriorFindingsDiscussionComment {
	readonly id: number;
	readonly body: string;
	readonly author: string;
}

export interface PriorFindingsReviewThreadComment {
	readonly body: string;
}

export interface PriorFindingsReviewThread {
	readonly id: string;
	readonly isResolved: boolean;
	readonly isOutdated: boolean;
	readonly comments: readonly PriorFindingsReviewThreadComment[];
}

export interface PriorFindingsContextGithubGateway {
	getPrDiscussionComments(
		options: PriorFindingsPrOptions,
	): Promise<Result<readonly PriorFindingsDiscussionComment[], PriorFindingsGatewayFailure>>;
	getPrReviewThreads(
		options: PriorFindingsPrOptions,
	): Promise<Result<readonly PriorFindingsReviewThread[], PriorFindingsGatewayFailure>>;
}

export interface PriorFindingContextEntry {
	readonly id: string;
	readonly finding: ReviewFinding;
	readonly firstSeenHeadSha: string | null;
	readonly lastSeenHeadSha: string | null;
	readonly resolutionStatus: PriorFindingResolutionStatus;
	readonly reviewThreadIds: readonly string[];
	readonly hasOutdatedReviewThread: boolean;
}

export interface PriorFindingsContext {
	readonly prNumber: number;
	readonly reviewName: string;
	readonly summaryCommentId: number;
	readonly lastReviewedHead: LastReviewedHeadState | null;
	readonly cap: number;
	readonly stampedFindingCount: number;
	readonly omittedByContextCap: number;
	readonly cumulativePrunedCount: number;
	readonly findings: readonly PriorFindingContextEntry[];
}

export type PriorFindingsContextMissingReason =
	| "invalid-cap"
	| "summary-comment-missing"
	| "machine-state-missing"
	| "no-prior-findings"
	| "github-read-failed";

export type GatherPriorFindingsContextResult =
	| { readonly type: "with-context"; readonly context: PriorFindingsContext }
	| {
			readonly type: "without-context";
			readonly reason: PriorFindingsContextMissingReason;
			readonly message: string;
			readonly error?: PriorFindingsGatewayFailure;
	  };

export interface GatherPriorFindingsContextOptions extends PriorFindingsGatewayOptions {
	readonly prNumber: number;
	readonly reviewName: string;
	readonly cap: number;
}

export async function gatherPriorFindingsContext(
	gateway: PriorFindingsContextGithubGateway,
	options: GatherPriorFindingsContextOptions,
): Promise<GatherPriorFindingsContextResult> {
	if (!Number.isInteger(options.cap) || options.cap <= 0) {
		return withoutContext(
			"invalid-cap",
			`Prior-findings context cap must be a positive integer; received ${options.cap}.`,
		);
	}

	const prOptions = prGatewayOptions(options);
	const discussionComments = await gateway.getPrDiscussionComments(prOptions);
	if (!discussionComments.ok) {
		return withoutContext(
			"github-read-failed",
			`Could not read PR discussion comments for prior findings: ${discussionComments.error.message}`,
			discussionComments.error,
		);
	}

	const marker = summaryMarkerForReview(options.reviewName);
	const summaryComment = discussionComments.value.find(
		(comment) => comment.author === ROASTER_BOT_LOGIN && hasSummaryMarker(comment.body, marker),
	);
	if (summaryComment === undefined) {
		return withoutContext(
			"summary-comment-missing",
			`No roaster Findings summary comment for review ${options.reviewName} was found on PR #${options.prNumber}.`,
		);
	}

	const machineState = parseFindingsCommentMachineState(summaryComment.body);
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

	const reviewThreads = await gateway.getPrReviewThreads(prOptions);
	if (!reviewThreads.ok) {
		return withoutContext(
			"github-read-failed",
			`Could not read PR review threads for prior-finding resolution status: ${reviewThreads.error.message}`,
			reviewThreads.error,
		);
	}

	const cappedFindings = stampedFindings.slice(-options.cap);
	return {
		type: "with-context",
		context: {
			prNumber: options.prNumber,
			reviewName: options.reviewName,
			summaryCommentId: summaryComment.id,
			lastReviewedHead: machineState.lastReviewedHead,
			cap: options.cap,
			stampedFindingCount: stampedFindings.length,
			omittedByContextCap: stampedFindings.length - cappedFindings.length,
			cumulativePrunedCount: machineState.priorFindings.prunedCount,
			findings: cappedFindings.map((record) =>
				contextEntryForRecord(options.reviewName, record, reviewThreads.value),
			),
		},
	};
}

function hasSummaryMarker(body: string, marker: string): boolean {
	const parsed = parseFindingsCommentBody(body);
	return parsed.type === "ok" && parsed.parsed.marker === marker;
}

function prGatewayOptions(options: GatherPriorFindingsContextOptions): PriorFindingsPrOptions {
	return {
		cwd: options.cwd,
		prNumber: options.prNumber,
		...(options.env === undefined ? {} : { env: options.env }),
		...(options.signal === undefined ? {} : { signal: options.signal }),
	};
}

function contextEntryForRecord(
	reviewName: string,
	record: PriorFindingRecord,
	reviewThreads: readonly PriorFindingsReviewThread[],
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
	threads: readonly PriorFindingsReviewThread[],
): PriorFindingResolutionStatus {
	if (threads.length === 0) return "unknown";
	return threads.some((thread) => !thread.isResolved) ? "unresolved" : "resolved";
}

function withoutContext(
	reason: PriorFindingsContextMissingReason,
	message: string,
	error?: PriorFindingsGatewayFailure,
): GatherPriorFindingsContextResult {
	return {
		type: "without-context",
		reason,
		message,
		...(error === undefined ? {} : { error }),
	};
}
