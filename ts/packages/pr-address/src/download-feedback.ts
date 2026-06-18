import { z } from "zod";

import { failure, negative, ok, type ClinkrExit } from "@asdl/clinkr";
import {
	fetchFeedbackSnapshot,
	reviewsForRequest,
	type FeedbackSnapshot,
} from "./core/feedback-snapshot.ts";
import { isAutomationLikeDiscussionComment } from "./core/feedback-summary.ts";
import {
	defineExecOperation,
	gatewayFailureExit,
	gatewayFailureMessage,
	gatewayOptions,
	type PrAddressExecContext,
} from "./exec-operation.ts";
import type { PRDiscussionComment, PRReview, PRReviewThread, PRSummary } from "./gateways.ts";

const downloadFeedbackParseSchema = z.object({
	pr_number: z.int().optional(),
	include_resolved: z.boolean().default(false),
	include_automation: z.boolean().default(false),
	include_empty_reviews: z.boolean().default(false),
});

type DownloadFeedbackRequest = z.output<typeof downloadFeedbackParseSchema>;

interface DownloadFeedbackTarget {
	kind: "github_pr";
	pr_number: number | null;
	branch: string | null;
	title: string | null;
	url: string | null;
	head_ref_name: string | null;
	base_ref_name: string | null;
}

interface DownloadFeedbackCounts {
	included_review_threads: number;
	included_reviews: number;
	included_discussion_comments: number;
	excluded_resolved_threads: number;
	excluded_empty_reviews: number;
	excluded_automation_comments: number;
}

interface DownloadFeedbackResult {
	found: boolean;
	target: DownloadFeedbackTarget;
	counts: DownloadFeedbackCounts;
	markdown: string;
}

interface IncludedFeedback {
	reviewThreads: readonly PRReviewThread[];
	reviews: readonly PRReview[];
	discussionComments: readonly PRDiscussionComment[];
	counts: DownloadFeedbackCounts;
}

export const downloadFeedbackOperation = defineExecOperation({
	isRepoContextRequired: true,
	spec: {
		name: "download-feedback",
		description: "Download current PR feedback as an LM-ready Markdown triage prompt.",
		schema: downloadFeedbackParseSchema,
		handler: runDownloadFeedbackOperation,
	},
});

async function runDownloadFeedbackOperation(
	ctx: PrAddressExecContext,
	request: DownloadFeedbackRequest,
): Promise<ClinkrExit<unknown>> {
	const targetResult = await resolveTargetPr(ctx, request);
	if (targetResult.type === "failure") return targetResult.exit;
	if (targetResult.type === "miss") {
		return negative(
			targetResult.message,
			buildMissingPrResult(targetResult.target, targetResult.message),
		);
	}

	const snapshotResult = await fetchFeedbackSnapshot({
		gateway: ctx.context.github,
		gatewayOptions: gatewayOptions(ctx),
		prNumber: targetResult.pr.number,
		shouldIncludeResolved: request.include_resolved,
		shouldIncludeEmptyReviews: true,
		shouldCountAllReviewThreads: true,
	});
	if (snapshotResult.type === "failure")
		return gatewayFailureExit(snapshotResult.message, snapshotResult.failure);

	const included = selectIncludedFeedback(snapshotResult.snapshot, request);
	const target = targetFromPr(targetResult.pr, targetResult.branch);
	return ok({
		found: true,
		target,
		counts: included.counts,
		markdown: buildDownloadFeedbackMarkdown({
			target,
			counts: included.counts,
			feedback: included,
		}),
	} satisfies DownloadFeedbackResult);
}

type TargetPrResult =
	| { type: "found"; pr: PRSummary; branch: string | null }
	| { type: "miss"; target: DownloadFeedbackTarget; message: string }
	| { type: "failure"; exit: ClinkrExit<unknown> };

