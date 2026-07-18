/**
 * Interactive bordered overlay for the `/stack:view` panel: a master/detail modal
 * with a header rollup, a scrolling list of stack rows, and a scrollable detail
 * pane for the selection.
 *
 * The component is pure presentation over an immutable {@link StackViewModel} and
 * performs no I/O. Every terminal side effect (open a URL, copy a branch,
 * refresh, close) is expressed as a settled {@link StackViewUiOutcome} the extension host
 * acts on. Selection indexes `model.prs` only — the virtual trunk row is never
 * focusable — and the final selection rides back with the outcome so the host can
 * re-open the panel preserving the user's place.
 */
import { Key, matchesKey } from "@earendil-works/pi-tui";
import type { Component, TUI } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";

import { clamp, fitToWidth, padRight, reconcileScroll } from "@nseng-ai/pi/terminal/layout";

import { checkPresentationColor, statusColor, type StackThemeColor } from "./format.ts";
import type { StackViewModel, StackViewPr } from "./types.ts";
import type { StackEnrichmentPort } from "./enrichment-engine.ts";
import { detachSubscription } from "./subscription.ts";
import {
	buildStackDetailRows,
	buildStackIdentityLine,
	buildStackRollupSegments,
	formatStackRowCells,
	stackListRows,
	type StackDetailRow,
	type StackRowCells,
} from "./overlay-model.ts";
import {
	overlayHostOptions,
	overlayRenderLayout,
	renderOverlayFrame,
	sliceWrappedDetailLinesForViewport,
} from "@nseng-ai/pi/terminal/overlay";

const BROWSE_FOOTER =
	"↑↓/jk move · o open · b copy branch · r refresh · PgUp/PgDn scroll · q/esc close";

/** Fixed cell widths for the right-hand columns of each list row. */
const THREADS_CELL_WIDTH = 9;
const CHECKS_CELL_WIDTH = 12;
const STATUS_CELL_WIDTH = 14;

/** What the user asked the host to do when the overlay settled. */
export type StackViewUiOutcome =
	| { action: "open"; url: string }
	| { action: "copy-branch"; branch: string }
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
	/** Optional enrichment engine backing the progressive detail-pane summaries. */
	enrichment?: StackEnrichmentPort;
}

/**
 * The Pi host `ui.custom` factory the overlay renders through: it mounts a custom
 * {@link Component} and resolves once the component calls `done`. Written once here
 * and reused by the extension's `CommandContext.ui`, whose richer shape (notify,
 * setStatus) structurally satisfies it.
 */
export interface StackViewCustomUi {
	custom?<T>(
		factory: (tui: TUI, theme: Theme, keybindings: unknown, done: (value: T) => void) => Component,
		options?: unknown,
	): Promise<T>;
}

/**
 * The narrow slice of the Pi command context the overlay needs: the UI gate plus
 * the `custom` renderer factory. Structurally satisfied by the extension's
 * `CommandContext`.
 */
export interface StackViewOverlayUiContext {
	hasUI: boolean;
	ui: StackViewCustomUi;
}

interface StackViewOverlayOptions {
	tui: TUI;
	theme: Theme;
	model: StackViewModel;
	initialIndex: number;
	done: (result: StackViewUiResult) => void;
	enrichment?: StackEnrichmentPort;
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
			new StackViewOverlay({
				tui,
				theme,
				model,
				initialIndex,
				done,
				...(options.enrichment === undefined ? {} : { enrichment: options.enrichment }),
			}),
		overlayHostOptions(),
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
	private readonly enrichment: StackEnrichmentPort | undefined;
	private selectedIndex: number;
	private listScroll: number;
	private detailScroll: number;
	/** Live `onChange` unsubscribe; cleared once disposed so teardown is idempotent. */
	private unsubscribe: (() => void) | undefined;

	constructor(options: StackViewOverlayOptions) {
		this.tui = options.tui;
		this.theme = options.theme;
		this.model = options.model;
		this.done = options.done;
		this.enrichment = options.enrichment;
		this.selectedIndex = options.initialIndex;
		this.listScroll = 0;
		this.detailScroll = 0;
		this.unsubscribe = this.enrichment?.onChange(() => this.tui.requestRender());
		this.ensureSelectionEnriched();
	}

	/** Fire-and-forget: queue enrichment for the currently selected row. */
	private ensureSelectionEnriched(): void {
		const pr = this.selectedPr;
		if (pr !== undefined) this.enrichment?.ensureRow(pr);
	}

	private get selectedPr(): StackViewPr | undefined {
		return this.model.prs[this.selectedIndex];
	}

	/** Drop the enrichment `onChange` subscription; safe to call more than once. */
	private disposeSubscription(): void {
		this.unsubscribe = detachSubscription(this.unsubscribe);
	}

	/** Host teardown hook: the `ctx.ui.custom` contract may call this on unmount. */
	dispose(): void {
		this.disposeSubscription();
	}

