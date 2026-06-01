import type { NormalizedGrillAskInput } from "../grill-ui.ts";
import { choiceDetailLines, footerText, rowRecommendationTag, type GrillAskMode, type GrillAskRow } from "./view.ts";

export interface GrillAskRenderTheme {
	fg?(color: string, text: string): string;
	bg?(color: string, text: string): string;
	bold?(text: string): string;
}

export interface GrillAskRenderPrimitives {
	truncateToWidth?: (value: string, width: number, ellipsis?: string) => string;
	wrapTextWithAnsi?: (value: string, width: number) => string[];
	visibleWidth?: (value: string) => number;
	renderMarkdown?: (markdown: string, width: number) => string[];
}

export interface GrillAskRenderState {
	mode: GrillAskMode;
	rows: readonly GrillAskRow[];
	focusIndex: number;
	editorLines?: readonly string[];
}

export function renderGrillAskInlineUi(
	input: NormalizedGrillAskInput,
	state: GrillAskRenderState,
	width: number,
	theme: GrillAskRenderTheme = {},
	primitives: GrillAskRenderPrimitives = {},
): string[] {
	const renderWidth = Math.max(1, width);
	const lines: string[] = [];
	const add = (line = "") => lines.push(line);

	add(style(theme, "accent", bold(theme, "grill_ask")));
	add("");
	renderReadZone(input, renderWidth, theme, primitives).forEach(add);
	add("");
	renderChoicesStacked(input, state, renderWidth, theme, primitives).forEach(add);
	add("");
	add(style(theme, "dim", footerText(state.mode)));

	return lines.map((line) => truncate(line, renderWidth, primitives));
}

function renderReadZone(
	input: NormalizedGrillAskInput,
	width: number,
	theme: GrillAskRenderTheme,
	primitives: GrillAskRenderPrimitives,
): string[] {
	const lines: string[] = [];

	appendStyledRichText(lines, input.question, width, (line) => style(theme, "text", bold(theme, line)), primitives);
	if (input.context !== undefined) {
		appendStyledRichText(lines, input.context, width, (line) => style(theme, "dim", line), primitives);
	}
	if (input.recommended.optionValue === undefined) {
		appendStyledRichText(lines, `Recommended: ${input.recommended.answer}`, width, (line) => style(theme, "text", line), primitives);
		if (input.recommended.rationale !== undefined) {
			appendStyledRichText(lines, `Why: ${input.recommended.rationale}`, width, (line) => style(theme, "dim", line), primitives);
		}
	}

	return lines;
}

function appendStyledRichText(
	lines: string[],
	text: string,
	width: number,
	styleLine: (line: string) => string,
	primitives: GrillAskRenderPrimitives,
): void {
	for (const line of renderRichText(text, width, primitives)) {
		lines.push(styleLine(line));
	}
}

function renderChoicesStacked(
	input: NormalizedGrillAskInput,
	state: GrillAskRenderState,
	width: number,
	theme: GrillAskRenderTheme,
	primitives: GrillAskRenderPrimitives,
): string[] {
	const lines: string[] = [];
	let exceptionalRowsStarted = false;

	for (const [index, row] of state.rows.entries()) {
		if (row.kind !== "choice" && !exceptionalRowsStarted) {
			exceptionalRowsStarted = true;
			if (lines.length > 0) lines.push("");
		}

		const selected = index === state.focusIndex;
		lines.push(renderRow(row, selected, width, theme, primitives));
		if (row.kind === "choice") {
			renderChoiceDetails(input, row, selected, width, theme, primitives).forEach((line) => lines.push(line));
		}
		if (selected && state.mode === "freeform" && row.kind === "freeform") {
			renderFreeformEditor(state.editorLines ?? [], width, theme, primitives).forEach((line) => lines.push(line));
		}
	}

	return lines;
}

function renderChoiceDetails(
	input: NormalizedGrillAskInput,
	row: GrillAskRow,
	selected: boolean,
	width: number,
	theme: GrillAskRenderTheme,
	primitives: GrillAskRenderPrimitives,
): string[] {
	const indent = "     ";
	const detailWidth = Math.max(1, width - visibleWidth(indent, primitives));
	const detailColor = selected ? "muted" : "dim";
	const lines: string[] = [];

	for (const detail of choiceDetailLines(input, row)) {
		for (const detailLine of renderRichText(detail, detailWidth, primitives)) {
			lines.push(`${indent}${style(theme, detailColor, detailLine)}`);
		}
	}

	return lines;
}

function renderFreeformEditor(
	editorLines: readonly string[],
	width: number,
	theme: GrillAskRenderTheme,
	primitives: GrillAskRenderPrimitives,
): string[] {
	const indent = "  ";
	const editorWidth = Math.max(1, width - visibleWidth(indent, primitives));
	const lines = [`${indent}${style(theme, "accent", bold(theme, "Freeform answer"))}`];
	for (const editorLine of editorLines) {
		lines.push(`${indent}${truncate(editorLine, editorWidth, primitives)}`);
	}
	return lines;
}