async function resolveTargetPr(
	ctx: PrAddressExecContext,
	request: DownloadFeedbackRequest,
): Promise<TargetPrResult> {
	const github = ctx.context.github;
	if (request.pr_number !== undefined) {
		const lookupResult = await github.getPr(request.pr_number, gatewayOptions(ctx));
		if (lookupResult.type === "failure")
			return {
				type: "failure",
				exit: failure(
					"pr_gateway_failure",
					gatewayFailureMessage(`Failed to look up PR ${request.pr_number}`, lookupResult.failure),
				),
			};
		if (lookupResult.type === "miss") {
			return {
				type: "miss",
				target: emptyTarget({ prNumber: request.pr_number }),
				message: `No PR found for PR ${request.pr_number}: ${lookupResult.stderr}`,
			};
		}
		return { type: "found", pr: lookupResult.pr, branch: null };
	}

	const branchResult = await ctx.context.git.getCurrentBranch(gatewayOptions(ctx));
	if (branchResult.type === "failure")
		return {
			type: "failure",
			exit: gatewayFailureExit("Failed to determine current branch", branchResult.failure),
		};
	if (branchResult.type === "detached") {
		return {
			type: "failure",
			exit: failure(
				"detached_head",
				"Detached HEAD: download-feedback requires a checked-out branch or --pr-number.",
			),
		};
	}

	const lookupResult = await github.getPrForBranch(branchResult.branch, gatewayOptions(ctx));
	if (lookupResult.type === "failure")
		return {
			type: "failure",
			exit: failure(
				"pr_gateway_failure",
				gatewayFailureMessage(
					`Failed to look up PR for branch ${branchResult.branch}`,
					lookupResult.failure,
				),
			),
		};
	if (lookupResult.type === "miss") {
		return {
			type: "miss",
			target: emptyTarget({ branch: branchResult.branch }),
			message: `No PR found for branch ${branchResult.branch}: ${lookupResult.stderr}`,
		};
	}
	return { type: "found", pr: lookupResult.pr, branch: branchResult.branch };
}

function selectIncludedFeedback(
	snapshot: FeedbackSnapshot,
	request: DownloadFeedbackRequest,
): IncludedFeedback {
	const reviews = request.include_empty_reviews
		? snapshot.reviews
		: reviewsForRequest(snapshot.reviews, false);
	const discussionComments = request.include_automation
		? snapshot.discussion_comments
		: snapshot.discussion_comments.filter((comment) => !isAutomationLikeDiscussionComment(comment));
	const resolvedThreads = snapshot.counted_review_threads.filter(
		(thread) => thread.is_resolved,
	).length;
	return {
		reviewThreads: snapshot.review_threads,
		reviews,
		discussionComments,
		counts: {
			included_review_threads: snapshot.review_threads.length,
			included_reviews: reviews.length,
			included_discussion_comments: discussionComments.length,
			excluded_resolved_threads: request.include_resolved ? 0 : resolvedThreads,
			excluded_empty_reviews: request.include_empty_reviews
				? 0
				: snapshot.reviews.length - reviews.length,
			excluded_automation_comments: request.include_automation
				? 0
				: snapshot.discussion_comments.length - discussionComments.length,
		},
	};
}

function buildMissingPrResult(
	target: DownloadFeedbackTarget,
	message: string,
): DownloadFeedbackResult {
	const counts = zeroCounts();
	return {
		found: false,
		target,
		counts,
		markdown: [
			"# PR feedback triage request",
			"",
			message,
			"",
			"No GitHub PR was found for this target. Check out a branch with an open PR or run with `--pr-number <number>`.",
		].join("\n"),
	};
}

function buildDownloadFeedbackMarkdown(options: {
	target: DownloadFeedbackTarget;
	counts: DownloadFeedbackCounts;
	feedback: IncludedFeedback;
}): string {
	return [
		"# PR feedback triage request",
		"",
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
		"",
		...renderSinglePrInstructions(),
	].join("\n");
}

