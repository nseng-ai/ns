import type { GitGateway } from "@ns/capability-kit/git";

import type {
	GithubPrDiscussionComment,
	GithubPrFeedbackGateway,
	GithubPrReview,
	GithubPrReviewThread,
	GithubPrSummary,
} from "../api.ts";

import { readPromptMarkdown, renderPromptTemplate } from "./download-feedback-prompts.ts";
import {
	fetchFeedbackSnapshot,
	reviewsForRequest,
	type FeedbackSnapshot,
} from "./feedback-snapshot.ts";
import { isAutomationLikeDiscussionComment } from "./feedback-summary.ts";
import type { GatewayOptions } from "./gateways.ts";
import {
	resolvePrTarget,
	type PrTargetFailureResult,
	type PrTargetResolution,
} from "./pr-target.ts";
import { buildDownloadFeedbackTargetPayload, type PrTargetPayload } from "./pr-target-payload.ts";

type DownloadFeedbackTargetPayload = PrTargetPayload;

const DOWNLOAD_FEEDBACK_INSTRUCTIONS = renderPromptTemplate(
	readPromptMarkdown("./download-feedback-instructions.md", import.meta.url),
);

export interface DownloadFeedbackCountsPayload {
	includedReviewThreads: number;
	includedReviews: number;
	includedDiscussionComments: number;
	excludedResolvedThreads: number;
	excludedEmptyReviews: number;
	excludedAutomationComments: number;
}

export interface DownloadFeedbackPayload {
	found: boolean;
	target: DownloadFeedbackTargetPayload;
	counts: DownloadFeedbackCountsPayload;
	bodyMarkdown: string;
	instructionsMarkdown: string;
	markdown: string;
}

interface DownloadFeedbackMarkdownParts {
	bodyMarkdown: string;
	instructionsMarkdown: string;
	markdown: string;
}

export type DownloadFeedbackResult =
	| { type: "ok"; feedback: DownloadFeedbackPayload }
	| { type: "miss"; message: string; feedback: DownloadFeedbackPayload }
	| PrTargetFailureResult;

export interface CollectDownloadFeedbackOptions {
	git: GitGateway;
	prFeedback: GithubPrFeedbackGateway;
	gatewayOptions: GatewayOptions;
	prNumber?: number;
	includeResolved: boolean;
	includeAutomation: boolean;
	includeEmptyReviews: boolean;
}

interface IncludedFeedback {
	reviewThreads: readonly GithubPrReviewThread[];
	reviews: readonly GithubPrReview[];
	discussionComments: readonly GithubPrDiscussionComment[];
	counts: DownloadFeedbackCountsPayload;
}

export async function collectDownloadFeedback(
	options: CollectDownloadFeedbackOptions,
): Promise<DownloadFeedbackResult> {
	const target = await resolvePrTarget({
		...options,
		detachedHeadMessage:
			"Detached HEAD: download-feedback requires a checked-out branch or --pr-number.",
	});
	if (target.type === "git_failure") return target;
	if (target.type === "pr_feedback_failure") return target;
	if (target.type === "detached_head") return target;
	if (target.type === "miss") {
		const message = targetMissMessage(target);
		return {
			type: "miss",
			message,
			feedback: buildMissingPrResult(targetMissPayload(target), message),
		};
	}

	const snapshotResult = await fetchFeedbackSnapshot({
		gateway: options.prFeedback,
		gatewayOptions: options.gatewayOptions,
		prNumber: target.pr.number,
	});
	if (snapshotResult.type === "failure") {
		return {
			type: "pr_feedback_failure",
			message: snapshotResult.message,
			failure: snapshotResult.failure,
		};
	}

	const included = selectIncludedFeedback(snapshotResult.snapshot, options);
	const prTarget = targetFromPr(target.pr, target.branch);
	const markdown = buildDownloadFeedbackMarkdown({
		target: prTarget,
		counts: included.counts,
		feedback: included,
	});
	return {
		type: "ok",
		feedback: {
			found: true,
			target: prTarget,
			counts: included.counts,
			...markdown,
		},
	};
}

