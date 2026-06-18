import { bg, bold, dim, fg, StyledText, type TextChunk } from "@opentui/core";

/**
 * Shared palette and chunk helpers for the sdlcc TUI frames.
 *
 * The app renders each frame as a single `TextRenderable` whose `content` is a
 * `StyledText` (a flat list of `TextChunk`s). These helpers keep colour usage
 * consistent across the dashboard and stack-map frames and make it cheap to
 * build aligned, coloured rows from plain layout strings.
 */
export const PALETTE = {
	text: "#cdd6f4",
	subtle: "#a6adc8",
	muted: "#6c7086",
	accent: "#89b4fa",
	mauve: "#cba6f7",
	green: "#a6e3a1",
	yellow: "#f9e2af",
	peach: "#fab387",
	red: "#f38ba8",
	selectionBg: "#313244",
} as const;

/** A text segment that inherits the renderable's default foreground colour. */
export function plain(text: string): TextChunk {
	return { __isChunk: true, text };
}

/** Pad a row out to `width` visible columns using a single uncoloured chunk. */
export function pad(width: number, currentLength: number): TextChunk {
	return plain(" ".repeat(Math.max(0, width - currentLength)));
}

/** Apply the selection background to every chunk of an already-built row. */
export function highlightRow(chunks: readonly TextChunk[]): TextChunk[] {
	return chunks.map((chunk) => bg(PALETTE.selectionBg)(chunk));
}

/** Join plain lines into a single newline-separated `StyledText`. */
export function styledLines(lines: readonly string[]): StyledText {
	return new StyledText(lines.flatMap((line, index): TextChunk[] => index === 0 ? [plain(line)] : [plain("\n"), plain(line)]));
}

/** Join per-line chunk arrays into a single newline-separated `StyledText`. */
export function joinLines(lines: readonly (readonly TextChunk[])[]): StyledText {
	const chunks: TextChunk[] = [];
	lines.forEach((line, index) => {
		if (index > 0) chunks.push(plain("\n"));
		chunks.push(...line);
	});
	return new StyledText(chunks);
}

/** Concatenate several `StyledText` frames, separated by blank lines. */
export function stackFrames(frames: readonly StyledText[]): StyledText {
	const chunks: TextChunk[] = [];
	frames.forEach((frame, index) => {
		if (index > 0) chunks.push(plain("\n\n"));
		chunks.push(...frame.chunks);
	});
	return new StyledText(chunks);
}

export { bg, bold, dim, fg };
