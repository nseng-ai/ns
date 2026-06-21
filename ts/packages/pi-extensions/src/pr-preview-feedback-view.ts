import { Key, matchesKey, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { Component, TUI } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
	clamp,
	fitToWidth,
	reconcileScroll as reconcileViewportScroll,
} from "./context-profiler/render.ts";

const FALLBACK_TERMINAL_ROWS = 24;
const MIN_RENDER_WIDTH = 40;
const ROW_SUMMARY_WIDTH = 46;

type PreviewThemeColor = "text" | "muted" | "accent" | "warning" | "dim" | "border";

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

export interface PrPreviewFeedbackViewOptions {
	tui: TUI;
	theme: Theme;
	model: PrPreviewFeedbackViewModel;
	onClose: () => void;
}

export class PrPreviewFeedbackView implements Component {
	private readonly tui: TUI;
	private readonly theme: Theme;
	private readonly model: PrPreviewFeedbackViewModel;
	private readonly onClose: () => void;
	private selectedIndex: number;
	private listScroll: number;
	private detailScroll: number;

	constructor(options: PrPreviewFeedbackViewOptions) {
		this.tui = options.tui;
		this.theme = options.theme;
		this.model = options.model;
		this.onClose = options.onClose;
		this.selectedIndex = 0;
		this.listScroll = 0;
		this.detailScroll = 0;
	}

	render(width: number): string[] {
		const safeWidth = Math.max(MIN_RENDER_WIDTH, width);
		const innerWidth = Math.max(1, safeWidth - 2);
		const height = Math.max(10, this.terminalRows());
		const header = buildPreviewHeaderLines(this.model).map((line) => this.color("text", line));
		const footer = this.color(
			"dim",
			"↑↓/jk select · PgUp/PgDn scroll details · q/esc close · preview only",
		);
		const chromeRows = 2 + header.length + 1 + 1;
		const bodyRows = Math.max(1, height - chromeRows);
		const body = this.renderBody(innerWidth, bodyRows);
		return [
			this.border({ left: "┌", fill: "─", right: "┐", width: safeWidth }),
			...header.map((line) => this.boxLine(line, innerWidth)),
			this.border({ left: "├", fill: "─", right: "┤", width: safeWidth }),
			...body.map((line) => this.boxLine(line, innerWidth)),
			this.boxLine(footer, innerWidth),
			this.border({ left: "└", fill: "─", right: "┘", width: safeWidth }),
		].map((line) => fitToWidth(line, width));
	}

	handleInput(data: string): void {
		if (matchesKey(data, Key.escape) || data === "q") {
			this.onClose();
			return;
		}
		if (matchesKey(data, Key.down) || data === "j") {
			this.moveSelection(1);
			return;
		}
		if (matchesKey(data, Key.up) || data === "k") {
			this.moveSelection(-1);
			return;
		}
		if (matchesKey(data, Key.pageDown) || data === " ") {
			this.scrollDetails(8);
			return;
		}
		if (matchesKey(data, Key.pageUp)) {
			this.scrollDetails(-8);
		}
	}

	invalidate(): void {}

	private terminalRows(): number {
		return this.tui.terminal.rows ?? FALLBACK_TERMINAL_ROWS;
	}

	private renderBody(width: number, rows: number): string[] {
		if (this.model.threads.length === 0) return this.renderEmptyBody(width, rows);
		this.selectedIndex = clamp(this.selectedIndex, 0, this.model.threads.length - 1);
		this.listScroll = reconcileViewportScroll({
			scroll: this.listScroll,
			anchor: this.selectedIndex,
			areaHeight: rows,
			totalLines: this.model.threads.length,
		});
		const preferredLeftWidth = clamp(Math.floor(width * 0.32), 28, 52);
		const leftWidth = Math.min(preferredLeftWidth, Math.max(20, width - 24));
		const rightWidth = Math.max(12, width - leftWidth - 3);
		const visibleThreads = this.model.threads.slice(this.listScroll, this.listScroll + rows);
		const detailLines = this.renderDetailLines(this.model.threads[this.selectedIndex]);
		const maxDetailScroll = Math.max(0, detailLines.length - rows);
		this.detailScroll = clamp(this.detailScroll, 0, maxDetailScroll);
		const rightLines = wrapDetailLines(detailLines, rightWidth).slice(
			this.detailScroll,
			this.detailScroll + rows,
		);
		const lines: string[] = [];
		for (let row = 0; row < rows; row += 1) {
			const thread = visibleThreads[row];
			const actualIndex = this.listScroll + row;
			const left = thread === undefined ? "" : this.renderThreadRow(thread, actualIndex, leftWidth);
			const right = rightLines[row] ?? "";
			lines.push(
				`${fitToWidth(left, leftWidth)} ${this.color("dim", "│")} ${fitToWidth(right, rightWidth)}`,
			);
		}
		return lines;
	}

