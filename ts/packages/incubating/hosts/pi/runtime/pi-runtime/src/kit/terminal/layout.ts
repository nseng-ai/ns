import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

/** Truncate-then-pad to an exact display width (ANSI- and wide-glyph-aware). */
export function fitToWidth(text: string, width: number): string {
	return padRight(truncateToWidth(text, width, "…", true), width);
}

export function padRight(text: string, width: number): string {
	const missing = Math.max(0, width - visibleWidth(text));
	return text + " ".repeat(missing);
}

export function reconcileScroll(options: {
	scroll: number;
	anchor: number;
	areaHeight: number;
	totalLines: number;
}): number {
	const anchored = clamp(options.scroll, options.anchor - options.areaHeight + 1, options.anchor);
	return clamp(anchored, 0, Math.max(0, options.totalLines - options.areaHeight));
}

export function clamp(value: number, min: number, max: number): number {
	if (max < min) return min;
	return Math.max(min, Math.min(max, value));
}
