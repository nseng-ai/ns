import { Key, matchesKey } from "@earendil-works/pi-tui";
import type { Component, TUI } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";

import {
	buildThreadDetailRows,
	buildThreadRowLabel,
	threadSeverityLevel,
	type FeedbackSeverityLevel,
	type PrPreviewFeedbackDetailRow,
	type PrPreviewFeedbackThread,
	type PrPreviewFeedbackViewModel,
} from "./preview-feedback-model.ts";
import { clamp, fitToWidth, reconcileScroll } from "../context-profiler/render.ts";
import {
	PREVIEW_OVERLAY_MARGIN,
	PREVIEW_OVERLAY_MAX_HEIGHT_RATIO,
	sliceWrappedDetailLinesForViewport,
	wrapDetailLines,
} from "./preview-view-utilities.ts";
import type {
	WrappedDetailViewport,
	WrappedDetailViewportOptions,
} from "./preview-view-utilities.ts";

const FALLBACK_TERMINAL_ROWS = 24;
const MIN_RENDER_WIDTH = 40;

export { PREVIEW_OVERLAY_MARGIN, PREVIEW_OVERLAY_MAX_HEIGHT_RATIO };

type PreviewThemeColor = "text" | "muted" | "accent" | "warning" | "error" | "dim" | "border";

export type {
	PrPreviewFeedbackComment,
	PrPreviewFeedbackCounts,
	PrPreviewFeedbackTarget,
	PrPreviewFeedbackThread,
	PrPreviewFeedbackViewModel,
} from "./preview-feedback-model.ts";

export interface PrPreviewFeedbackViewOptions {
	tui: TUI;
	theme: Theme;
	model: PrPreviewFeedbackViewModel;
	onClose: () => void;
}