function renderDownloadFeedbackSummary(
	target: DownloadFeedbackTarget,
	counts: DownloadFeedbackCounts,
): string[] {
	return [
		"## Summary",
		`Downloaded feedback for PR #${formatNullableNumber(target.pr_number)}: ${formatNullable(target.title)}`,
		`- URL: ${formatNullable(target.url)}`,
		`- Branch: ${formatNullable(target.branch)}`,
		`- Head: ${formatNullable(target.head_ref_name)}`,
		`- Base: ${formatNullable(target.base_ref_name)}`,
		`- Unresolved review threads included: ${counts.included_review_threads}`,
		`- PR-level review bodies included: ${counts.included_reviews}`,
		`- Discussion comments included: ${counts.included_discussion_comments}`,
		`- Resolved review threads excluded: ${counts.excluded_resolved_threads}`,
		`- Empty PR-level reviews excluded: ${counts.excluded_empty_reviews}`,
		`- Automation-like discussion comments excluded: ${counts.excluded_automation_comments}`,
	];
}

function renderSinglePrInstructions(): string[] {
	return [
		"## Instructions before responding",
		"Triage and group the feedback above. Identify likely code, docs, and test changes. Ask clarifying questions for ambiguity.",
		"",
		"Do not edit files yet; propose a plan and wait for human confirmation. Do not resolve or reply to GitHub threads from this prompt.",
	];
}

function renderReviewThreads(threads: readonly PRReviewThread[]): string[] {
	if (threads.length === 0) return ["", "No unresolved review threads included."];
	return threads.flatMap((thread, index) => [
		"",
		`### Thread ${index + 1}: ${thread.id}`,
		`- Path: ${thread.path}`,
		`- Line: ${formatNullableNumber(thread.line)}`,
		`- Start line: ${formatNullableNumber(thread.start_line)}`,
		`- Outdated: ${String(thread.is_outdated)}`,
		`- Comment count: ${thread.comments.length}`,
		...thread.comments.flatMap((comment, commentIndex) => [
			"",
			`#### Comment ${commentIndex + 1}: ${comment.id}`,
			`- Author: ${comment.author}`,
			`- Created at: ${comment.created_at}`,
			`- Path: ${comment.path}`,
			`- Line: ${formatNullableNumber(comment.line)}`,
			`- Start line: ${formatNullableNumber(comment.start_line)}`,
			"",
			...blockquote(comment.body),
		]),
	]);
}

function renderReviews(reviews: readonly PRReview[]): string[] {
	if (reviews.length === 0) return ["", "No non-empty human PR-level review bodies included."];
	return reviews.flatMap((review, index) => [
		"",
		`### Review ${index + 1}: ${review.id}`,
		`- Author: ${review.author}`,
		`- State: ${review.state}`,
		`- Submitted at: ${review.submitted_at}`,
		"",
		...blockquote(review.body),
	]);
}

function renderDiscussionComments(comments: readonly PRDiscussionComment[]): string[] {
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

function hasNoIncludedFeedback(counts: DownloadFeedbackCounts): boolean {
	return (
		counts.included_review_threads === 0 &&
		counts.included_reviews === 0 &&
		counts.included_discussion_comments === 0
	);
}

function targetFromPr(pr: PRSummary, branch: string | null): DownloadFeedbackTarget {
	return {
		kind: "github_pr",
		pr_number: pr.number,
		branch: branch ?? pr.head_ref_name,
		title: pr.title,
		url: pr.url,
		head_ref_name: pr.head_ref_name,
		base_ref_name: pr.base_ref_name,
	};
}

function emptyTarget(options: {
	prNumber?: number | undefined;
	branch?: string | undefined;
}): DownloadFeedbackTarget {
	return {
		kind: "github_pr",
		pr_number: options.prNumber ?? null,
		branch: options.branch ?? null,
		title: null,
		url: null,
		head_ref_name: null,
		base_ref_name: null,
	};
}

function zeroCounts(): DownloadFeedbackCounts {
	return {
		included_review_threads: 0,
		included_reviews: 0,
		included_discussion_comments: 0,
		excluded_resolved_threads: 0,
		excluded_empty_reviews: 0,
		excluded_automation_comments: 0,
	};
}

function formatNullable(value: string | null): string {
	return value ?? "(unknown)";
}

function formatNullableNumber(value: number | null): string {
	return value === null ? "(unknown)" : String(value);
}