	render(width: number): string[] {
		const header = [
			this.color("text", buildStackIdentityLine(this.model)),
			this.renderRollupLine(),
		];
		const { innerWidth, bodyRows } = overlayRenderLayout({
			width,
			terminalRows: this.tui.terminal.rows,
			headerLength: header.length,
		});
		const footer = this.color("dim", BROWSE_FOOTER);
		const body = this.renderBody(innerWidth, bodyRows);
		return renderOverlayFrame({
			header,
			body,
			footer,
			width,
			colorizeBorder: (text) => this.color("border", text),
		});
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
		if (data === "b") {
			this.settleCopyBranch();
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

	private renderRollupLine(): string {
		const separator = this.color("dim", " · ");
		return buildStackRollupSegments(this.model)
			.map((segment) => this.color(segment.color, segment.text))
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
		const isSelected = index === this.selectedIndex;
		const isCurrent = pr.branch === this.model.currentBranch;
		const cells = formatStackRowCells(pr);
		const selectionMarker = isSelected ? "▸ " : "  ";
		const currentMarker = isCurrent ? this.color("accent", "*") : " ";
		const leading = `${selectionMarker}${currentMarker} `;
		const cellsBlock = this.renderRowCells(pr, cells);
		const cellsWidth = THREADS_CELL_WIDTH + 2 + CHECKS_CELL_WIDTH + 2 + STATUS_CELL_WIDTH;
		const labelWidth = Math.max(1, width - 4 - 2 - cellsWidth);
		const label = isSelected ? this.color("accent", cells.label) : this.color("text", cells.label);
		const row = `${leading}${fitToWidth(label, labelWidth)}  ${cellsBlock}`;
		if (!isSelected) return fitToWidth(row, width);
		return this.theme.bg("selectedBg", fitToWidth(row, width));
	}

	private renderRowCells(pr: StackViewPr, cells: StackRowCells): string {
		const threadsColor: StackThemeColor =
			pr.threads.total - pr.threads.resolved > 0 ? "warning" : "muted";
		const threads = padRight(this.color(threadsColor, cells.threads), THREADS_CELL_WIDTH);
		const checks = padRight(
			this.color(checkPresentationColor(cells.checkPresentation), cells.checks),
			CHECKS_CELL_WIDTH,
		);
		const status = padRight(
			this.color(statusColor(pr.status), cells.statusWord),
			STATUS_CELL_WIDTH,
		);
		return `${threads}  ${checks}  ${status}`;
	}

	private renderDetailLines(width: number, rows: number): string[] {
		const detailRows = buildStackDetailRows(this.selectedPr, this.enrichment?.snapshot());
		const lines = detailRows.map((row) => this.colorizeDetailRow(row));
		// The degradation notice is pinned below the scroll viewport (not part of
		// the scrollable lines) so it stays visible on tall detail content.
		const degradedReason = this.enrichment?.degradedReason();
		const notice =
			degradedReason === undefined || degradedReason === null
				? undefined
				: this.color("dim", `(summaries unavailable: ${degradedReason})`);
		if (notice !== undefined && rows <= 1) return [fitToWidth(notice, width)];
		const bodyRows = notice === undefined ? rows : rows - 1;
		const viewport = sliceWrappedDetailLinesForViewport({
			lines,
			width,
			rows: bodyRows,
			scroll: this.detailScroll,
		});
		this.detailScroll = viewport.scroll;
		const rendered = Array.from({ length: bodyRows }, (_unused, row) =>
			fitToWidth(viewport.lines[row] ?? "", width),
		);
		if (notice !== undefined) rendered.push(fitToWidth(notice, width));
		return rendered;
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
			case "check-expected-pending":
				return this.color("muted", row.text);
			case "check-cancelled":
				return this.color("muted", row.text);
			case "summary-pending":
				return this.color("dim", row.text);
			case "thread-summary":
				return this.color("text", row.text);
			case "check-why":
				return this.color("text", row.text);
			case "check-passing":
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
		this.ensureSelectionEnriched();
		this.tui.requestRender();
	}

	private settleOpen(): void {
		const selected = this.selectedPr;
		// A `no-pr` row (or any row without a Graphite URL) has nothing to open;
		// ignore the keypress rather than settling on an empty URL.
		if (selected === undefined || selected.graphiteUrl.length === 0) return;
		this.settle({ action: "open", url: selected.graphiteUrl });
	}

	private settleCopyBranch(): void {
		const selected = this.selectedPr;
		if (selected === undefined) return;
		this.settle({ action: "copy-branch", branch: selected.branch });
	}

	private scrollDetails(delta: number): void {
		this.detailScroll = Math.max(0, this.detailScroll + delta);
		this.tui.requestRender();
	}

	private settle(outcome: StackViewUiOutcome): void {
		this.disposeSubscription();
		this.done({ outcome, selectedIndex: this.selectedIndex });
	}

	private color(color: StackThemeColor, value: string): string {
		return this.theme.fg(color, value);
	}
}
