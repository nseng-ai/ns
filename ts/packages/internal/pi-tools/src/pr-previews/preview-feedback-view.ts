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
import { clamp, fitToWidth } from "@nseng-ai/pi/terminal/layout";
import { PreviewModalChrome } from "./preview-modal-chrome.ts";

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

export class PrPreviewFeedbackView implements Component {
	private readonly model: PrPreviewFeedbackViewModel;
	private readonly onClose: () => void;
	private readonly chrome: PreviewModalChrome<PreviewThemeColor>;

	constructor(options: PrPreviewFeedbackViewOptions) {
		this.model = options.model;
		this.onClose = options.onClose;
		this.chrome = new PreviewModalChrome({ tui: options.tui, theme: options.theme });
	}

	render(width: number): string[] {
		const header = buildPreviewHeaderLines(this.model).map((line) => this.color("text", line));
		const footer = this.color(
			"dim",
			"↑↓/jk select · PgUp/PgDn scroll · q/esc close · preview only",
		);
		return this.chrome.renderFrame({
			width,
			header,
			footer,
			renderBody: (innerWidth, bodyRows) => this.renderBody(innerWidth, bodyRows),
		});
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

	private renderBody(width: number, rows: number): string[] {
		if (this.model.threads.length === 0)
			return this.chrome.renderEmptyBody(buildEmptyStateLines(this.model), width, rows);
		return this.chrome.renderListDetailBody({
			items: this.model.threads,
			width,
			rows,
			listRows: feedbackListRows({
				bodyRows: rows,
				threadCount: this.model.threads.length,
			}),
			renderRow: (thread, actualIndex, rowWidth) =>
				this.renderThreadRow(thread, actualIndex, rowWidth),
			renderDetailLines: (thread) => this.renderDetailLines(thread),
		});
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
		const prefix = actualIndex === this.chrome.selected() ? "> " : "  ";
		const level = threadSeverityLevel(thread);
		const icon = severityIcon(level);
		const label = buildThreadRowLabel(thread);
		if (actualIndex === this.chrome.selected()) {
			const row = fitToWidth(`${prefix}${icon} ${label}`, width);
			return this.chrome.background("selectedBg", this.color("accent", row));
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
		this.chrome.moveSelection(this.model.threads.length, delta);
	}

	private scrollDetails(delta: number): void {
		this.chrome.scrollDetails(delta);
	}

	private color(color: PreviewThemeColor, value: string): string {
		return this.chrome.color(color, value);
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
		`${head} → ${base} · ${model.threads.length} unresolved inline threads · excluded ${model.counts.includedReviews} PR reviews / ${model.counts.includedDiscussionComments} discussion · snapshot ${model.fetchedAt.toISOString()}`,
		...buildCountMismatchNotice(model),
	];
}

export function buildCountMismatchNotice(model: PrPreviewFeedbackViewModel): string[] {
	if (model.counts.includedReviewThreads === model.threads.length) return [];
	return [
		`Summary count was ${model.counts.includedReviewThreads} unresolved threads when target summary loaded; actual thread rows fetched now: ${model.threads.length}.`,
	];
}

export function buildEmptyStateLines(model: PrPreviewFeedbackViewModel): string[] {
	return [
		`PR #${model.target.pr_number}: ${model.target.title ?? "(untitled)"}`,
		"No unresolved review threads included.",
		"",
		`PR-level review bodies excluded from this list: ${model.counts.includedReviews}`,
		`Discussion comments excluded from this list: ${model.counts.includedDiscussionComments}`,
		`Resolved review threads excluded: ${model.counts.excludedResolvedThreads}`,
		`Empty reviews excluded: ${model.counts.excludedEmptyReviews}`,
		`Automation-like discussion comments excluded: ${model.counts.excludedAutomationComments}`,
		...buildCountMismatchNotice(model),
	];
}