export { sliceWrappedDetailLinesForViewport };
export type { WrappedDetailViewport, WrappedDetailViewportOptions };

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
		const height = this.modalRows();
		const header = buildPreviewHeaderLines(this.model).map((line) => this.color("text", line));
		const footer = this.color(
			"dim",
			"↑↓/jk select · PgUp/PgDn scroll · q/esc close · preview only",
		);
		const chromeRows = 2 + header.length + 1 + 1 + 1;
		const bodyRows = Math.max(1, height - chromeRows);
		const body = this.renderBody(innerWidth, bodyRows);
		return [
			this.border({ left: "┌", fill: "─", right: "┐", width: safeWidth }),
			...header.map((line) => this.boxLine(line, innerWidth)),
			this.border({ left: "├", fill: "─", right: "┤", width: safeWidth }),
			...body.map((line) => this.boxLine(line, innerWidth)),
			this.border({ left: "├", fill: "─", right: "┤", width: safeWidth }),
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
			return;
		}
	}

	invalidate(): void {}

	private terminalRows(): number {
		return this.tui.terminal.rows ?? FALLBACK_TERMINAL_ROWS;
	}

	/**
	 * Number of rows the modal may render before the host overlay clips it. Mirrors
	 * the TUI's `maxHeight = min(floor(rows * ratio), rows - 2 * margin)` so the
	 * footer and bottom border stay inside the visible overlay.
	 */
	private modalRows(): number {
		const rows = this.terminalRows();
		const available = Math.max(1, rows - 2 * PREVIEW_OVERLAY_MARGIN);
		const budget = Math.min(Math.floor(rows * PREVIEW_OVERLAY_MAX_HEIGHT_RATIO), available);
		return Math.max(1, budget);
	}

	private renderBody(width: number, rows: number): string[] {
		if (this.model.threads.length === 0) return this.renderEmptyBody(width, rows);
		this.selectedIndex = clamp(this.selectedIndex, 0, this.model.threads.length - 1);
		const listRows = feedbackListRows({
			bodyRows: rows,
			threadCount: this.model.threads.length,
		});
		const detailRows = Math.max(1, rows - listRows - 1);
		this.listScroll = reconcileScroll({
			scroll: this.listScroll,
			anchor: this.selectedIndex,
			areaHeight: listRows,
			totalLines: this.model.threads.length,
		});
		return [
			...this.renderThreadListLines(width, listRows),
			this.color("dim", "─".repeat(Math.max(1, width))),
			...this.renderSelectedThreadDetailLines(width, detailRows),
		];
	}

	private renderThreadListLines(width: number, rows: number): string[] {
		const visibleThreads = this.model.threads.slice(this.listScroll, this.listScroll + rows);
		return Array.from({ length: rows }, (_unused, row) => {
			const thread = visibleThreads[row];
			if (thread === undefined) return "";
			return this.renderThreadRow(thread, this.listScroll + row, width);
		});
	}

	private renderSelectedThreadDetailLines(width: number, rows: number): string[] {
		const detailLines = this.renderDetailLines(this.model.threads[this.selectedIndex]);
		const viewport = sliceWrappedDetailLinesForViewport({
			lines: detailLines,
			width,
			rows,
			scroll: this.detailScroll,
		});
		this.detailScroll = viewport.scroll;
		return Array.from({ length: rows }, (_unused, row) =>
			fitToWidth(viewport.lines[row] ?? "", width),
		);
	}

	private renderEmptyBody(width: number, rows: number): string[] {
		const lines = wrapDetailLines(buildEmptyStateLines(this.model), width);
		return Array.from({ length: rows }, (_unused, index) => fitToWidth(lines[index] ?? "", width));
	}

	private renderDetailLines(thread: PrPreviewFeedbackThread | undefined): string[] {
		const rows = buildThreadDetailRows(thread);
		const lines: string[] = [];
		let previousRole: PrPreviewFeedbackDetailRow["role"] | null = null;
		for (const row of rows) {
			if (row.role === "evidence" && previousRole !== "evidence") {
				lines.push(this.color("muted", "  EVIDENCE"));
			}
			lines.push(this.renderDetailLine(row));
			previousRole = row.role;
		}
		return lines;
	}

	private renderDetailLine(row: PrPreviewFeedbackDetailRow): string {
		switch (row.role) {
			case "finding":
				return this.color("accent", `▣ ${row.text}`);
			case "review":
				return this.color("muted", `  ${row.text}`);
			case "body":
				return this.color("text", `  ▏ ${row.text}`);
			case "evidence":
				return this.color("warning", `  · ${row.text}`);
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
		const level = threadSeverityLevel(thread);
		const icon = severityIcon(level);
		const label = buildThreadRowLabel(thread);
		if (actualIndex === this.selectedIndex) {
			const row = fitToWidth(`${prefix}${icon} ${label}`, width);
			return this.theme.bg("selectedBg", this.color("accent", row));
		}
		const severityColor = severityThemeColor(level);
		const coloredRow = `${this.color("text", prefix)}${this.color(severityColor, icon)} ${this.colorizeRowLabel(label, level, severityColor)}`;
		return fitToWidth(coloredRow, width);
	}

	private colorizeRowLabel(
		label: string,
		level: FeedbackSeverityLevel | null,
		severityColor: PreviewThemeColor,
	): string {
		if (level === null) return this.color("text", label);
		return label
			.split(" · ")
			.map((segment) =>
				segment === level ? this.color(severityColor, segment) : this.color("text", segment),
			)
			.join(this.color("text", " · "));
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

export function feedbackListRows(options: { bodyRows: number; threadCount: number }): number {
	const preferred = Math.max(3, Math.floor(options.bodyRows * 0.3));
	return clamp(Math.min(options.threadCount, preferred), 1, options.bodyRows - 5);
}

function severityIcon(level: FeedbackSeverityLevel | null): string {
	if (level === "error") return "✕";
	if (level === "warning") return "⚠";
	return "·";
}

function severityThemeColor(level: FeedbackSeverityLevel | null): PreviewThemeColor {
	if (level === "error") return "error";
	if (level === "warning") return "warning";
	return "dim";
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
