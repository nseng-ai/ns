/**
 * Bordered modal chrome shared by the overlay views (`stack-view`,
 * `pr-previews`). Every interactive overlay renders the same box: a top border,
 * header lines, an inner divider, a body region, a divider, a footer line, and a
 * bottom border. These helpers own that assembly plus the row budget math so the
 * views only supply already-colored header/body/footer content and a border
 * colorizer.
 */
import { fitToWidth } from "@nseng-ai/pi/terminal/layout";

import { OVERLAY_MARGIN, OVERLAY_MAX_HEIGHT_RATIO } from "./viewport.ts";

/** Rows assumed when the host reports no terminal height. */
export const FALLBACK_TERMINAL_ROWS = 24;
/** Floor width the chrome renders at; narrower terminals still get a full box. */
export const MIN_RENDER_WIDTH = 40;

/** Resolve the terminal row count, applying the fallback when the host omits it. */
export function overlayTerminalRows(rows: number | null | undefined): number {
	return rows ?? FALLBACK_TERMINAL_ROWS;
}

/** Content width inside the border: `safeWidth - 2`, floored at 1. */
export function overlayInnerWidth(width: number): number {
	return Math.max(1, Math.max(MIN_RENDER_WIDTH, width) - 2);
}

/**
 * Chrome row count for a header of `headerLength` lines: top border + header +
 * inner divider + divider + footer + bottom border.
 */
export function overlayChromeRows(headerLength: number): number {
	return 2 + headerLength + 1 + 1 + 1;
}

/**
 * Number of rows the modal may render before the host overlay clips it. Mirrors
 * the TUI's `maxHeight = min(floor(rows * ratio), rows - 2 * margin)` so the
 * footer and bottom border stay inside the visible overlay.
 */
export function overlayModalRows(terminalRows: number): number {
	const available = Math.max(1, terminalRows - 2 * OVERLAY_MARGIN);
	const budget = Math.min(Math.floor(terminalRows * OVERLAY_MAX_HEIGHT_RATIO), available);
	return Math.max(1, budget);
}

export interface OverlayFrameOptions {
	/** Already-colored header lines, rendered between the top border and the inner divider. */
	header: readonly string[];
	/** Already-colored body lines, rendered between the inner divider and the footer divider. */
	body: readonly string[];
	/** Already-colored footer line, rendered on its own row above the bottom border. */
	footer: string;
	/** The raw render width the host requested; the frame clamps it to {@link MIN_RENDER_WIDTH}. */
	width: number;
	/** Colorizes the border glyphs (the views pass their `border` theme color). */
	colorizeBorder: (text: string) => string;
}

/**
 * Assemble the full bordered-modal line array from header/body/footer content.
 * Encapsulates the border glyphs, the `│…│` box lines, and the final
 * width-fit so the three views share one byte-for-byte chrome.
 */
export function renderOverlayFrame(options: OverlayFrameOptions): string[] {
	const safeWidth = Math.max(MIN_RENDER_WIDTH, options.width);
	const innerWidth = Math.max(1, safeWidth - 2);
	const border = (left: string, right: string): string =>
		options.colorizeBorder(`${left}${"─".repeat(Math.max(0, safeWidth - 2))}${right}`);
	const boxLine = (value: string): string =>
		options.colorizeBorder("│") + fitToWidth(value, innerWidth) + options.colorizeBorder("│");
	return [
		border("┌", "┐"),
		...options.header.map((line) => boxLine(line)),
		border("├", "┤"),
		...options.body.map((line) => boxLine(line)),
		border("├", "┤"),
		boxLine(options.footer),
		border("└", "┘"),
	].map((line) => fitToWidth(line, options.width));
}
