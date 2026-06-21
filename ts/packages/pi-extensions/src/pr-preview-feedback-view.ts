import {
	Key,
	matchesKey,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import type { Component, TUI } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";

const FALLBACK_TERMINAL_ROWS = 24;
const MIN_RENDER_WIDTH = 40;
const ROW_PREVIEW_WIDTH = 48;

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
			this.border("┌", "─", "┐", safeWidth),
			...header.map((line) => this.boxLine(line, innerWidth)),
			this.border("├", "─", "┤", safeWidth),
			...body.map((line) => this.boxLine(line, innerWidth)),
			this.boxLine(footer, innerWidth),
			this.border("└", "─", "┘", safeWidth),
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
		this.listScroll = reconcileScroll(this.selectedIndex, this.listScroll, rows);
		const leftWidth = Math.max(20, Math.min(Math.floor(width * 0.42), width - 24));
		const rightWidth = Math.max(12, width - leftWidth - 3);
		const visibleThreads = this.model.threads.slice(this.listScroll, this.listScroll + rows);
		const detailLines = buildThreadDetailLines(this.model.threads[this.selectedIndex]);
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

	private border(left: string, fill: string, right: string, width: number): string {
		return this.color("border", `${left}${fill.repeat(Math.max(0, width - 2))}${right}`);
	}

	private boxLine(value: string, width: number): string {
		return this.color("border", "│") + fitToWidth(value, width) + this.color("border", "│");
	}
}

export function buildThreadRowLabel(thread: PrPreviewFeedbackThread): string {
	const preview = firstNonEmptyLine(thread.comments[0]?.body ?? "");
	return [
		`${thread.path}:${formatThreadLine(thread)}`,
		`${thread.comments.length} ${thread.comments.length === 1 ? "comment" : "comments"}`,
		thread.is_outdated ? "outdated" : null,
		preview === "" ? null : truncateToWidth(preview, ROW_PREVIEW_WIDTH),
	]
		.filter((part): part is string => part !== null)
		.join(" · ");
}

export function buildThreadDetailLines(thread: PrPreviewFeedbackThread | undefined): string[] {
	if (thread === undefined) return ["No thread selected."];
	return [
		`Thread ${thread.id}`,
		`Path: ${thread.path}`,
		`Line: ${formatThreadLine(thread)}`,
		`Outdated: ${thread.is_outdated ? "yes" : "no"}`,
		`Resolved: ${thread.is_resolved ? "yes" : "no"}`,
		"",
		...thread.comments.flatMap((comment, index) => renderComment(comment, index)),
	];
}

export function buildPreviewHeaderLines(model: PrPreviewFeedbackViewModel): string[] {
	return [
		`PR #${model.target.pr_number}: ${model.target.title ?? "(untitled)"}`,
		`Head ${model.target.head_ref_name ?? "?"} → base ${model.target.base_ref_name ?? "?"} · branch ${model.target.branch ?? "?"}`,
		`Unresolved thread rows: ${model.threads.length} · PR-level review bodies excluded: ${model.counts.included_reviews} · discussion comments excluded: ${model.counts.included_discussion_comments}`,
		`Fetched ${model.fetchedAt.toISOString()} · snapshot only; close/reopen to refresh`,
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

function renderComment(comment: PrPreviewFeedbackComment, index: number): string[] {
	return [
		`Comment ${index + 1}: #${comment.id} by ${comment.author} at ${comment.created_at}`,
		`Location: ${comment.path}:${formatCommentLine(comment)}`,
		"Body:",
		...comment.body.split(/\r\n|\r|\n/u).map((line) => (line.length === 0 ? "  " : `  ${line}`)),
		"",
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

function firstNonEmptyLine(value: string): string {
	return (
		value
			.split(/\r\n|\r|\n/u)
			.find((line) => line.trim() !== "")
			?.trim() ?? ""
	);
}

function fitToWidth(value: string, width: number): string {
	if (width <= 0) return "";
	const truncated = truncateToWidth(value, width, "…");
	return truncated + " ".repeat(Math.max(0, width - visibleWidth(truncated)));
}

function reconcileScroll(selection: number, scroll: number, height: number): number {
	if (selection < scroll) return selection;
	if (selection >= scroll + height) return selection - height + 1;
	return scroll;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}