	private renderEmptyBody(width: number, rows: number): string[] {
		const lines = wrapDetailLines(buildEmptyStateLines(this.model), width);
		return Array.from({ length: rows }, (_unused, index) => fitToWidth(lines[index] ?? "", width));
	}

	private renderDetailLines(thread: PrPreviewFeedbackThread | undefined): string[] {
		return buildThreadDetailRows(thread).map((row) => this.renderDetailLine(row));
	}

	private renderDetailLine(row: ThreadDetailRow): string {
		switch (row.role) {
			case "finding":
				return this.color("accent", `▣ ${row.text}`);
			case "review":
				return this.color("muted", `  ${row.text}`);
			case "body":
				return this.color("text", `  │ ${row.text}`);
			case "evidence":
				return this.color("warning", `  Evidence: ${row.text}`);
			case "source":
				return this.color("dim", `  ${row.text}`);
			case "comment":
				return this.color("muted", row.text);
			case "spacer":
				return "";
		}
	}

	private renderThreadRow(
		thread: PrPreviewFeedbackThread,
		actualIndex: number,
		width: number,
	): string {
		const prefix = actualIndex === this.selectedIndex ? "> " : "  ";
		const row = fitToWidth(`${prefix}${buildThreadRowLabel(thread)}`, width);
		if (actualIndex !== this.selectedIndex) return this.color("text", row);
		return this.theme.bg("selectedBg", this.color("accent", row));
	}

	private moveSelection(delta: number): void {
		if (this.model.threads.length === 0) return;
		const next = clamp(this.selectedIndex + delta, 0, this.model.threads.length - 1);
		if (next === this.selectedIndex) return;
		this.selectedIndex = next;
		this.detailScroll = 0;
		this.tui.requestRender();
	}

	private scrollDetails(delta: number): void {
		this.detailScroll = Math.max(0, this.detailScroll + delta);
		this.tui.requestRender();
	}

	private color(color: PreviewThemeColor, value: string): string {
		return this.theme.fg(color, value);
	}

	private border(options: { left: string; fill: string; right: string; width: number }): string {
		return this.color(
			"border",
			`${options.left}${options.fill.repeat(Math.max(0, options.width - 2))}${options.right}`,
		);
	}

	private boxLine(value: string, width: number): string {
		return this.color("border", "│") + fitToWidth(value, width) + this.color("border", "│");
	}
}

