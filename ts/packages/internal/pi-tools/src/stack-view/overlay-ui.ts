/**
 * Interactive bordered overlay for the `/stack:view` panel. Modeled line-for-line
 * on {@link PrPreviewFeedbackView}: a master/detail modal with a header rollup, a
 * scrolling list of stack rows, and a scrollable detail pane for the selection.
 *
 * The component is pure presentation over an immutable {@link StackViewModel} and
 * performs no I/O. Every terminal side effect (open a URL, summarize, refresh,
 * close) is expressed as a settled {@link StackViewUiOutcome} the extension host
 * acts on. Selection indexes `model.prs` only — the virtual trunk row is never
 * focusable — and the final selection rides back with the outcome so the host can
 * re-open the panel preserving the user's place.
 */
import { Key, matchesKey } from "@earendil-works/pi-tui";
import type { Component, TUI } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";

import { clamp, fitToWidth, padRight, reconcileScroll } from "@nseng-ai/pi/terminal/layout";

import type { StackViewModel, StackViewPr } from "./types.ts";
import {
	buildStackDetailRows,
	buildStackIdentityLine,
	buildStackRollupSegments,
	formatStackRowCells,
	sliceStackDetailLinesForViewport,
	stackListRows,
	STACK_OVERLAY_MARGIN,
	STACK_OVERLAY_MAX_HEIGHT_RATIO,
	type StackDetailRow,
	type StackRowCells,
} from "./overlay-model.ts";

const FALLBACK_TERMINAL_ROWS = 24;
const MIN_RENDER_WIDTH = 40;

/** Fixed cell widths for the right-hand columns of each list row. */
const THREADS_CELL_WIDTH = 9;
const CHECKS_CELL_WIDTH = 9;
const STATUS_CELL_WIDTH = 14;

type StackThemeColor =
	| "text"
	| "muted"
	| "accent"
	| "warning"
	| "error"
	| "success"
	| "dim"
	| "border";

/** What the user asked the host to do when the overlay settled. */
export type StackViewUiOutcome =
	| { action: "open"; url: string }
	| { action: "summarize" }
	| { action: "refresh" }
	| { action: "close" };

/** The settled result of one overlay session: the outcome plus the final selection. */
export interface StackViewUiResult {
	outcome: StackViewUiOutcome;
	selectedIndex: number;
}

/** Options for {@link runStackViewOverlayUi}; `selectedIndex` seeds the initial selection. */
export interface StackViewOverlayUiOptions {
	selectedIndex?: number;
}

/**
 * The narrow slice of the Pi command context the overlay needs: the UI gate plus
 * the `custom` renderer factory. Structurally satisfied by the extension's
 * `CommandContext`.
 */
export interface StackViewOverlayUiContext {
	hasUI: boolean;
	ui: {
		custom?<T>(
			factory: (
				tui: TUI,
				theme: Theme,
				keybindings: unknown,
				done: (value: T) => void,
			) => Component,
			options?: unknown,
		): Promise<T>;
	};
}

interface StackViewOverlayOptions {
	tui: TUI;
	theme: Theme;
	model: StackViewModel;
	initialIndex: number;
	done: (result: StackViewUiResult) => void;
}

/**
 * Run the interactive stack-view overlay. Returns `undefined` when the host has
 * no interactive UI (`!ctx.hasUI` or `ctx.ui.custom === undefined`) so the caller
 * can fall back to a plain snapshot; otherwise resolves once the user settles the
 * panel, carrying the outcome and the final selection.
 */
export function runStackViewOverlayUi(
	model: StackViewModel,
	ctx: StackViewOverlayUiContext,
	options: StackViewOverlayUiOptions = {},
): Promise<StackViewUiResult | undefined> {
	if (!ctx.hasUI || ctx.ui.custom === undefined) return Promise.resolve(undefined);
	const initialIndex = resolveInitialIndex(model, options.selectedIndex);
	return ctx.ui.custom<StackViewUiResult>(
		(tui, theme, _keybindings, done) =>
			new StackViewOverlay({ tui, theme, model, initialIndex, done }),
		{
			overlay: true,
			overlayOptions: {
				width: "90%",
				maxHeight: `${Math.round(STACK_OVERLAY_MAX_HEIGHT_RATIO * 100)}%`,
				margin: STACK_OVERLAY_MARGIN,
			},
			onHandle: (handle: { focus(): void }) => handle.focus(),
		},
	);
}

