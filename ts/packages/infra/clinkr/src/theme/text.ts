// Width and layout helpers for clinkr's theme. Layout math must measure VISIBLE cells, not bytes, so
// `visibleWidth` strips terminal escapes before counting and the padders pad by plain width.

import { stripAnsi } from "../ansi.ts";

// LIMITATION: width is `.length`-based (UTF-16 code units after stripping escapes). It is NOT east-asian-
// wide aware — CJK/full-width and emoji that occupy two terminal cells are counted as one. That is out
// of scope for this layer; callers needing grapheme-accurate width must measure upstream.
export function visibleWidth(text: string): number {
	return stripAnsi(text).length;
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