function renderRow(
	row: GrillAskRow,
	selected: boolean,
	width: number,
	theme: GrillAskRenderTheme,
	primitives: GrillAskRenderPrimitives,
): string {
	const plain = row.kind === "choice" ? renderChoiceRowText(row, selected, width, primitives) : renderExceptionalRowText(row, selected, width, primitives);
	const styled = selected ? focusStyle(theme, plain) : style(theme, row.kind === "end_grill" ? "warning" : "text", plain);
	return truncate(styled, width, primitives);
}

function renderChoiceRowText(row: Extract<GrillAskRow, { kind: "choice" }>, selected: boolean, width: number, primitives: GrillAskRenderPrimitives): string {
	const prefix = `${selected ? "❯" : " "} ${row.index}  `;
	const label = singleLine(row.option.label);
	const tag = rowRecommendationTag(row);
	if (tag !== undefined) {
		const gap = "  ";
		const labelWidth = width - visibleWidth(prefix, primitives) - visibleWidth(gap, primitives) - visibleWidth(tag, primitives);
		if (labelWidth >= 4) {
			const labelText = padToWidth(truncate(label, labelWidth, primitives), labelWidth, primitives);
			return `${prefix}${labelText}${gap}${tag}`;
		}
	}

	const line = truncate(`${prefix}${label}`, width, primitives);
	return selected ? padToWidth(line, width, primitives) : line;
}

function renderExceptionalRowText(row: Exclude<GrillAskRow, { kind: "choice" }>, selected: boolean, width: number, primitives: GrillAskRenderPrimitives): string {
	const glyph = row.kind === "freeform" ? "✎" : "⏹";
	const label = row.kind === "freeform" ? "Other / freeform answer" : "End grilling session";
	const line = truncate(`${selected ? "❯" : " "} ${row.index}  ${glyph} ${label}`, width, primitives);
	return selected ? padToWidth(line, width, primitives) : line;
}

function renderRichText(text: string, width: number, primitives: GrillAskRenderPrimitives): string[] {
	if (primitives.renderMarkdown !== undefined) {
		try {
			return primitives.renderMarkdown(text, width).flatMap((line) => wrap(line, width, primitives));
		} catch {
			// Fall through to plain wrapping if the runtime Markdown renderer rejects the input/theme.
		}
	}
	return text.split(/\n/).flatMap((line) => wrap(line, width, primitives));
}

function wrap(text: string, width: number, primitives: GrillAskRenderPrimitives): string[] {
	const safeWidth = Math.max(1, width);
	if (text.trim().length === 0) return [""];
	if (primitives.wrapTextWithAnsi !== undefined) return primitives.wrapTextWithAnsi(text, safeWidth);

	const words = text.split(/\s+/);
	const lines: string[] = [];
	let current = "";
	for (const word of words) {
		if (current.length === 0) {
			current = word;
			continue;
		}
		if (visibleWidth(`${current} ${word}`, primitives) > safeWidth) {
			lines.push(current);
			current = word;
		} else {
			current = `${current} ${word}`;
		}
	}
	if (current.length > 0) lines.push(current);
	return lines.length === 0 ? [""] : lines;
}

function padToWidth(value: string, width: number, primitives: GrillAskRenderPrimitives): string {
	const safeWidth = Math.max(0, width);
	const truncated = truncate(value, safeWidth, primitives);
	const padding = safeWidth - visibleWidth(truncated, primitives);
	return padding > 0 ? `${truncated}${" ".repeat(padding)}` : truncated;
}

function truncate(value: string, width: number, primitives: GrillAskRenderPrimitives): string {
	const safeWidth = Math.max(0, width);
	if (primitives.truncateToWidth !== undefined) return primitives.truncateToWidth(value, safeWidth);
	if (visibleWidth(value, primitives) <= safeWidth) return value;
	if (safeWidth <= 1) return stripAnsi(value).slice(0, safeWidth);
	return `${stripAnsi(value).slice(0, safeWidth - 1)}…`;
}

function visibleWidth(value: string, primitives: GrillAskRenderPrimitives): number {
	return primitives.visibleWidth?.(value) ?? stripAnsi(value).length;
}

function focusStyle(theme: GrillAskRenderTheme, text: string): string {
	const emphasized = style(theme, "accent", bold(theme, text));
	return theme.bg?.("selectedBg", emphasized) ?? emphasized;
}

function style(theme: GrillAskRenderTheme, color: string, text: string): string {
	return theme.fg?.(color, text) ?? text;
}

function bold(theme: GrillAskRenderTheme, text: string): string {
	return theme.bold?.(text) ?? text;
}

function singleLine(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function stripAnsi(value: string): string {
	return value.replace(/\u001b\[[0-9;]*m/g, "");
}