export function buildThreadRowLabel(thread: PrPreviewFeedbackThread): string {
	const summary = parseCommentBody(thread.comments[0]?.body ?? "");
	const title =
		summary.title === "" ? null : truncatePlainToWidth(summary.title, ROW_SUMMARY_WIDTH);
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

interface ThreadDetailRow {
	role: "finding" | "review" | "body" | "evidence" | "source" | "comment" | "spacer";
	text: string;
}

function buildThreadDetailRows(thread: PrPreviewFeedbackThread | undefined): ThreadDetailRow[] {
	if (thread === undefined) return [{ role: "body", text: "No thread selected." }];
	return thread.comments.flatMap((comment, index) => renderComment(thread, comment, index));
}

function formatThreadDetailRowText(row: ThreadDetailRow): string {
	if (row.role === "evidence") return `Evidence: ${row.text}`;
	return row.text;
}

export function buildPreviewHeaderLines(model: PrPreviewFeedbackViewModel): string[] {
	const head = model.target.head_ref_name ?? model.target.branch ?? "?";
	const base = model.target.base_ref_name ?? "?";
	return [
		`PR #${model.target.pr_number}: ${model.target.title ?? "(untitled)"}`,
		`${head} → ${base} · ${model.threads.length} unresolved inline threads · excluded ${model.counts.included_reviews} PR reviews / ${model.counts.included_discussion_comments} discussion · snapshot ${model.fetchedAt.toISOString()}`,
		...buildCountMismatchNotice(model),
	];
}

export function buildCountMismatchNotice(model: PrPreviewFeedbackViewModel): string[] {
	if (model.counts.included_review_threads === model.threads.length) return [];
	return [
		`Summary count was ${model.counts.included_review_threads} unresolved threads when target summary loaded; actual thread rows fetched now: ${model.threads.length}.`,
	];
}

export function buildEmptyStateLines(model: PrPreviewFeedbackViewModel): string[] {
	return [
		`PR #${model.target.pr_number}: ${model.target.title ?? "(untitled)"}`,
		"No unresolved review threads included.",
		"",
		`PR-level review bodies excluded from this list: ${model.counts.included_reviews}`,
		`Discussion comments excluded from this list: ${model.counts.included_discussion_comments}`,
		`Resolved review threads excluded: ${model.counts.excluded_resolved_threads}`,
		`Empty reviews excluded: ${model.counts.excluded_empty_reviews}`,
		`Automation-like discussion comments excluded: ${model.counts.excluded_automation_comments}`,
		...buildCountMismatchNotice(model),
	];
}

function renderComment(
	thread: PrPreviewFeedbackThread,
	comment: PrPreviewFeedbackComment,
	index: number,
): ThreadDetailRow[] {
	const parsed = parseCommentBody(comment.body);
	return [
		...(index === 0
			? []
			: ([
					{ role: "spacer", text: "" },
					{ role: "comment", text: `Comment ${index + 1}` },
				] satisfies ThreadDetailRow[])),
		{
			role: "finding",
			text: `${formatFindingPrefix(parsed)}${parsed.title === "" ? "Review comment" : parsed.title}`,
		},
		{ role: "review", text: `Review: ${parsed.review ?? "uncategorized"}` },
		{ role: "spacer", text: "" },
		...parsed.details.map((line): ThreadDetailRow => ({ role: "body", text: line })),
		...renderEvidence(parsed.evidence),
		{ role: "spacer", text: "" },
		{ role: "source", text: formatCommentSource(thread, comment) },
	];
}

function wrapDetailLines(lines: readonly string[], width: number): string[] {
	return lines.flatMap((line) => {
		if (line === "") return [""];
		const wrapped = wrapTextWithAnsi(line, Math.max(1, width));
		return wrapped.length === 0 ? [""] : wrapped;
	});
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

function renderEvidence(evidence: readonly string[]): ThreadDetailRow[] {
	if (evidence.length === 0) return [];
	return [
		{ role: "spacer", text: "" },
		...evidence.map((line): ThreadDetailRow => ({ role: "evidence", text: line })),
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
	return `${basename(thread.path)}:${formatCommentLine(comment)} · ${comment.author} · #${comment.id} · ${comment.created_at} · ${thread.id}${statusSuffix}`;
}

interface ParsedCommentBody {
	level: string | null;
	title: string;
	review: string | null;
	details: readonly string[];
	evidence: readonly string[];
}

function parseCommentBody(body: string): ParsedCommentBody {
	const lines = normalizeCommentBodyLines(body);
	const firstLine = firstNonEmptyLine(lines);
	const titleMatch = /^(?<level>info|warning|error):\s*(?<title>.*)$/u.exec(firstLine);
	const level = titleMatch?.groups?.level ?? null;
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

function normalizeCommentBodyLines(body: string): string[] {
	return body
		.split(/\r\n|\r|\n/u)
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

function basename(path: string): string {
	return path.split("/").at(-1) ?? path;
}

function truncatePlainToWidth(text: string, width: number): string {
	if (visibleWidth(text) <= width) return text;
	const ellipsis = "…";
	const maxBodyWidth = Math.max(0, width - visibleWidth(ellipsis));
	let result = "";
	for (const char of text) {
		if (visibleWidth(result + char) > maxBodyWidth) break;
		result += char;
	}
	return `${result}${ellipsis}`;
}
