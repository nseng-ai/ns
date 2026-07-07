import type { TUI } from "@earendil-works/pi-tui";
import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";

import { clamp, fitToWidth, reconcileScroll } from "@nseng-ai/pi/terminal/layout";
import { overlayRenderLayout, renderOverlayFrame } from "../overlay-kit/frame.ts";
import { sliceWrappedDetailLinesForViewport, wrapDetailLines } from "../overlay-kit/viewport.ts";

export interface PreviewModalChromeOptions {
	tui: TUI;
	theme: Theme;
}

export interface PreviewModalFrameOptions {
	width: number;
	header: readonly string[];
	footer: string;
	renderBody: (width: number, rows: number) => string[];
}

export interface PreviewListDetailBodyOptions<TItem> {
	items: readonly TItem[];
	width: number;
	rows: number;
	listRows: number;
	renderRow: (item: TItem, actualIndex: number, width: number) => string;
	renderDetailLines: (item: TItem | undefined) => readonly string[];
	detailLabel?: string;
	emptyListLines?: readonly string[];
}

export interface PreviewScrollingListOptions<TItem> {
	items: readonly TItem[];
	width: number;
	rows: number;
	anchor: number;
	renderRow: (item: TItem, actualIndex: number, width: number) => string;
}

type PreviewChromeColor<TColor extends ThemeColor> = TColor | "border" | "dim" | "muted";
type PreviewChromeBackground = Parameters<Theme["bg"]>[0];

export class PreviewModalChrome<TColor extends ThemeColor> {
	private readonly tui: TUI;
	private readonly theme: Theme;
	private listScroll: number;
	private auxiliaryListScroll: number;
	private detailScroll: number;
	private selectedIndex: number;

	constructor(options: PreviewModalChromeOptions) {
		this.tui = options.tui;
		this.theme = options.theme;
		this.listScroll = 0;
		this.auxiliaryListScroll = 0;
		this.detailScroll = 0;
		this.selectedIndex = 0;
	}

	selected(): number {
		return this.selectedIndex;
	}

	setSelected(index: number): void {
		this.selectedIndex = index;
	}

	resetListAndDetailScroll(): void {
		this.listScroll = 0;
		this.detailScroll = 0;
	}

	resetForNewList(): void {
		this.selectedIndex = 0;
		this.resetListAndDetailScroll();
	}

	resetDetailScroll(): void {
		this.detailScroll = 0;
	}

	renderFrame(options: PreviewModalFrameOptions): string[] {
		const { innerWidth, bodyRows } = overlayRenderLayout({
			width: options.width,
			terminalRows: this.tui.terminal.rows,
			headerLength: options.header.length,
		});
		return renderOverlayFrame({
			header: options.header,
			body: options.renderBody(innerWidth, bodyRows),
			footer: options.footer,
			width: options.width,
			colorizeBorder: (text) => this.color("border", text),
		});
	}

	renderEmptyBody(lines: readonly string[], width: number, rows: number): string[] {
		const wrappedLines = wrapDetailLines(lines, width);
		return Array.from({ length: rows }, (_unused, index) =>
			fitToWidth(wrappedLines[index] ?? "", width),
		);
	}

	renderScrollingList<TItem>(options: PreviewScrollingListOptions<TItem>): string[] {
		this.auxiliaryListScroll = reconcileScroll({
			scroll: this.auxiliaryListScroll,
			anchor: options.anchor,
			areaHeight: Math.max(1, options.rows),
			totalLines: options.items.length,
		});
		const visibleItems = options.items.slice(
			this.auxiliaryListScroll,
			this.auxiliaryListScroll + options.rows,
		);
		return Array.from({ length: options.rows }, (_unused, row) => {
			const item = visibleItems[row];
			if (item === undefined) return "";
			return options.renderRow(item, this.auxiliaryListScroll + row, options.width);
		});
	}

	renderListDetailBody<TItem>(options: PreviewListDetailBodyOptions<TItem>): string[] {
		this.selectedIndex = clamp(this.selectedIndex, 0, Math.max(0, options.items.length - 1));
		this.listScroll = reconcileScroll({
			scroll: this.listScroll,
			anchor: this.selectedIndex,
			areaHeight: options.listRows,
			totalLines: options.items.length,
		});
		const detailRows = Math.max(
			1,
			options.rows - options.listRows - (options.detailLabel === undefined ? 1 : 2),
		);
		return [
			...this.renderListLines(options),
			this.color("dim", "─".repeat(Math.max(1, options.width))),
			...(options.detailLabel === undefined ? [] : [this.color("muted", options.detailLabel)]),
			...this.renderSelectedDetailLines(options, detailRows),
		];
	}

	moveSelection(itemCount: number, delta: number): boolean {
		if (itemCount === 0) return false;
		const next = clamp(this.selectedIndex + delta, 0, itemCount - 1);
		if (next === this.selectedIndex) return false;
		this.selectedIndex = next;
		this.detailScroll = 0;
		this.tui.requestRender();
		return true;
	}

	scrollDetails(delta: number): void {
		this.detailScroll = Math.max(0, this.detailScroll + delta);
		this.tui.requestRender();
	}

	color(color: PreviewChromeColor<TColor>, value: string): string {
		return this.theme.fg(color, value);
	}

	background(name: PreviewChromeBackground, value: string): string {
		return this.theme.bg(name, value);
	}

	bold(value: string): string {
		return this.theme.bold(value);
	}

	private renderListLines<TItem>(options: PreviewListDetailBodyOptions<TItem>): string[] {
		if (options.items.length === 0 && options.emptyListLines !== undefined) {
			return Array.from({ length: options.listRows }, (_unused, row) =>
				fitToWidth(options.emptyListLines?.[row] ?? "", options.width),
			);
		}
		const visibleItems = options.items.slice(this.listScroll, this.listScroll + options.listRows);
		return Array.from({ length: options.listRows }, (_unused, row) => {
			const item = visibleItems[row];
			if (item === undefined) return "";
			return options.renderRow(item, this.listScroll + row, options.width);
		});
	}

	private renderSelectedDetailLines<TItem>(
		options: PreviewListDetailBodyOptions<TItem>,
		rows: number,
	): string[] {
		const detailLines = options.renderDetailLines(options.items[this.selectedIndex]);
		const viewport = sliceWrappedDetailLinesForViewport({
			lines: detailLines,
			width: options.width,
			rows,
			scroll: this.detailScroll,
		});
		this.detailScroll = viewport.scroll;
		return Array.from({ length: rows }, (_unused, row) =>
			fitToWidth(viewport.lines[row] ?? "", options.width),
		);
	}
}
