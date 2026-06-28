import { posix } from "node:path";

import { truncateToWidth } from "@earendil-works/pi-tui";

import { splitTextLines } from "@sdl/pi/shared/text-lines";
import { stripTerminalEscapes } from "@sdl/pi/terminal/presentation";

const ROW_SUMMARY_WIDTH_COLUMNS = 46;
const FEEDBACK_SEVERITY_LEVELS = ["info", "warning", "error"] as const;

export type FeedbackSeverityLevel = (typeof FEEDBACK_SEVERITY_LEVELS)[number];

export interface PrPreviewFeedbackCounts {
	included_review_threads: number;
	included_reviews: number;
	included_discussion_comments: number;
	excluded_resolved_threads: number;
	excluded_empty_reviews: number;
	excluded_automation_comments: number;
}

export interface PrPreviewFeedbackTarget {
	pr_number: number;
	title: string | null;
	url: string | null;
	branch: string | null;
	head_ref_name: string | null;
	base_ref_name: string | null;
}

export interface PrPreviewFeedbackComment {
	id: number;
	body: string;
	author: string;
	path: string;
	line: number | null;
	start_line: number | null;
	created_at: string;
}

export interface PrPreviewFeedbackThread {
	id: string;
	path: string;
	line: number | null;
	start_line: number | null;
	is_resolved: boolean;
	is_outdated: boolean;
	comments: readonly PrPreviewFeedbackComment[];
}

export interface PrPreviewFeedbackViewModel {
	target: PrPreviewFeedbackTarget;
	counts: PrPreviewFeedbackCounts;
	fetchedAt: Date;
	threads: readonly PrPreviewFeedbackThread[];
}

export interface PrPreviewFeedbackDetailRow {
	role: "finding" | "review" | "body" | "evidence" | "source" | "comment" | "spacer";
	text: string;
}

interface ParsedCommentBody {
	level: FeedbackSeverityLevel | null;
	title: string;
	review: string | null;
	details: readonly string[];
	evidence: readonly string[];
}

export function buildThreadRowLabel(thread: PrPreviewFeedbackThread): string {
	const summary = parseCommentBody(thread.comments[0]?.body ?? "");
	const title =
		summary.title === ""
			? null
			: stripTerminalEscapes(truncateToWidth(summary.title, ROW_SUMMARY_WIDTH_COLUMNS, "…", false));
	return [
		`L${formatThreadLine(thread)}`,
		summary.level,
		summary.review,
		title,
		thread.comments.length === 1 ? null : `${thread.comments.length} comments`,
		thread.is_outdated ? "outdated" : null,
	]
		.filter((part): part is string => part !== null)
		.join(" · ");
}

export function buildThreadDetailLines(thread: PrPreviewFeedbackThread | undefined): string[] {
	return buildThreadDetailRows(thread).map(formatThreadDetailRowText);
}

export function threadSeverityLevel(thread: PrPreviewFeedbackThread): FeedbackSeverityLevel | null {
	return parseCommentBody(thread.comments[0]?.body ?? "").level;
}

export function buildThreadDetailRows(
	thread: PrPreviewFeedbackThread | undefined,
): PrPreviewFeedbackDetailRow[] {
	if (thread === undefined) return [{ role: "body", text: "No thread selected." }];
	return thread.comments.flatMap((comment, index) =>
		buildCommentDetailRows(thread, comment, index),
	);
}

function buildCommentDetailRows(
	thread: PrPreviewFeedbackThread,
	comment: PrPreviewFeedbackComment,
	index: number,
): PrPreviewFeedbackDetailRow[] {
	const parsed = parseCommentBody(comment.body);
	return [
		...(index === 0
			? []
			: ([
					{ role: "spacer", text: "" },
					{ role: "comment", text: `Comment ${index + 1}` },
				] satisfies PrPreviewFeedbackDetailRow[])),
		{
			role: "finding",
			text: `${formatFindingPrefix(parsed)}${parsed.title === "" ? "Review comment" : parsed.title}`,
		},
		{ role: "review", text: `Review: ${parsed.review ?? "uncategorized"}` },
		{ role: "spacer", text: "" },
		...parsed.details.map((line): PrPreviewFeedbackDetailRow => ({ role: "body", text: line })),
		...buildEvidenceRows(parsed.evidence),
		{ role: "spacer", text: "" },
		{ role: "source", text: formatCommentSource(thread, comment) },
	];
}