/**
 * Seed the initial selection: an explicit request wins (clamped), else the
 * current-branch row, else the top of the stack (0 when the stack is empty).
 */
function resolveInitialIndex(model: StackViewModel, requested: number | undefined): number {
	const count = model.prs.length;
	if (count === 0) return 0;
	if (requested !== undefined) return clamp(requested, 0, count - 1);
	const currentIndex = model.prs.findIndex((row) => row.branch === model.currentBranch);
	return currentIndex >= 0 ? currentIndex : 0;
}

export class StackViewOverlay implements Component {
	private readonly tui: TUI;
	private readonly theme: Theme;
	private readonly model: StackViewModel;
	private readonly done: (result: StackViewUiResult) => void;
	private selectedIndex: number;
	private listScroll: number;
	private detailScroll: number;

	constructor(options: StackViewOverlayOptions) {
		this.tui = options.tui;
		this.theme = options.theme;
		this.model = options.model;
		this.done = options.done;
		this.selectedIndex = options.initialIndex;
		this.listScroll = 0;
		this.detailScroll = 0;
	}

	render(width: number): string[] {
		const safeWidth = Math.max(MIN_RENDER_WIDTH, width);
		const innerWidth = Math.max(1, safeWidth - 2);
		const height = this.modalRows();
		const header = [
			this.color("text", buildStackIdentityLine(this.model)),
			this.renderRollupLine(),
		];
		const footer = this.color(
			"dim",
			"↑↓/jk move · o open · s summarize · r refresh · PgUp/PgDn scroll · q/esc close",
		);
		const chromeRows = 7;
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
			this.settle({ action: "close" });
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
		if (matchesKey(data, Key.enter) || data === "o") {
			this.settleOpen();
			return;
		}
		if (data === "s") {
			this.settle({ action: "summarize" });
			return;
		}
		if (data === "r") {
			this.settle({ action: "refresh" });
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
		const available = Math.max(1, rows - 2 * STACK_OVERLAY_MARGIN);
		const budget = Math.min(Math.floor(rows * STACK_OVERLAY_MAX_HEIGHT_RATIO), available);
		return Math.max(1, budget);
	}

	private renderRollupLine(): string {
		const separator = this.color("dim", " · ");
		return buildStackRollupSegments(this.model)
			.map((segment) => this.color(themeColorName(segment.color), segment.text))
			.join(separator);
	}

	private renderBody(width: number, rows: number): string[] {
		if (this.model.prs.length === 0) return this.renderEmptyBody(width, rows);
		this.selectedIndex = clamp(this.selectedIndex, 0, this.model.prs.length - 1);
		const totalListRows = this.model.prs.length + 1;
		const listRows = stackListRows({ bodyRows: rows, rowCount: totalListRows });
		const detailRows = Math.max(1, rows - listRows - 1);
		this.listScroll = reconcileScroll({
			scroll: this.listScroll,
			anchor: this.selectedIndex,
			areaHeight: listRows,
			totalLines: totalListRows,
		});
		return [
			...this.renderListLines(width, listRows),
			this.color("dim", "─".repeat(Math.max(1, width))),
			...this.renderDetailLines(width, detailRows),
		];
	}

	private renderEmptyBody(width: number, rows: number): string[] {
		const lines = [
			this.color("dim", "(no stacked branches)"),
			this.color("dim", `─ ${this.model.trunk}`),
		];
		return Array.from({ length: rows }, (_unused, index) => fitToWidth(lines[index] ?? "", width));
	}

	private renderListLines(width: number, rows: number): string[] {
		return Array.from({ length: rows }, (_unused, row) => {
			const index = this.listScroll + row;
			const pr = this.model.prs[index];
			if (pr !== undefined) return this.renderPrRow(pr, index, width);
			if (index === this.model.prs.length) {
				return fitToWidth(this.color("dim", `  ─ ${this.model.trunk}`), width);
			}
			return "";
		});
	}

	private renderPrRow(pr: StackViewPr, index: number, width: number): string {
		const selected = index === this.selectedIndex;
		const isCurrent = pr.branch === this.model.currentBranch;
		const cells = formatStackRowCells(pr);
		const selectionMarker = selected ? "▸ " : "  ";
		const currentMarker = isCurrent ? this.color("accent", "*") : " ";
		const leading = `${selectionMarker}${currentMarker} `;
		const cellsBlock = this.renderRowCells(pr, cells);
		const cellsWidth = THREADS_CELL_WIDTH + 2 + CHECKS_CELL_WIDTH + 2 + STATUS_CELL_WIDTH;
		const labelWidth = Math.max(1, width - 4 - 2 - cellsWidth);
		const label = selected ? this.color("accent", cells.label) : this.color("text", cells.label);
		const row = `${leading}${fitToWidth(label, labelWidth)}  ${cellsBlock}`;
		if (!selected) return fitToWidth(row, width);
		return this.theme.bg("selectedBg", fitToWidth(row, width));
	}

	private renderRowCells(pr: StackViewPr, cells: StackRowCells): string {
		const threadsColor: StackThemeColor =
			pr.threads.total - pr.threads.resolved > 0 ? "warning" : "muted";
		const threads = padRight(this.color(threadsColor, cells.threads), THREADS_CELL_WIDTH);
		const checks = padRight(
			this.color(checksCellColor(cells.checks), cells.checks),
			CHECKS_CELL_WIDTH,
		);
		const status = padRight(this.color(statusCellColor(pr), cells.statusWord), STATUS_CELL_WIDTH);
		return `${threads}  ${checks}  ${status}`;
	}

	private renderDetailLines(width: number, rows: number): string[] {
		const detailRows = buildStackDetailRows(this.model.prs[this.selectedIndex]);
		const lines = detailRows.map((row) => this.colorizeDetailRow(row));
		const viewport = sliceStackDetailLinesForViewport({
			lines,
			width,
			rows,
			scroll: this.detailScroll,
		});
		this.detailScroll = viewport.scroll;
		return Array.from({ length: rows }, (_unused, row) =>
			fitToWidth(viewport.lines[row] ?? "", width),
		);
	}

	private colorizeDetailRow(row: StackDetailRow): string {
		switch (row.role) {
			case "identity":
				return this.color("accent", this.theme.bold(row.text));
			case "branch":
				return this.color("muted", row.text);
			case "url":
				return this.color("accent", row.text);
			case "section":
				return this.color("muted", row.text);
			case "check-failing":
				return this.color("error", row.text);
			case "thread":
				return this.color("warning", row.text);
			case "check-pending":
				return this.color("warning", row.text);
			case "passing":
				return this.color("success", row.text);
			case "truncation-note":
				return this.color("dim", row.text);
			case "objectives":
				return this.color("muted", row.text);
			case "placeholder":
				return this.color("dim", row.text);
			case "spacer":
				return "";
		}
	}

	private moveSelection(delta: number): void {
		const count = this.model.prs.length;
		if (count === 0) return;
		const next = clamp(this.selectedIndex + delta, 0, count - 1);
		if (next === this.selectedIndex) return;
		this.selectedIndex = next;
		this.detailScroll = 0;
		this.tui.requestRender();
	}

	private settleOpen(): void {
		const selected = this.model.prs[this.selectedIndex];
		// A `no-pr` row (or any row without a Graphite URL) has nothing to open;
		// ignore the keypress rather than settling on an empty URL.
		if (selected === undefined || selected.graphiteUrl.length === 0) return;
		this.settle({ action: "open", url: selected.graphiteUrl });
	}

	private scrollDetails(delta: number): void {
		this.detailScroll = Math.max(0, this.detailScroll + delta);
		this.tui.requestRender();
	}

	private settle(outcome: StackViewUiOutcome): void {
		this.done({ outcome, selectedIndex: this.selectedIndex });
	}

	private color(color: StackThemeColor, value: string): string {
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

function checksCellColor(cell: string): StackThemeColor {
	if (cell.startsWith("✗")) return "error";
	if (cell.startsWith("⋯")) return "warning";
	if (cell.startsWith("✓")) return "success";
	return "muted";
}

function statusCellColor(pr: StackViewPr): StackThemeColor {
	switch (pr.status) {
		case "draft":
			return "muted";
		case "checks-failing":
			return "error";
		case "unresolved":
			return "warning";
		case "ready":
			return "success";
		case "no-pr":
			return "dim";
	}
}

/** Narrow a rollup segment's color name to a known theme color, defaulting to text. */
function themeColorName(name: string): StackThemeColor {
	switch (name) {
		case "muted":
		case "accent":
		case "warning":
		case "error":
		case "success":
		case "dim":
		case "border":
			return name;
		default:
			return "text";
	}
}
