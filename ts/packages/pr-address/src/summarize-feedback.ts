import { z } from "zod";

import { failure, negative, ok, type ClinkrExit } from "@asdl/clinkr";
import { defineExecOperation, type PrAddressExecContext } from "./exec-operation.ts";
import { fetchFeedbackSnapshot, type FeedbackSnapshot } from "./feedback-collection.ts";
import type { PRDiscussionComment, PRReview, PRReviewComment, PRReviewThread, PRSummary } from "./gateways.ts";
import { gatewayFailureMessage, gatewayOptions } from "./exec-operation.ts";
import { compactOperationResult } from "./stdout-mode.ts";

type DiscussionSourceKind = "automation_like" | "human_like";

const MAX_BODY_CHARS = 4000;
const DEFAULT_BODY_CHARS = 320;
const FIRST_LINE_CHARS = 160;
const BODY_MARKERS: ReadonlyArray<readonly [marker: string, label: string]> = [
	["<!-- roaster:", "roaster_marker"],
	["<!-- asdl-reviewer:", "asdl_reviewer_marker"],
	["[vc]:", "vercel_marker"],
	["app.graphite.com/github/pr/", "graphite_link"],
	["static.graphite.dev", "graphite_static_asset"],
];

// Pinned split contract treats the ASCII separator controls and NEL as whitespace.
const WHITESPACE_RUN = /[\s\u001c-\u001f\u0085]+/u;
// Pinned split-lines contract handles boundaries beyond \r\n as alternation below.
const LINE_BOUNDARY = /\r\n|[\n\r\v\f\u001c\u001d\u001e\u0085\u2028\u2029]/u;

interface CompactReviewSummary {
	id: string;
	author: string;
	state: string;
	submitted_at: string;
	body_first_line_excerpt: string | null;
	body_excerpt: string;
}

interface CompactThreadCommentSummary {
	id: number;
	author: string;
	line: number | null;
	start_line: number | null;
	created_at: string;
	body_first_line_excerpt: string | null;
	body_excerpt: string;
}

interface CompactThreadSummary {
	thread_id: string;
	path: string;
	line: number | null;
	start_line: number | null;
	is_outdated: boolean;
	is_resolved: boolean;
	comment_count: number;
	first_comment: CompactThreadCommentSummary | null;
}

interface CompactDiscussionCommentSummary {
	comment_id: number;
	author: string;
	url: string;
	source_kind: DiscussionSourceKind;
	source_evidence: readonly string[];
	body_first_line_excerpt: string | null;
	body_excerpt: string;
}

interface CompactPullRequestSummary {
	number: number;
	title: string;
	url: string;
	head_ref_name: string;
	base_ref_name: string;
	state: string;
}

interface FeedbackSummaryCounts {
	reviews: number;
	review_threads: number;
	unresolved_review_threads: number;
	resolved_review_threads: number;
	discussion_comments: number;
}

interface SummarizeFeedbackFoundResult {
	found: true;
	pr_number: number;
	pr: CompactPullRequestSummary;
	counts: FeedbackSummaryCounts;
	reviews: readonly CompactReviewSummary[];
	review_threads: readonly CompactThreadSummary[];
	discussion_comments: readonly CompactDiscussionCommentSummary[];
}

const summarizeFeedbackParseSchema = z.object({
	pr_number: z.int(),
	include_resolved: z.boolean().default(false),
	include_empty_reviews: z.boolean().default(false),
	body_chars: z.int().default(DEFAULT_BODY_CHARS),
	harness_session_id: z.string().optional(),
});

type SummarizeFeedbackRequest = z.output<typeof summarizeFeedbackParseSchema>;

export const summarizeFeedbackOperation = defineExecOperation({
	isRepoContextRequired: true,
	spec: {
		name: "summarize-feedback",
		description: "Fetch compact PR feedback evidence without full raw review JSON.",
		schema: summarizeFeedbackParseSchema,
		positionals: { pr_number: { position: 0 } },
		handler: runSummarizeFeedbackOperation,
	},
	compactOutput: {
		harnessSessionId: (request) => request.harness_session_id,
		buildCompact: ({ data, fullOutput }) => {
			const result = data as Record<string, unknown>;
			return {
				type: "ok",
				value: compactOperationResult({
					operation: "summarize-feedback",
					counts: asRecord(result.counts),
					artifacts: { full_output: fullOutput },
					details: compactSummarizeDetails(result),
				}),
			};
		},
	},
});

async function runSummarizeFeedbackOperation(ctx: PrAddressExecContext, request: SummarizeFeedbackRequest): Promise<ClinkrExit<unknown>> {
	const bodyChars = request.body_chars;
	// Range stays a handler check so the failure keeps its machine envelope;
	// integer-ness is clinkr strict-int (usage-error channel).
	if (bodyChars < 1 || bodyChars > MAX_BODY_CHARS) {
		return failure("invalid_request", `body_chars must be between 1 and ${MAX_BODY_CHARS}`);
	}

	const github = ctx.context.github;
	const lookupResult = await github.getPr(request.pr_number, gatewayOptions(ctx));
	if (lookupResult.type === "failure") {
		return failure("pr_gateway_failure", gatewayFailureMessage(`Failed to look up PR ${request.pr_number}`, lookupResult.failure));
	}
	if (lookupResult.type === "miss") {
		const data = {
			found: false,
			pr_number: request.pr_number,
			error: lookupResult.stderr,
			returncode: lookupResult.returncode,
		};
		return negative(`No PR found for PR ${request.pr_number}: ${lookupResult.stderr}`, data);
	}

	const snapshotResult = await fetchFeedbackSnapshot({
		gateway: github,
		prNumber: lookupResult.pr.number,
		shouldIncludeResolved: request.include_resolved,
		shouldIncludeEmptyReviews: request.include_empty_reviews,
		shouldCountAllReviewThreads: true,
		ctx,
	});
	if (snapshotResult.type === "error") return snapshotResult.exit;

	const result = buildSummarizeFeedbackResult(lookupResult.pr, snapshotResult.snapshot, bodyChars);
	return ok(result);
}

