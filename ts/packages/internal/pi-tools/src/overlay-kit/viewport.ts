/**
 * Generic detail-pane viewport math shared by the bordered overlay modals
 * (`stack-view`, `pr-previews`). Wrapping and scroll-slicing are pure string
 * transformations with no feature or theme knowledge; the per-feature detail
 * models feed already-colored lines through these helpers.
 */
import { wrapTextWithAnsi } from "@earendil-works/pi-tui";

import { clamp } from "@nseng-ai/pi/terminal/layout";

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
	const viewport = wrapDetailLinesForViewport(options);
	return {
		lines: viewport.lines.slice(viewport.scroll, viewport.scroll + options.rows),
		scroll: viewport.scroll,
		maxScroll: viewport.maxScroll,
	};
}

export function wrapDetailLinesForViewport(
	options: WrappedDetailViewportOptions,
): WrappedDetailViewport {
	const lines = wrapDetailLines(options.lines, options.width);
	const maxScroll = Math.max(0, lines.length - options.rows);
	const scroll = clamp(options.scroll, 0, maxScroll);
	return { lines, scroll, maxScroll };
}

export function wrapDetailLines(lines: readonly string[], width: number): string[] {
	return lines.flatMap((line) => {
		if (line === "") return [""];
		const wrapped = wrapTextWithAnsi(line, Math.max(1, width));
		return wrapped.length === 0 ? [""] : wrapped;
	});
}
