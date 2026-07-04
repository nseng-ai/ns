/**
 * Pure layout/presentation math for the stack-view compose overlay mode. Mirrors
 * the shape of `overlay-model.ts`: plain-data helpers plus wrap/slice idioms that
 * a view component colorizes and lays out. This module performs no I/O, reads no
 * clock, and never touches the Pi TUI runtime.
 *
 * The compose body stacks a bottom-anchored transcript window, an inner divider,
 * the embedded editor, a second divider, and a draft pane. {@link composeBodyLayout}
 * apportions the rows; {@link composeTranscriptWindow} wraps and slices the
 * scrollback (reused for the tail-anchored draft pane).
 */
import { clamp } from "@ns/pi/terminal/layout";

import { sliceAnchoredStackLinesForViewport } from "./overlay-model.ts";
import type { ComposeTranscriptState } from "./compose-transcript.ts";
import type { StackThemeColor } from "./format.ts";

export interface ComposeBodyLayout {
	transcriptRows: number;
	/** 1 means the draft pane collapses to a single status line. */
	draftRows: number;
}

/**
 * Apportion the compose body's rows between the transcript scrollback and the
 * draft pane. Below 12 rows the draft collapses to a single status line; above
 * that it takes ~30% of the body (3–10 rows). The transcript claims whatever
 * remains after the draft, the editor, and the two divider lines, floored at 1.
 */
export function composeBodyLayout(options: {
	bodyRows: number;
	editorRows: number;
}): ComposeBodyLayout {
	const draftRows = options.bodyRows >= 12 ? clamp(Math.floor(options.bodyRows * 0.3), 3, 10) : 1;
	const transcriptRows = Math.max(1, options.bodyRows - draftRows - options.editorRows - 2);
	return { transcriptRows, draftRows };
}

/** The role of one flattened transcript line; the view maps each role to a theme color. */
export type ComposeLineRole = "user" | "assistant" | "notice";

export const COMPOSE_ROLE_DISPLAY: Record<
	ComposeLineRole,
	{ prefix: string; color: StackThemeColor }
> = {
	user: { prefix: "you: ", color: "accent" },
	assistant: { prefix: "agent: ", color: "text" },
	notice: { prefix: "", color: "dim" },
};

/** One flattened transcript line, tagged with its role for colorization. */
export interface ComposeTranscriptLine {
	role: ComposeLineRole;
	text: string;
}

/**
 * Flatten the transcript entries into role-tagged lines: user entries gain a
 * `you: ` prefix, assistant entries an `agent: ` prefix, notices carry through
 * verbatim. Multi-line entries split on newline; only the first line is prefixed.
 */
export function flattenComposeTranscript(state: ComposeTranscriptState): ComposeTranscriptLine[] {
	const lines: ComposeTranscriptLine[] = [];
	for (const entry of state.entries) {
		const display = COMPOSE_ROLE_DISPLAY[entry.kind];
		const parts = entry.text.split("\n");
		parts.forEach((part, index) => {
			lines.push({ role: entry.kind, text: index === 0 ? `${display.prefix}${part}` : part });
		});
	}
	return lines;
}

/** The visible slice of a wrapped, bottom-anchored line list plus the clamped scroll. */
export interface ComposeWindow {
	lines: string[];
	scrollFromBottom: number;
}

/**
 * Slice a bottom-anchored window of `rows` wrapped lines. `scrollFromBottom`
 * measures rows scrolled up from the bottom edge (0 pins to the newest content)
 * and is clamped to the wrapped bounds.
 */
export function composeTranscriptWindow(options: {
	lines: readonly string[];
	width: number;
	rows: number;
	scrollFromBottom: number;
}): ComposeWindow {
	const viewport = sliceAnchoredStackLinesForViewport({
		lines: options.lines,
		width: options.width,
		rows: options.rows,
		scroll: options.scrollFromBottom,
		anchor: "end",
	});
	return { lines: viewport.lines, scrollFromBottom: viewport.scroll };
}

/** Line count of a draft block; a null or empty draft counts as zero lines. */
export function draftLineCount(draft: string | null): number {
	if (draft === null || draft.length === 0) return 0;
	return draft.split("\n").length;
}