function targetMissPayload(
	target: Extract<PrTargetResolution, { type: "miss" }>,
): DownloadFeedbackTargetPayload {
	return emptyTarget({
		...(target.prNumber === null ? {} : { prNumber: target.prNumber }),
		...(target.branch === null ? {} : { branch: target.branch }),
	});
}

function targetMissMessage(target: Extract<PrTargetResolution, { type: "miss" }>): string {
	if (target.prNumber !== null) return `No PR found for PR ${target.prNumber}: ${target.stderr}`;
	return `No PR found for branch ${target.branch}: ${target.stderr}`;
}

function selectIncludedFeedback(
	snapshot: FeedbackSnapshot,
	options: CollectDownloadFeedbackOptions,
): IncludedFeedback {
	const reviewThreads = options.includeResolved
		? snapshot.review_threads
		: snapshot.review_threads.filter((thread) => !thread.isResolved);
	const reviews = options.includeEmptyReviews
		? snapshot.reviews
		: reviewsForRequest(snapshot.reviews, false);
	const discussionComments = options.includeAutomation
		? snapshot.discussion_comments
		: snapshot.discussion_comments.filter((comment) => !isAutomationLikeDiscussionComment(comment));
	return {
		reviewThreads,
		reviews,
		discussionComments,
		counts: {
			includedReviewThreads: reviewThreads.length,
			includedReviews: reviews.length,
			includedDiscussionComments: discussionComments.length,
			excludedResolvedThreads: options.includeResolved
				? 0
				: snapshot.review_threads.length - reviewThreads.length,
			excludedEmptyReviews: options.includeEmptyReviews
				? 0
				: snapshot.reviews.length - reviews.length,
			excludedAutomationComments: options.includeAutomation
				? 0
				: snapshot.discussion_comments.length - discussionComments.length,
		},
	};
}

function buildMissingPrResult(
	target: DownloadFeedbackTargetPayload,
	message: string,
): DownloadFeedbackPayload {
	const counts = zeroCounts();
	const bodyMarkdown = [
		message,
		"",
		"No GitHub PR was found for this target. Check out a branch with an open PR or run with `--pr-number <number>`.",
	].join("\n");
	return {
		found: false,
		target,
		counts,
		bodyMarkdown,
		instructionsMarkdown: "",
		markdown: ["# PR feedback triage request", "", bodyMarkdown].join("\n"),
	};
}

function buildDownloadFeedbackMarkdown(options: {
	readonly target: DownloadFeedbackTargetPayload;
	readonly counts: DownloadFeedbackCountsPayload;
	readonly feedback: IncludedFeedback;
}): DownloadFeedbackMarkdownParts {
	const bodyMarkdown = [
		"Downloaded PR feedback is below. Review the summary and instructions at the bottom before responding.",
		"",
		"## Target PR",
		`- PR: ${formatNullableNumber(options.target.pr_number)}`,
		`- Title: ${formatNullable(options.target.title)}`,
		`- URL: ${formatNullable(options.target.url)}`,
		`- Branch: ${formatNullable(options.target.branch)}`,
		`- Head: ${formatNullable(options.target.head_ref_name)}`,
		`- Base: ${formatNullable(options.target.base_ref_name)}`,
		...(hasNoIncludedFeedback(options.counts)
			? ["", "No unresolved/human feedback was found for this PR with the current filters."]
			: []),
		"",
		"## Unresolved review threads",
		...renderReviewThreads(options.feedback.reviewThreads),
		"",
		"## PR-level review bodies",
		...renderReviews(options.feedback.reviews),
		"",
		"## Discussion comments",
		...renderDiscussionComments(options.feedback.discussionComments),
		"",
		...renderDownloadFeedbackSummary(options.target, options.counts),
	].join("\n");
	return {
		bodyMarkdown,
		instructionsMarkdown: DOWNLOAD_FEEDBACK_INSTRUCTIONS,
		markdown: [
			"# PR feedback triage request",
			"",
			bodyMarkdown,
			"",
			DOWNLOAD_FEEDBACK_INSTRUCTIONS,
		].join("\n"),
	};
}

