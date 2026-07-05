import { Key, matchesKey } from "@earendil-works/pi-tui";
import type { Component, TUI } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";

import {
	aggregatePreviewChecksCounts,
	bucketPresentation,
	countsSummary,
	buildCheckDetailRows,
	effectiveBranch,
	buildCheckRowLabel,
	buildStackEntryRowLabel,
	previewChecksStackEntries,
	type PrPreviewChecksDetailRow,
	type PrPreviewCheck,
	type PrPreviewChecksStackEntry,
	type PrPreviewChecksViewModel,
	type PrPreviewStatusColor,
} from "./preview-checks-model.ts";
import { clamp, fitToWidth, reconcileScroll } from "@nseng-ai/pi/terminal/layout";
import {
	PREVIEW_OVERLAY_MARGIN,
	PREVIEW_OVERLAY_MAX_HEIGHT_RATIO,
	parseCheckLogSummaryMarkdownLine,
	sliceWrappedDetailLinesForViewport,
	wrapDetailLines,
} from "./preview-view-utilities.ts";
import type {
	WrappedDetailViewport,
	WrappedDetailViewportOptions,
} from "./preview-view-utilities.ts";

const FALLBACK_TERMINAL_ROWS = 24;
const MIN_RENDER_WIDTH = 40;
const DEFAULT_LOG_LOAD_TIMEOUT_MS = 90_000;

type PreviewThemeColor =
	| PrPreviewStatusColor
	| "text"
	| "accent"
	| "border"
	| "mdHeading"
	| "mdCode";
type CheckLogCacheEntry =
	| { type: "loading" }
	| { type: "loaded"; lines: readonly string[] }
	| { type: "failed"; lines: readonly string[] };
