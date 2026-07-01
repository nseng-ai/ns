import { wrapTextWithAnsi } from "@earendil-works/pi-tui";

import { clamp } from "@sdl/pi/terminal/layout";

/**
 * Overlay sizing shared by PR preview modals. The host overlay clips rendered
 * lines to `floor(rows * maxHeight)` capped by `rows - 2 * margin`; views that
 * size themselves to the overlay budget should use these same values.
 */
export const PREVIEW_OVERLAY_MAX_HEIGHT_RATIO = 0.85;
export const PREVIEW_OVERLAY_MARGIN = 1;

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

export interface PreviewTargetLocator {
	pr_number: number | null;
	branch: string | null;
}

export function missingPreviewTargetMessage(target: PreviewTargetLocator): string {
	if (target.pr_number !== null) return `No PR found for PR ${target.pr_number}.`;
	if (target.branch !== null) return `No open PR found for branch ${target.branch}.`;
	return "No open PR found for the current branch.";
}

export type CheckLogSummaryMarkdownSegment =
	| { kind: "bold"; text: string }
	| { kind: "code"; text: string }
	| { kind: "plain"; text: string };

const CHECK_LOG_SUMMARY_MARKDOWN_PATTERN = /\*\*([^*]+)\*\*|`([^`]+)`/g;

/**
 * Intentionally narrow inline parser for model-generated one-line check log
 * summaries. It recognizes only bold labels and code spans; general markdown
 * rendering stays out of this view helper.
 */
export function parseCheckLogSummaryMarkdownLine(line: string): CheckLogSummaryMarkdownSegment[] {
	const segments: CheckLogSummaryMarkdownSegment[] = [];
	let lastIndex = 0;
	for (const match of line.matchAll(CHECK_LOG_SUMMARY_MARKDOWN_PATTERN)) {
		const matchIndex = match.index;
		if (matchIndex > lastIndex)
			segments.push({ kind: "plain", text: line.slice(lastIndex, matchIndex) });
		const [, bold, code] = match;
		segments.push(
			bold !== undefined ? { kind: "bold", text: bold } : { kind: "code", text: code ?? "" },
		);
		lastIndex = matchIndex + match[0].length;
	}
	if (lastIndex < line.length) segments.push({ kind: "plain", text: line.slice(lastIndex) });
	return segments;
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
