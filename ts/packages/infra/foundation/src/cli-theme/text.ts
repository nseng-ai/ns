// Width and layout helpers for ns CLI theme. Layout math must measure VISIBLE cells, not bytes, so
// `visibleWidth` strips terminal escapes before counting and the padders pad by plain width.

import { stripTerminalEscapes } from "../primitives/terminal-escapes.ts";

// LIMITATION: width is `.length`-based (UTF-16 code units after stripping escapes). It is NOT east-asian-
// wide aware — CJK/full-width and emoji that occupy two terminal cells are counted as one. That is out
// of scope for this layer; callers needing grapheme-accurate width must measure upstream.
export function visibleWidth(text: string): number {
	return stripTerminalEscapes(text).length;
}

/** Truncate plain (unstyled) text to `width`, appending an ellipsis when it overflows. */
export function truncatePlain(text: string, width: number, ellipsis = "…"): string {
	if (width <= 0) return "";
	if (text.length <= width) return text;
	const mark = ellipsis.length < width ? ellipsis : ellipsis.slice(0, Math.max(0, width));
	return `${text.slice(0, width - mark.length)}${mark}`;
}

/** Right-pad plain text with spaces to `width`; a no-op when it is already at or beyond `width`. */
export function padPlain(text: string, width: number): string {
	return text.length >= width ? text : text + " ".repeat(width - text.length);
}

/** Pad a STYLED cell using its known plain width so SGR escapes do not skew column layout. */
export function padCell(colored: string, plain: string, width: number): string {
	const gap = width - plain.length;
	return gap > 0 ? colored + " ".repeat(gap) : colored;
}

/** Center a styled cell within `width` using its visible width so SGR escapes do not skew layout. */
export function centerCell(rendered: string, width: number): string {
	const renderedWidth = visibleWidth(rendered);
	if (renderedWidth >= width) return rendered;
	const totalPadding = width - renderedWidth;
	const leftPadding = Math.floor(totalPadding / 2);
	const rightPadding = totalPadding - leftPadding;
	return `${" ".repeat(leftPadding)}${rendered}${" ".repeat(rightPadding)}`;
}

/**
 * Greedy word-wrap of plain (unstyled) text to `width` columns, one array entry per line. Wrap
 * BEFORE styling: escapes are not stripped here, so styled input would mis-measure. Interior
 * whitespace runs collapse to single spaces, empty/whitespace-only input yields no lines, and a
 * word longer than `width` sits alone unbroken (paths and code spans are never split; the
 * terminal soft-wraps the rare overflow).
 */
export function wrapPlain(text: string, width: number): string[] {
	const floor = Math.max(1, width);
	const words = text
		.trim()
		.split(/\s+/u)
		.filter((word) => word.length > 0);
	const lines: string[] = [];
	let current = "";
	for (const word of words) {
		if (current === "") {
			current = word;
		} else if (current.length + 1 + word.length <= floor) {
			current = `${current} ${word}`;
		} else {
			lines.push(current);
			current = word;
		}
	}
	if (current !== "") lines.push(current);
	return lines;
}
