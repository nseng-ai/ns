import { Key, matchesKey, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { Component, TUI } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";

import {
	buildThreadDetailRows,
	buildThreadRowLabel,
	type PrPreviewFeedbackDetailRow,
	type PrPreviewFeedbackThread,
	type PrPreviewFeedbackViewModel,
} from "./pr-preview-feedback-model.ts";
import {
	clamp,
	fitToWidth,
	reconcileScroll as reconcileViewportScroll,
} from "./context-profiler/render.ts";

const FALLBACK_TERMINAL_ROWS = 24;
const MIN_RENDER_WIDTH = 40;

type PreviewThemeColor = "text" | "muted" | "accent" | "warning" | "dim" | "border";

export type {
	PrPreviewFeedbackComment,
	PrPreviewFeedbackCounts,
	PrPreviewFeedbackTarget,
	PrPreviewFeedbackThread,
	PrPreviewFeedbackViewModel,
} from "./pr-preview-feedback-model.ts";

export interface PrPreviewFeedbackViewOptions {
	tui: TUI;
	theme: Theme;
	model: PrPreviewFeedbackViewModel;
	onClose: () => void;
}

export interface WrappedDetailViewportOptions {
	lines: readonly string[];
	width: number;
	rows: number;
	scroll: number;
}

export interface WrappedDetailViewport {
	lines: string[];
	scroll: number;
	maxScroll: number;
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
		const viewport = sliceWrappedDetailLinesForViewport({
			lines: detailLines,
			width: rightWidth,
			rows,
			scroll: this.detailScroll,
		});
		this.detailScroll = viewport.scroll;
		const rightLines = viewport.lines;
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

	private renderDetailLine(row: PrPreviewFeedbackDetailRow): string {
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

export function sliceWrappedDetailLinesForViewport(
	options: WrappedDetailViewportOptions,
): WrappedDetailViewport {
	const wrappedDetailLines = wrapDetailLines(options.lines, options.width);
	const maxScroll = Math.max(0, wrappedDetailLines.length - options.rows);
	const scroll = clamp(options.scroll, 0, maxScroll);
	return {
		lines: wrappedDetailLines.slice(scroll, scroll + options.rows),
		scroll,
		maxScroll,
	};
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

function wrapDetailLines(lines: readonly string[], width: number): string[] {
	return lines.flatMap((line) => {
		if (line === "") return [""];
		const wrapped = wrapTextWithAnsi(line, Math.max(1, width));
		return wrapped.length === 0 ? [""] : wrapped;
	});
}