type PreviewFocusedPane = "stack" | "checks";

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
	onLoadLogs?: (
		check: PrPreviewCheck,
		options: PrPreviewCheckLogLoadOptions,
	) => Promise<readonly string[]>;
	logLoadTimeoutMs?: number;
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
	private focusedPane: PreviewFocusedPane;
	private selectedTargetIndex: number;
	private selectedCheckIndex: number;
	private stackScroll: number;
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
		this.focusedPane = previewChecksStackEntries(options.model).length > 1 ? "stack" : "checks";
		this.selectedTargetIndex = initialTargetIndex(options.model);
		this.selectedCheckIndex = 0;
		this.stackScroll = 0;
		this.listScroll = 0;
		this.detailScroll = 0;
		this.logCache = new Map();
	}

	render(width: number): string[] {
		const safeWidth = Math.max(MIN_RENDER_WIDTH, width);
		const innerWidth = Math.max(1, safeWidth - 2);
		const height = this.modalRows();
		const header = buildPreviewHeaderLines(this.model).map((line) => this.color("text", line));
		const footer = this.color("dim", this.footerText());
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
		if (matchesKey(data, Key.tab)) {
			this.toggleFocusedPane();
			return;
		}
		if (matchesKey(data, Key.down) || data === "j") {
			this.moveFocusedSelection(1);
			return;
		}
		if (matchesKey(data, Key.up) || data === "k") {
			this.moveFocusedSelection(-1);
			return;
		}
		if (matchesKey(data, Key.right) || matchesKey(data, Key.enter)) {
			this.descendToChecks();
			return;
		}
		if (matchesKey(data, Key.left) || data === "h") {
			this.ascendToStack();
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
			if (this.focusedPane === "stack") {
				this.descendToChecks();
				return;
			}
			void this.loadSelectedCheckLogs();
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
		const entries = previewChecksStackEntries(this.model);
		if (entries.length === 1 && entries[0]?.checks.length === 0)
			return this.renderEmptyBody(width, rows);
		this.selectedTargetIndex = clamp(this.selectedTargetIndex, 0, entries.length - 1);
		const selectedEntry = entries[this.selectedTargetIndex];
		if (selectedEntry === undefined) return this.renderEmptyBody(width, rows);
		this.selectedCheckIndex = clamp(
			this.selectedCheckIndex,
			0,
			Math.max(0, selectedEntry.checks.length - 1),
		);

		const shouldRenderStack = entries.length > 1;
		const stackRows = shouldRenderStack
			? stackListRows({ totalRows: rows, stackCount: entries.length })
			: 0;
		const rowsAfterStack = Math.max(1, rows - stackRows - (shouldRenderStack ? 2 : 0));
		const listRows =
			selectedEntry.checks.length === 0
				? 1
				: checkListRows({ totalRows: rowsAfterStack, checkCount: selectedEntry.checks.length });
		const detailRows = Math.max(1, rowsAfterStack - listRows - 2);
		this.stackScroll = reconcileScroll({
			scroll: this.stackScroll,
			anchor: this.selectedTargetIndex,
			areaHeight: Math.max(1, stackRows),
			totalLines: entries.length,
		});
		this.listScroll = reconcileScroll({
			scroll: this.listScroll,
			anchor: this.selectedCheckIndex,
			areaHeight: listRows,
			totalLines: selectedEntry.checks.length,
		});
		return [
			...(shouldRenderStack
				? [
						...this.renderStackListLines(entries, width, stackRows),
						this.color("dim", "─".repeat(Math.max(1, width))),
						this.color("muted", "Selected stack PR checks"),
					]
				: []),
			...this.renderCheckListLines(selectedEntry, width, listRows),
			this.color("dim", "─".repeat(Math.max(1, width))),
			this.color("muted", "Selected check details"),
			...this.renderSelectedCheckDetailLines(selectedEntry, width, detailRows),
		];
	}

	private renderStackListLines(
		entries: readonly PrPreviewChecksStackEntry[],
		width: number,
		rows: number,
	): string[] {
		const visibleEntries = entries.slice(this.stackScroll, this.stackScroll + rows);
		return Array.from({ length: rows }, (_unused, row) => {
			const entry = visibleEntries[row];
			if (entry === undefined) return "";
			return this.renderStackRow(entry, this.stackScroll + row, width);
		});
	}

	private renderCheckListLines(
		entry: PrPreviewChecksStackEntry,
		width: number,
		rows: number,
	): string[] {
		if (entry.checks.length === 0)
			return [this.color("muted", "  No checks returned for this stack PR.")];
		const visibleChecks = entry.checks.slice(this.listScroll, this.listScroll + rows);
		return Array.from({ length: rows }, (_unused, row) => {
			const check = visibleChecks[row];
			if (check === undefined) return "";
			return this.renderCheckRow(check, this.listScroll + row, width);
		});
	}

	private renderSelectedCheckDetailLines(
		entry: PrPreviewChecksStackEntry,
		width: number,
		rows: number,
	): string[] {
		const detailLines = this.renderDetailLines(entry.checks[this.selectedCheckIndex]);
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
		if (cached?.type === "loaded") {
			return cached.lines.map((line) => this.renderCheckLogSummaryMarkdownLine(line));
		}
		if (cached?.type === "failed") {
			return cached.lines.map((line) => this.color("error", line));
		}
		return buildCheckDetailRows(check).map((row) => this.renderDetailLine(row));
	}

	private renderCheckLogSummaryMarkdownLine(line: string): string {
		return parseCheckLogSummaryMarkdownLine(line)
			.map((segment) => {
				switch (segment.kind) {
					case "bold":
						return this.theme.bold(this.color("mdHeading", segment.text));
					case "code":
						return this.color("mdCode", segment.text);
					case "plain":
						return this.color("text", segment.text);
				}
			})
			.join("");
	}

	private renderDetailLine(row: PrPreviewChecksDetailRow): string {
		switch (row.role) {
			case "finding":
				return this.color("accent", `▣ ${row.text}`);
			case "review":
				return this.color(
					row.bucket === undefined ? "muted" : bucketPresentation(row.bucket).color,
					`  ${row.text}`,
				);
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

	private renderStackRow(
		entry: PrPreviewChecksStackEntry,
		actualIndex: number,
		width: number,
	): string {
		const prefix = actualIndex === this.selectedTargetIndex ? "◆ " : "◇ ";
		const row = fitToWidth(`${prefix}${buildStackEntryRowLabel(entry)}`, width);
		if (actualIndex !== this.selectedTargetIndex) return this.color("muted", row);
		const highlighted = this.color("accent", row);
		return this.focusedPane === "stack" ? this.theme.bg("selectedBg", highlighted) : highlighted;
	}

	private renderCheckRow(check: PrPreviewCheck, actualIndex: number, width: number): string {
		const prefix = actualIndex === this.selectedCheckIndex ? "> " : "  ";
		const row = fitToWidth(`${prefix}${buildCheckRowLabel(check)}`, width);
		if (actualIndex !== this.selectedCheckIndex) {
			const presentation = bucketPresentation(check.bucket);
			const colored = this.color(presentation.color, row);
			return presentation.bold ? this.theme.bold(colored) : colored;
		}
		const highlighted = this.color("accent", row);
		return this.focusedPane === "checks" ? this.theme.bg("selectedBg", highlighted) : highlighted;
	}

	private hasStackPane(): boolean {
		return previewChecksStackEntries(this.model).length > 1;
	}

	private footerText(): string {
		if (!this.hasStackPane()) {
			return "↑↓/jk checks · l summarize logs · PgUp/PgDn scroll details · q/esc close";
		}
		if (this.focusedPane === "stack") {
			return "↑↓/jk PRs · →/enter open checks · tab switch pane · q/esc close";
		}
		return "↑↓/jk checks · ←/h or tab PR list · l summarize logs · PgUp/PgDn details · q/esc close";
	}

	private toggleFocusedPane(): void {
		if (!this.hasStackPane()) return;
		this.focusedPane = this.focusedPane === "stack" ? "checks" : "stack";
		this.tui.requestRender();
	}

	private moveFocusedSelection(delta: number): void {
		if (this.focusedPane === "stack") {
			this.moveStackSelection(delta);
			return;
		}
		this.moveCheckSelection(delta);
	}

	private descendToChecks(): void {
		if (this.focusedPane !== "stack") return;
		this.focusedPane = "checks";
		this.tui.requestRender();
	}

	private ascendToStack(): void {
		if (!this.hasStackPane() || this.focusedPane === "stack") return;
		this.focusedPane = "stack";
		this.tui.requestRender();
	}

	private moveStackSelection(delta: number): void {
		const entries = previewChecksStackEntries(this.model);
		const next = moveIndex(this.selectedTargetIndex, delta, entries.length - 1);
		if (next === null) return;
		this.selectedTargetIndex = next;
		this.selectedCheckIndex = 0;
		this.listScroll = 0;
		this.detailScroll = 0;
		this.tui.requestRender();
	}

	private moveCheckSelection(delta: number): void {
		const entry = previewChecksStackEntries(this.model)[this.selectedTargetIndex];
		if (entry === undefined) return;
		const next = moveIndex(this.selectedCheckIndex, delta, entry.checks.length - 1);
		if (next === null) return;
		this.selectedCheckIndex = next;
		this.detailScroll = 0;
		this.tui.requestRender();
	}

	private scrollDetails(delta: number): void {
		this.detailScroll = Math.max(0, this.detailScroll + delta);
		this.tui.requestRender();
	}

	private async loadSelectedCheckLogs(): Promise<void> {
		const entry = previewChecksStackEntries(this.model)[this.selectedTargetIndex];
		const check = entry?.checks[this.selectedCheckIndex];
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

export function stackListRows(options: { totalRows: number; stackCount: number }): number {
	const availableRows = Math.max(1, Math.floor(options.totalRows * 0.35));
	const preferredRows = Math.max(2, Math.floor(options.totalRows * 0.22));
	return clamp(Math.min(options.stackCount, preferredRows), 1, availableRows);
}

export function checkListRows(options: { totalRows: number; checkCount: number }): number {
	const availableRows = Math.max(1, options.totalRows - 3);
	const preferredRows = Math.max(4, Math.floor(options.totalRows * 0.55));
	return clamp(Math.min(options.checkCount, preferredRows), 1, availableRows);
}

export function buildPreviewHeaderLines(model: PrPreviewChecksViewModel): string[] {
	const entries = previewChecksStackEntries(model);
	if (entries.length > 1) {
		const counts = aggregatePreviewChecksCounts(entries);
		const current = effectiveBranch(model.target) ?? "?";
		return [
			`Stack checks preview · ${entries.length} PRs · current ${current}`,
			`checks ${countsSummary(counts)} · snapshot ${model.fetchedAt.toISOString()}`,
		];
	}
	const head = effectiveBranch(model.target) ?? "?";
	const base = model.target.base_ref_name ?? "?";
	const counts = model.counts;
	return [
		`PR #${model.target.pr_number}: ${model.target.title ?? "(untitled)"}`,
		`${head} → ${base} · checks ${countsSummary(counts)} · snapshot ${model.fetchedAt.toISOString()}`,
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

function initialTargetIndex(model: PrPreviewChecksViewModel): number {
	const entries = previewChecksStackEntries(model);
	const modelBranch = effectiveBranch(model.target);
	if (modelBranch === null) return 0;
	const index = entries.findIndex((entry) => effectiveBranch(entry.target) === modelBranch);
	return index === -1 ? 0 : index;
}

function moveIndex(current: number, delta: number, max: number): number | null {
	if (max < 0) return null;
	const next = clamp(current + delta, 0, max);
	return next === current ? null : next;
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
