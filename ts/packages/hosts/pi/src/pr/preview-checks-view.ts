import { Key, matchesKey } from "@earendil-works/pi-tui";
import type { Component, TUI } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";

import {
	buildCheckDetailRows,
	buildCheckRowLabel,
	type PrPreviewChecksDetailRow,
	type PrPreviewCheck,
	type PrPreviewChecksViewModel,
} from "./preview-checks-model.ts";
import { clamp, fitToWidth, reconcileScroll } from "../shared/render-helpers.ts";
import { sliceWrappedDetailLinesForViewport, wrapDetailLines } from "./preview-view-utilities.ts";
import type {
	WrappedDetailViewport,
	WrappedDetailViewportOptions,
} from "./preview-view-utilities.ts";

const FALLBACK_TERMINAL_ROWS = 24;
const MIN_RENDER_WIDTH = 40;
const DEFAULT_LOG_LOAD_TIMEOUT_MS = 90_000;

type PreviewThemeColor = "text" | "muted" | "accent" | "warning" | "dim" | "border";
type CheckLogCacheEntry =
	| { type: "loading" }
	| { type: "loaded"; lines: readonly string[] }
	| { type: "failed"; lines: readonly string[] };

export type {
	PrPreviewChecksCounts,
	PrPreviewChecksTarget,
	PrPreviewCheck,
	PrPreviewChecksViewModel,
} from "./preview-checks-model.ts";

export interface PrPreviewCheckLogLoadOptions {
	signal: AbortSignal;
}

export interface PrPreviewChecksViewOptions {
	tui: TUI;
	theme: Theme;
	model: PrPreviewChecksViewModel;
	onClose: () => void;
	onLoadLogs?:
		| ((check: PrPreviewCheck, options: PrPreviewCheckLogLoadOptions) => Promise<readonly string[]>)
		| undefined;
	logLoadTimeoutMs?: number | undefined;
}

export { sliceWrappedDetailLinesForViewport };
export type { WrappedDetailViewport, WrappedDetailViewportOptions };

export class PrPreviewChecksView implements Component {
	private readonly tui: TUI;
	private readonly theme: Theme;
	private readonly model: PrPreviewChecksViewModel;
	private readonly onClose: () => void;
	private readonly onLoadLogs:
		| ((check: PrPreviewCheck, options: PrPreviewCheckLogLoadOptions) => Promise<readonly string[]>)
		| undefined;
	private readonly logLoadTimeoutMs: number;
	private selectedIndex: number;
	private listScroll: number;
	private detailScroll: number;
	private readonly logCache: Map<PrPreviewCheck, CheckLogCacheEntry>;

	constructor(options: PrPreviewChecksViewOptions) {
		this.tui = options.tui;
		this.theme = options.theme;
		this.model = options.model;
		this.onClose = options.onClose;
		this.onLoadLogs = options.onLoadLogs;
		this.logLoadTimeoutMs = options.logLoadTimeoutMs ?? DEFAULT_LOG_LOAD_TIMEOUT_MS;
		this.selectedIndex = 0;
		this.listScroll = 0;
		this.detailScroll = 0;
		this.logCache = new Map();
	}

	render(width: number): string[] {
		const safeWidth = Math.max(MIN_RENDER_WIDTH, width);
		const innerWidth = Math.max(1, safeWidth - 2);
		const height = Math.max(10, this.terminalRows());
		const header = buildPreviewHeaderLines(this.model).map((line) => this.color("text", line));
		const footer = this.color(
			"dim",
			"↑↓/jk select · l summarize logs · PgUp/PgDn scroll details · q/esc close",
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
			return;
		}
		if (data === "l") {
			void this.loadSelectedCheckLogs();
		}
	}

	invalidate(): void {}

	private terminalRows(): number {
		return this.tui.terminal.rows ?? FALLBACK_TERMINAL_ROWS;
	}

	private renderBody(width: number, rows: number): string[] {
		if (this.model.checks.length === 0) return this.renderEmptyBody(width, rows);
		this.selectedIndex = clamp(this.selectedIndex, 0, this.model.checks.length - 1);
		const listRows = checkListRows({ totalRows: rows, checkCount: this.model.checks.length });
		const detailRows = Math.max(1, rows - listRows - 2);
		this.listScroll = reconcileScroll({
			scroll: this.listScroll,
			anchor: this.selectedIndex,
			areaHeight: listRows,
			totalLines: this.model.checks.length,
		});
		return [
			...this.renderCheckListLines(width, listRows),
			this.color("dim", "─".repeat(Math.max(1, width))),
			this.color("muted", "Selected check details"),
			...this.renderSelectedCheckDetailLines(width, detailRows),
		];
	}

	private renderCheckListLines(width: number, rows: number): string[] {
		const visibleChecks = this.model.checks.slice(this.listScroll, this.listScroll + rows);
		return Array.from({ length: rows }, (_unused, row) => {
			const check = visibleChecks[row];
			if (check === undefined) return "";
			return this.renderCheckRow(check, this.listScroll + row, width);
		});
	}

