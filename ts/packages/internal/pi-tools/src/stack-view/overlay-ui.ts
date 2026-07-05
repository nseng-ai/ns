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

import { checkBucketColor, statusColor, type StackThemeColor } from "./format.ts";
import type { StackViewModel, StackViewPr } from "./types.ts";
import type { StackEnrichmentPort } from "./enrichment-engine.ts";
import type { ComposeViewPort } from "./compose-controller.ts";
import { COMPOSE_FOOTER, ComposeView } from "./compose-view.ts";
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
	overlayChromeRows,
	overlayHostOptions,
	overlayInnerWidth,
	overlayModalRows,
	overlayTerminalRows,
	renderOverlayFrame,
} from "../overlay-kit/frame.ts";
import { sliceWrappedDetailLinesForViewport } from "../overlay-kit/viewport.ts";

const BROWSE_FOOTER =
	"↑↓/jk move · o open · b paste branch · s summarize · r refresh · PgUp/PgDn scroll · q/esc close";

/** Fixed cell widths for the right-hand columns of each list row. */
const THREADS_CELL_WIDTH = 9;
const CHECKS_CELL_WIDTH = 9;
const STATUS_CELL_WIDTH = 14;

/** What the user asked the host to do when the overlay settled. */
export type StackViewUiOutcome =
	| { action: "open"; url: string }
	| { action: "paste-branch"; branch: string }
	| { action: "summarize" }
	| { action: "refresh" }
	| { action: "compose-inject"; draft: string }
	| { action: "close" };

/**
 * Supplies the {@link ComposeViewPort} backing compose mode. `getPort` is invoked
 * on first entry into compose and memoizes a single host-owned port across the
 * overlay's lifetime (and across overlay reopens, so a live draft survives an
 * `open`-URL round-trip). The overlay attaches its own repaint listener via
 * {@link ComposeViewPort.onChange} and detaches it on teardown; the port itself
 * outlives the overlay. Absent this option, compose mode is unavailable.
 */
export interface StackViewComposeOption {
	getPort(): ComposeViewPort;
}

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
	/** Optional compose port factory; present only when the host has a model to draft with. */
	compose?: StackViewComposeOption;
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
	compose?: StackViewComposeOption;
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
				...(options.compose === undefined ? {} : { compose: options.compose }),
			}),
		overlayHostOptions(),
	);
}

/**
 * Seed the initial selection: an explicit request wins (clamped), else the
 * current-branch row, else the top of the stack (0 when the stack is empty).
 */
