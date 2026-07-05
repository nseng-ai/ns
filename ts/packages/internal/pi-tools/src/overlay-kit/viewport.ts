/**
 * Generic detail-pane viewport math shared by the bordered overlay modals
 * (`stack-view`, `pr-previews`). Wrapping and scroll-slicing are pure string
 * transformations with no feature or theme knowledge; the per-feature detail
 * models feed already-colored lines through these helpers.
 */
import { wrapTextWithAnsi } from "@earendil-works/pi-tui";

import { clamp } from "@nseng-ai/pi/terminal/layout";

/**
 * Overlay sizing shared by the bordered modals. The host overlay clips rendered
 * lines to `floor(rows * maxHeight)` capped by `rows - 2 * margin`; views that
 * size themselves to the overlay budget should use these same values.
 */
export const OVERLAY_MAX_HEIGHT_RATIO = 0.85;
export const OVERLAY_MARGIN = 1;

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

export function wrapDetailLines(lines: readonly string[], width: number): string[] {
	return lines.flatMap((line) => {
		if (line === "") return [""];
		const wrapped = wrapTextWithAnsi(line, Math.max(1, width));
		return wrapped.length === 0 ? [""] : wrapped;
	});
}