function renderDownloadFeedbackSummary(
	target: DownloadFeedbackTargetPayload,
	counts: DownloadFeedbackCountsPayload,
): string[] {
	return [
		"## Summary",
		`Downloaded feedback for PR #${formatNullableNumber(target.pr_number)}: ${formatNullable(target.title)}`,
		`- URL: ${formatNullable(target.url)}`,
		`- Branch: ${formatNullable(target.branch)}`,
		`- Head: ${formatNullable(target.head_ref_name)}`,
		`- Base: ${formatNullable(target.base_ref_name)}`,
		`- Unresolved review threads included: ${counts.includedReviewThreads}`,
		`- PR-level review bodies included: ${counts.includedReviews}`,
		`- Discussion comments included: ${counts.includedDiscussionComments}`,
		`- Resolved review threads excluded: ${counts.excludedResolvedThreads}`,
		`- Empty PR-level reviews excluded: ${counts.excludedEmptyReviews}`,
		`- Automation-like discussion comments excluded: ${counts.excludedAutomationComments}`,
	];
}

function renderReviewThreads(threads: readonly GithubPrReviewThread[]): string[] {
	if (threads.length === 0) return ["", "No unresolved review threads included."];
	return threads.flatMap((thread, index) => [
		"",
		`### Thread ${index + 1}: ${thread.id}`,
		`- Path: ${thread.path}`,
		`- Line: ${formatNullableNumber(thread.line)}`,
		`- Start line: ${formatNullableNumber(thread.startLine)}`,
		`- Outdated: ${String(thread.isOutdated)}`,
		`- Comment count: ${thread.comments.length}`,
		...thread.comments.flatMap((comment, commentIndex) => [
			"",
			`#### Comment ${commentIndex + 1}: ${comment.id}`,
			`- Author: ${comment.author}`,
			`- Created at: ${comment.createdAt}`,
			`- Path: ${comment.path}`,
			`- Line: ${formatNullableNumber(comment.line)}`,
			`- Start line: ${formatNullableNumber(comment.startLine)}`,
			"",
			...blockquote(comment.body),
		]),
	]);
}

function renderReviews(reviews: readonly GithubPrReview[]): string[] {
	if (reviews.length === 0) return ["", "No non-empty human PR-level review bodies included."];
	return reviews.flatMap((review, index) => [
		"",
		`### Review ${index + 1}: ${review.id}`,
		`- Author: ${review.author}`,
		`- State: ${review.state}`,
		`- Submitted at: ${review.submittedAt ?? "(pending)"}`,
		"",
		...blockquote(review.body),
	]);
}

function renderDiscussionComments(comments: readonly GithubPrDiscussionComment[]): string[] {
	if (comments.length === 0) return ["", "No human-like discussion comments included."];
	return comments.flatMap((comment, index) => [
		"",
		`### Discussion comment ${index + 1}: ${comment.id}`,
		`- Author: ${comment.author}`,
		`- URL: ${comment.url}`,
		"",
		...blockquote(comment.body),
	]);
}

function blockquote(text: string): string[] {
	const lines = text.split(/\r\n|\r|\n/u);
	if (lines.length === 0) return [">"];
	return lines.map((line) => (line === "" ? ">" : `> ${line}`));
}

function hasNoIncludedFeedback(counts: DownloadFeedbackCountsPayload): boolean {
	return (
		counts.includedReviewThreads === 0 &&
		counts.includedReviews === 0 &&
		counts.includedDiscussionComments === 0
	);
}

function targetFromPr(pr: GithubPrSummary, branch: string | null): DownloadFeedbackTargetPayload {
	return buildDownloadFeedbackTargetPayload({ pr, branch });
}

function emptyTarget(options: {
	readonly prNumber?: number;
	readonly branch?: string;
}): DownloadFeedbackTargetPayload {
	return buildDownloadFeedbackTargetPayload({
		pr: null,
		branch: options.branch ?? null,
		...(options.prNumber === undefined ? {} : { prNumber: options.prNumber }),
	});
}

function zeroCounts(): DownloadFeedbackCountsPayload {
	return {
		includedReviewThreads: 0,
		includedReviews: 0,
		includedDiscussionComments: 0,
		excludedResolvedThreads: 0,
		excludedEmptyReviews: 0,
		excludedAutomationComments: 0,
	};
}

function formatNullable(value: string | null): string {
	return value ?? "(unknown)";
}

function formatNullableNumber(value: number | null): string {
	return value === null ? "(unknown)" : String(value);
}