	private renderSelectedCheckDetailLines(width: number, rows: number): string[] {
		const detailLines = this.renderDetailLines(this.model.checks[this.selectedIndex]);
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

	private renderDetailLines(check: PrPreviewCheck | undefined): string[] {
		const cached = check === undefined ? undefined : this.logCache.get(check);
		if (cached?.type === "loading") {
			return [
				this.color(
					"muted",
					`Loading and summarizing selected check logs… (timeout ${formatDurationSeconds(this.logLoadTimeoutMs)})`,
				),
			];
		}
		if (cached?.type === "loaded" || cached?.type === "failed") {
			return cached.lines.map((line) => this.color("text", line));
		}
		return buildCheckDetailRows(check).map((row) => this.renderDetailLine(row));
	}

	private renderDetailLine(row: PrPreviewChecksDetailRow): string {
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

	private renderCheckRow(check: PrPreviewCheck, actualIndex: number, width: number): string {
		const prefix = actualIndex === this.selectedIndex ? "> " : "  ";
		const row = fitToWidth(`${prefix}${buildCheckRowLabel(check)}`, width);
		if (actualIndex !== this.selectedIndex) return this.color("text", row);
		return this.theme.bg("selectedBg", this.color("accent", row));
	}

	private moveSelection(delta: number): void {
		if (this.model.checks.length === 0) return;
		const next = clamp(this.selectedIndex + delta, 0, this.model.checks.length - 1);
		if (next === this.selectedIndex) return;
		this.selectedIndex = next;
		this.detailScroll = 0;
		this.tui.requestRender();
	}

	private scrollDetails(delta: number): void {
		this.detailScroll = Math.max(0, this.detailScroll + delta);
		this.tui.requestRender();
	}

	private async loadSelectedCheckLogs(): Promise<void> {
		const check = this.model.checks[this.selectedIndex];
		if (check === undefined || this.onLoadLogs === undefined) return;
		const cached = this.logCache.get(check);
		if (cached?.type === "loading") return;
		if (cached?.type === "loaded") {
			this.detailScroll = 0;
			this.tui.requestRender();
			return;
		}
		this.logCache.set(check, { type: "loading" });
		this.detailScroll = 0;
		this.tui.requestRender();
		const signal = createLogLoadSignal(this.logLoadTimeoutMs);
		try {
			const lines = await this.onLoadLogs(check, { signal });
			if (signal.aborted) throw signal.reason;
			this.logCache.set(check, { type: "loaded", lines: [...lines] });
		} catch (error) {
			this.logCache.set(check, {
				type: "failed",
				lines: [formatLogLoadError(error, signal, this.logLoadTimeoutMs)],
			});
		} finally {
			this.tui.requestRender();
		}
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

export function checkListRows(options: { totalRows: number; checkCount: number }): number {
	const availableRows = Math.max(1, options.totalRows - 3);
	const preferredRows = Math.max(4, Math.floor(options.totalRows * 0.55));
	return clamp(Math.min(options.checkCount, preferredRows), 1, availableRows);
}

export function buildPreviewHeaderLines(model: PrPreviewChecksViewModel): string[] {
	const head = model.target.head_ref_name ?? model.target.branch ?? "?";
	const base = model.target.base_ref_name ?? "?";
	const counts = model.counts;
	return [
		`PR #${model.target.pr_number}: ${model.target.title ?? "(untitled)"}`,
		`${head} → ${base} · checks ${counts.failing} failing / ${counts.pending} pending / ${counts.unknown} unknown / ${counts.passing} passing${counts.has_more === true ? " · more not shown" : ""} · snapshot ${model.fetchedAt.toISOString()}`,
	];
}

export function buildEmptyStateLines(model: PrPreviewChecksViewModel): string[] {
	return [
		`PR #${model.target.pr_number}: ${model.target.title ?? "(untitled)"}`,
		"No PR checks returned for this target.",
		"",
		"This preview is read-only. It does not fetch logs or inject session text.",
	];
}

function createLogLoadSignal(timeoutMs: number): AbortSignal {
	if (timeoutMs <= 0) return new AbortController().signal;
	return AbortSignal.timeout(timeoutMs);
}

function formatLogLoadError(error: unknown, signal: AbortSignal, timeoutMs: number): string {
	if (signal.aborted || isAbortError(error)) {
		return `Log summary timed out after ${formatDurationSeconds(timeoutMs)}. Press l to retry.`;
	}
	return error instanceof Error ? error.message : String(error);
}

function isAbortError(error: unknown): boolean {
	if (typeof error !== "object" || error === null || !("name" in error)) return false;
	return error.name === "AbortError" || error.name === "TimeoutError";
}

function formatDurationSeconds(timeoutMs: number): string {
	return `${Math.max(1, Math.ceil(timeoutMs / 1000))}s`;
}