function compactSummarizeDetails(data: Record<string, unknown>): Record<string, unknown> {
	if (data.found === false) return { found: false, pr_number: data.pr_number, error: data.error, returncode: data.returncode };
	return {
		found: true,
		pr_number: data.pr_number,
		pr: data.pr,
		review_ids: Array.isArray(data.reviews) ? data.reviews.map((item) => (isRecord(item) ? item.id : null)).filter((value) => value !== null) : [],
		thread_ids: Array.isArray(data.review_threads) ? data.review_threads.map((item) => (isRecord(item) ? item.thread_id : null)).filter((value) => value !== null) : [],
		discussion_comment_ids: Array.isArray(data.discussion_comments) ? data.discussion_comments.map((item) => (isRecord(item) ? item.comment_id : null)).filter((value) => value !== null) : [],
	};
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildSummarizeFeedbackResult(pr: PRSummary, snapshot: FeedbackSnapshot, bodyChars: number): SummarizeFeedbackFoundResult {
	return {
		found: true,
		pr_number: pr.number,
		pr: {
			number: pr.number,
			title: pr.title,
			url: pr.url,
			head_ref_name: pr.head_ref_name,
			base_ref_name: pr.base_ref_name,
			state: pr.state,
		},
		counts: feedbackSummaryCounts(snapshot),
		reviews: snapshot.reviews.map((review) => compactReview(review, bodyChars)),
		review_threads: snapshot.review_threads.map((thread) => compactThread(thread, bodyChars)),
		discussion_comments: snapshot.discussion_comments.map((comment) => compactDiscussionComment(comment, bodyChars)),
	};
}

function feedbackSummaryCounts(snapshot: FeedbackSnapshot): FeedbackSummaryCounts {
	const resolvedThreads = snapshot.counted_review_threads.filter((thread) => thread.is_resolved).length;
	return {
		reviews: snapshot.reviews.length,
		review_threads: snapshot.counted_review_threads.length,
		unresolved_review_threads: snapshot.counted_review_threads.length - resolvedThreads,
		resolved_review_threads: resolvedThreads,
		discussion_comments: snapshot.discussion_comments.length,
	};
}

function compactReview(review: PRReview, bodyChars: number): CompactReviewSummary {
	return {
		id: review.id,
		author: review.author,
		state: review.state,
		submitted_at: review.submitted_at,
		body_first_line_excerpt: firstNonEmptyLineExcerpt(review.body),
		body_excerpt: textExcerpt(review.body, bodyChars),
	};
}

function compactThread(thread: PRReviewThread, bodyChars: number): CompactThreadSummary {
	const firstComment = thread.comments[0];
	return {
		thread_id: thread.id,
		path: thread.path,
		line: thread.line,
		start_line: thread.start_line,
		is_outdated: thread.is_outdated,
		is_resolved: thread.is_resolved,
		comment_count: thread.comments.length,
		first_comment: firstComment === undefined ? null : compactThreadComment(firstComment, bodyChars),
	};
}

function compactThreadComment(comment: PRReviewComment, bodyChars: number): CompactThreadCommentSummary {
	return {
		id: comment.id,
		author: comment.author,
		line: comment.line,
		start_line: comment.start_line,
		created_at: comment.created_at,
		body_first_line_excerpt: firstNonEmptyLineExcerpt(comment.body),
		body_excerpt: textExcerpt(comment.body, bodyChars),
	};
}

function compactDiscussionComment(comment: PRDiscussionComment, bodyChars: number): CompactDiscussionCommentSummary {
	const evidence = sourceEvidence(comment.author, comment.body);
	return {
		comment_id: comment.id,
		author: comment.author,
		url: comment.url,
		source_kind: evidence.length > 0 ? "automation_like" : "human_like",
		source_evidence: evidence,
		body_first_line_excerpt: firstNonEmptyLineExcerpt(comment.body),
		body_excerpt: textExcerpt(comment.body, bodyChars),
	};
}

function textExcerpt(text: string, maxChars: number): string {
	const collapsed = text
		.split(WHITESPACE_RUN)
		.filter((part) => part !== "")
		.join(" ");
	return truncate(collapsed, maxChars);
}

function firstNonEmptyLineExcerpt(text: string): string | null {
	for (const line of text.split(LINE_BOUNDARY)) {
		const stripped = line.trim();
		if (stripped !== "") return truncate(stripped, FIRST_LINE_CHARS);
	}
	return null;
}

function truncate(text: string, maxChars: number): string {
	// Count code points, so spread the string before measuring.
	const characters = [...text];
	if (characters.length <= maxChars) return text;
	if (maxChars === 1) return "…";
	return `${characters.slice(0, maxChars - 1).join("").trimEnd()}…`;
}

function sourceEvidence(author: string, body: string): string[] {
	const evidence: string[] = author.endsWith("[bot]") ? ["bot_author"] : [];
	for (const [marker, label] of BODY_MARKERS) {
		if (body.includes(marker)) evidence.push(label);
	}
	return evidence;
}
