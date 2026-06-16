import type { FeedbackSnapshot } from "./feedback-snapshot.ts";
import type { PRDiscussionComment, PRReview, PRReviewComment, PRReviewThread, PRSummary } from "./gateways.ts";

export type DiscussionSourceKind = "automation_like" | "human_like";

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

export interface CompactReviewSummary {
	id: string;
	author: string;
	state: string;
	submitted_at: string;
	body_first_line_excerpt: string | null;
	body_excerpt: string;
}

export interface CompactThreadCommentSummary {
	id: number;
	author: string;
	line: number | null;
	start_line: number | null;
	created_at: string;
	body_first_line_excerpt: string | null;
	body_excerpt: string;
}

export interface CompactThreadSummary {
	thread_id: string;
	path: string;
	line: number | null;
	start_line: number | null;
	is_outdated: boolean;
	is_resolved: boolean;
	comment_count: number;
	first_comment: CompactThreadCommentSummary | null;
}

export interface CompactDiscussionCommentSummary {
	comment_id: number;
	author: string;
	url: string;
	source_kind: DiscussionSourceKind;
	source_evidence: readonly string[];
	body_first_line_excerpt: string | null;
	body_excerpt: string;
}

export interface CompactPullRequestSummary {
	number: number;
	title: string;
	url: string;
	head_ref_name: string;
	base_ref_name: string;
	state: string;
}

export interface FeedbackSummaryCounts {
	reviews: number;
	review_threads: number;
	unresolved_review_threads: number;
	resolved_review_threads: number;
	discussion_comments: number;
}

export interface SummarizeFeedbackFoundResult {
	found: true;
	pr_number: number;
	pr: CompactPullRequestSummary;
	counts: FeedbackSummaryCounts;
	reviews: readonly CompactReviewSummary[];
	review_threads: readonly CompactThreadSummary[];
	discussion_comments: readonly CompactDiscussionCommentSummary[];
}

export function buildSummarizeFeedbackResult(pr: PRSummary, snapshot: FeedbackSnapshot, bodyChars: number): SummarizeFeedbackFoundResult {
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

export function feedbackSummaryCounts(snapshot: FeedbackSnapshot): FeedbackSummaryCounts {
	const resolvedThreads = snapshot.counted_review_threads.filter((thread) => thread.is_resolved).length;
	return {
		reviews: snapshot.reviews.length,
		review_threads: snapshot.counted_review_threads.length,
		unresolved_review_threads: snapshot.counted_review_threads.length - resolvedThreads,
		resolved_review_threads: resolvedThreads,
		discussion_comments: snapshot.discussion_comments.length,
	};
}

export function compactReview(review: PRReview, bodyChars: number): CompactReviewSummary {
	return {
		id: review.id,
		author: review.author,
		state: review.state,
		submitted_at: review.submitted_at,
		body_first_line_excerpt: firstNonEmptyLineExcerpt(review.body),
		body_excerpt: textExcerpt(review.body, bodyChars),
	};
}

export function compactThread(thread: PRReviewThread, bodyChars: number): CompactThreadSummary {
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

export function compactDiscussionComment(comment: PRDiscussionComment, bodyChars: number): CompactDiscussionCommentSummary {
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