function detachSubscription(unsubscribe: (() => void) | undefined): undefined {
	unsubscribe?.();
	return undefined;
}

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
	private readonly compose: StackViewComposeOption | undefined;
	private selectedIndex: number;
	private listScroll: number;
	private detailScroll: number;
	/** "browse" is the master/detail panel; "compose" is the drafting side-session. */
	private mode: "browse" | "compose";
	/** Compose collaborator, fetched once on first entry and retained for the overlay's lifetime. */
	private composeView: ComposeView | undefined;
	/** Live `onChange` unsubscribe; cleared once disposed so teardown is idempotent. */
	private unsubscribe: (() => void) | undefined;

	constructor(options: StackViewOverlayOptions) {
		this.tui = options.tui;
		this.theme = options.theme;
		this.model = options.model;
		this.done = options.done;
		this.enrichment = options.enrichment;
		this.compose = options.compose;
		this.selectedIndex = options.initialIndex;
		this.listScroll = 0;
		this.detailScroll = 0;
		this.mode = "browse";
		this.composeView = undefined;
		this.unsubscribe = this.enrichment?.onChange(() => this.tui.requestRender());
		this.ensureSelectionEnriched();
	}

	/** Fire-and-forget: queue enrichment for the currently selected row. */
	private ensureSelectionEnriched(): void {
		const pr = this.model.prs[this.selectedIndex];
		if (pr !== undefined) this.enrichment?.ensureRow(pr);
	}

	/** Drop the enrichment and compose `onChange` subscriptions; safe to call more than once. */
	private disposeSubscription(): void {
		this.unsubscribe = detachSubscription(this.unsubscribe);
		this.composeView?.dispose();
	}

	/** Host teardown hook: the `ctx.ui.custom` contract may call this on unmount. */
	dispose(): void {
		this.disposeSubscription();
	}

	render(width: number): string[] {
		const innerWidth = overlayInnerWidth(width);
		const height = overlayModalRows(overlayTerminalRows(this.tui.terminal.rows));
		// Compose mode only renders when its port has been built (first entry); a
		// bare `mode === "compose"` with no port falls back to the browse panel.
		const composeView = this.mode === "compose" ? this.composeView : undefined;
		const header = [
			this.color("text", buildStackIdentityLine(this.model)),
			composeView === undefined ? this.renderRollupLine() : composeView.renderHeaderLine(),
		];
		const bodyRows = Math.max(1, height - overlayChromeRows(header.length));
		const footer = this.color(
			"dim",
			composeView === undefined ? this.browseFooter() : COMPOSE_FOOTER,
		);
		const body =
			composeView === undefined
				? this.renderBody(innerWidth, bodyRows)
				: composeView.renderBody(innerWidth, bodyRows);
		return renderOverlayFrame({
			header,
			body,
			footer,
			width,
			colorizeBorder: (text) => this.color("border", text),
		});
	}

	handleInput(data: string): void {
		if (this.mode === "compose") {
			this.handleComposeInput(data);
			return;
		}
		if (matchesKey(data, Key.escape) || data === "q") {
			this.settle({ action: "close" });
			return;
		}
		// `p` / Tab enter compose, but only when the host supplied a compose port
		// factory; otherwise the keys are inert in browse mode.
		if ((data === "p" || matchesKey(data, Key.tab)) && this.compose !== undefined) {
			this.enterCompose();
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
			this.settlePasteBranch();
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
			this.color(checkBucketColor(cells.checkBucket), cells.checks),
			CHECKS_CELL_WIDTH,
		);
		const status = padRight(
			this.color(statusColor(pr.status), cells.statusWord),
			STATUS_CELL_WIDTH,
		);
		return `${threads}  ${checks}  ${status}`;
	}

	private renderDetailLines(width: number, rows: number): string[] {
		const detailRows = buildStackDetailRows(
			this.model.prs[this.selectedIndex],
			this.enrichment?.snapshot(),
		);
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
		const selected = this.model.prs[this.selectedIndex];
		// A `no-pr` row (or any row without a Graphite URL) has nothing to open;
		// ignore the keypress rather than settling on an empty URL.
		if (selected === undefined || selected.graphiteUrl.length === 0) return;
		this.settle({ action: "open", url: selected.graphiteUrl });
	}

	private settlePasteBranch(): void {
		const selected = this.model.prs[this.selectedIndex];
		if (selected === undefined) return;
		this.settle({ action: "paste-branch", branch: selected.branch });
	}

	private scrollDetails(delta: number): void {
		this.detailScroll = Math.max(0, this.detailScroll + delta);
		this.tui.requestRender();
	}

	/** Switch to compose mode, fetching the port and building the collaborator on first entry. */
	private enterCompose(): void {
		this.mode = "compose";
		if (this.composeView === undefined && this.compose !== undefined) {
			this.composeView = new ComposeView({
				tui: this.tui,
				theme: this.theme,
				port: this.compose.getPort(),
			});
		}
		this.tui.requestRender();
	}

	private handleComposeInput(data: string): void {
		const result = this.composeView?.handleInput(data) ?? { type: "continue" };
		switch (result.type) {
			case "continue":
				return;
			case "back":
				this.mode = "browse";
				this.tui.requestRender();
				return;
			case "inject":
				this.settle({ action: "compose-inject", draft: result.draft });
				return;
		}
	}

	private browseFooter(): string {
		return this.compose === undefined ? BROWSE_FOOTER : `${BROWSE_FOOTER} · p compose`;
	}

	private settle(outcome: StackViewUiOutcome): void {
		this.disposeSubscription();
		this.done({ outcome, selectedIndex: this.selectedIndex });
	}

	private color(color: StackThemeColor, value: string): string {
		return this.theme.fg(color, value);
	}
}