function formatThreadDetailRowText(row: PrPreviewFeedbackDetailRow): string {
	if (row.role === "evidence") return `Evidence: ${row.text}`;
	return row.text;
}

function formatThreadLine(thread: Pick<PrPreviewFeedbackThread, "line" | "start_line">): string {
	if (thread.start_line !== null && thread.line !== null && thread.start_line !== thread.line) {
		return `${thread.start_line}-${thread.line}`;
	}
	if (thread.line !== null) return String(thread.line);
	if (thread.start_line !== null) return String(thread.start_line);
	return "?";
}

function formatCommentLine(comment: Pick<PrPreviewFeedbackComment, "line" | "start_line">): string {
	return formatThreadLine(comment);
}

function formatFindingPrefix(comment: Pick<ParsedCommentBody, "level">): string {
	if (comment.level === null) return "";
	return `${comment.level}: `;
}

function buildEvidenceRows(evidence: readonly string[]): PrPreviewFeedbackDetailRow[] {
	if (evidence.length === 0) return [];
	return [
		{ role: "spacer", text: "" },
		...evidence.map((line): PrPreviewFeedbackDetailRow => ({ role: "evidence", text: line })),
	];
}

function formatCommentSource(
	thread: PrPreviewFeedbackThread,
	comment: PrPreviewFeedbackComment,
): string {
	const status = [thread.is_outdated ? "outdated" : null, thread.is_resolved ? "resolved" : null]
		.filter((part): part is string => part !== null)
		.join(", ");
	const statusSuffix = status === "" ? "" : ` · ${status}`;
	return `${posix.basename(thread.path)}:${formatCommentLine(comment)} · ${comment.author} · #${comment.id} · ${comment.created_at} · ${thread.id}${statusSuffix}`;
}

function parseCommentBody(body: string): ParsedCommentBody {
	const lines = normalizeCommentBodyLines(body);
	const firstLine = firstNonEmptyLine(lines);
	const titleMatch = /^(?<level>info|warning|error):\s*(?<title>.*)$/u.exec(firstLine);
	const level = normalizeFeedbackSeverityLevel(titleMatch?.groups?.level);
	const title = titleMatch?.groups?.title ?? firstLine;
	const details: string[] = [];
	const evidence: string[] = [];
	let review: string | null = null;
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed === firstLine) continue;
		if (trimmed === "") continue;
		const reviewMatch = /^Review:\s*(?<review>.+)$/u.exec(trimmed);
		if (reviewMatch?.groups?.review !== undefined) {
			review = reviewMatch.groups.review;
			continue;
		}
		if (trimmed.startsWith("Evidence:")) {
			evidence.push(trimmed.replace(/^Evidence:\s*/u, ""));
			continue;
		}
		details.push(line.trim());
	}
	return { level, title, review, details: trimBlankLines(details), evidence };
}

function trimBlankLines(lines: readonly string[]): string[] {
	let start = 0;
	let end = lines.length;
	while (start < end && lines[start]?.trim() === "") start += 1;
	while (end > start && lines[end - 1]?.trim() === "") end -= 1;
	return lines.slice(start, end);
}

function firstNonEmptyLine(lines: readonly string[]): string {
	return lines.find((line) => line.trim() !== "")?.trim() ?? "";
}

function normalizeFeedbackSeverityLevel(level: string | undefined): FeedbackSeverityLevel | null {
	if (isFeedbackSeverityLevel(level)) return level;
	return null;
}

function isFeedbackSeverityLevel(level: string | undefined): level is FeedbackSeverityLevel {
	if (level === undefined) return false;
	return (FEEDBACK_SEVERITY_LEVELS as readonly string[]).includes(level);
}

function normalizeCommentBodyLines(body: string): string[] {
	return splitTextLines(body)
		.map(normalizeCommentBodyLine)
		.filter((line): line is string => line !== null);
}

function normalizeCommentBodyLine(line: string): string | null {
	const trimmed = line.trim();
	if (/^<!--\s*roaster-inline:/u.test(trimmed)) return null;
	if (trimmed.startsWith("_Posted by roaster.")) return null;
	const bold = /^\*\*(?<text>.*)\*\*$/u.exec(trimmed)?.groups?.text;
	if (bold !== undefined) return bold;
	const review = /^_Review:\s*`(?<review>[^`]+)`\._$/u.exec(trimmed)?.groups?.review;
	if (review !== undefined) return `Review: ${review}`;
	return line;
}
