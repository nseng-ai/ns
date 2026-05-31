import type { NormalizedGrillAskInput } from "../grill-ui.ts";
import { footerText, previewTextForRow, rowLabel, shouldUseSplitPreview, type GrillAskMode, type GrillAskRow } from "./view.ts";

export type GrillAskRenderTheme = {
	fg?(color: string, text: string): string;
	bg?(color: string, text: string): string;
	bold?(text: string): string;
};

export type GrillAskRenderPrimitives = {
	truncateToWidth?: (value: string, width: number, ellipsis?: string) => string;
	wrapTextWithAnsi?: (value: string, width: number) => string[];
	visibleWidth?: (value: string) => number;
	renderMarkdown?: (markdown: string, width: number) => string[];
};

export type GrillAskRenderState = {
	mode: GrillAskMode;
	rows: readonly GrillAskRow[];
	focusIndex: number;
	editorLines?: readonly string[];
};

export function renderGrillAskOverlay(
	input: NormalizedGrillAskInput,
	state: GrillAskRenderState,
	width: number,
	theme: GrillAskRenderTheme = {},
	primitives: GrillAskRenderPrimitives = {},
): string[] {
	const renderWidth = Math.max(1, width);
	const lines: string[] = [];
	const add = (line = "") => lines.push(truncate(line, renderWidth, primitives));
	const border = style(theme, "border", "─".repeat(renderWidth));

	add(border);
	renderPromptBlocks(input, renderWidth, theme, primitives).forEach(add);
	add("");

	if (state.mode === "freeform") {
		renderChoicesStacked(input, state, renderWidth, theme, primitives, { includeDescriptions: false }).forEach(add);
		add("");
		add(` ${style(theme, "muted", "Your answer:")}`);
		for (const line of state.editorLines ?? []) {
			add(` ${line}`);
		}
	} else if (shouldUseSplitPreview(renderWidth)) {
		renderChoicesWithPreview(input, state, renderWidth, theme, primitives).forEach(add);
	} else {
		renderChoicesStacked(input, state, renderWidth, theme, primitives, { includeDescriptions: true }).forEach(add);
	}

	add("");
	add(` ${style(theme, "dim", footerText(state.mode))}`);
	add(border);
	return lines.map((line) => truncate(line, renderWidth, primitives));
}

function renderPromptBlocks(
	input: NormalizedGrillAskInput,
	width: number,
	theme: GrillAskRenderTheme,
	primitives: GrillAskRenderPrimitives,
): string[] {
	const lines: string[] = [];
	const innerWidth = Math.max(1, width - 3);

	appendBlock(lines, "Question", input.question, innerWidth, theme, primitives);
	if (input.context !== undefined) {
		appendBlock(lines, "Context", input.context, innerWidth, theme, primitives);
	}

	const recommendation = [input.recommended.answer];
	if (input.recommended.rationale !== undefined) {
		recommendation.push(`Rationale: ${input.recommended.rationale}`);
	}
	appendBlock(lines, "Recommendation", recommendation.join("\n\n"), innerWidth, theme, primitives);

	return lines;
}

function appendBlock(
	lines: string[],
	label: string,
	body: string,
	innerWidth: number,
	theme: GrillAskRenderTheme,
	primitives: GrillAskRenderPrimitives,
): void {
	if (lines.length > 0) lines.push("");
	lines.push(` ${style(theme, "accent", bold(theme, label))}`);
	for (const line of renderRichText(body, innerWidth, primitives)) {
		lines.push(`  ${line}`);
	}
}

function renderChoicesStacked(
	input: NormalizedGrillAskInput,
	state: GrillAskRenderState,
	width: number,
	theme: GrillAskRenderTheme,
	primitives: GrillAskRenderPrimitives,
	options: { includeDescriptions: boolean },
): string[] {
	const lines: string[] = [];
	const descWidth = Math.max(1, width - 6);
	for (const [index, row] of state.rows.entries()) {
		const selected = index === state.focusIndex;
		lines.push(renderRow(row, selected, width, theme, primitives));
		if (options.includeDescriptions && row.kind === "choice" && row.option.description !== undefined) {
			for (const descLine of wrap(row.option.description, descWidth, primitives)) {
				lines.push(`     ${style(theme, "muted", descLine)}`);
			}
		}
	}

	if (!options.includeDescriptions) return lines;
	const focusedRow = state.rows[state.focusIndex];
	if (focusedRow === undefined) return lines;
	const preview = previewTextForRow(input, focusedRow);
	if (preview.trim().length === 0) return lines;
	lines.push("");
	lines.push(` ${style(theme, "muted", "Preview:")}`);
	for (const previewLine of renderRichText(preview, Math.max(1, width - 3), primitives)) {
		lines.push(`  ${style(theme, "dim", previewLine)}`);
	}
	return lines;
}

function renderChoicesWithPreview(
	input: NormalizedGrillAskInput,
	state: GrillAskRenderState,
	width: number,
	theme: GrillAskRenderTheme,
	primitives: GrillAskRenderPrimitives,
): string[] {
	const leftWidth = Math.min(58, Math.max(30, Math.floor(width * 0.55)));
	const separator = " │ ";
	const rightWidth = Math.max(20, width - leftWidth - visibleWidth(separator, primitives));
	const leftLines = state.rows.map((row, index) => renderRow(row, index === state.focusIndex, leftWidth, theme, primitives));
	const focusedRow = state.rows[state.focusIndex];
	const preview = focusedRow === undefined ? "" : previewTextForRow(input, focusedRow);
	const rightLines = [`${style(theme, "muted", "Preview")}`, "", ...renderRichText(preview, rightWidth, primitives)];
	const maxLines = Math.max(leftLines.length, rightLines.length);
	const lines: string[] = [];

	for (let index = 0; index < maxLines; index++) {
		const left = padToWidth(truncate(leftLines[index] ?? "", leftWidth, primitives), leftWidth, primitives);
		const right = truncate(rightLines[index] ?? "", rightWidth, primitives);
		lines.push(`${left}${style(theme, "borderMuted", separator)}${style(theme, "dim", right)}`);
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
	const prefix = selected ? "› " : "  ";
	const glyph = row.kind === "freeform" ? "✎ " : row.kind === "end_grill" ? "⏹ " : "";
	const text = `${prefix}${glyph}${rowLabel(row)}`;
	const colored = selected ? style(theme, "accent", text) : style(theme, row.kind === "end_grill" ? "warning" : "text", text);
	return truncate(colored, width, primitives);
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

function truncate(value: string, width: number, primitives: GrillAskRenderPrimitives): string {
	const safeWidth = Math.max(0, width);
	if (primitives.truncateToWidth !== undefined) return primitives.truncateToWidth(value, safeWidth);
	if (visibleWidth(value, primitives) <= safeWidth) return value;
	if (safeWidth <= 1) return value.slice(0, safeWidth);
	return `${stripAnsi(value).slice(0, safeWidth - 1)}…`;
}

function padToWidth(value: string, width: number, primitives: GrillAskRenderPrimitives): string {
	return `${value}${" ".repeat(Math.max(0, width - visibleWidth(value, primitives)))}`;
}

function visibleWidth(value: string, primitives: GrillAskRenderPrimitives): number {
	return primitives.visibleWidth?.(value) ?? stripAnsi(value).length;
}

function style(theme: GrillAskRenderTheme, color: string, text: string): string {
	return theme.fg?.(color, text) ?? text;
}

function bold(theme: GrillAskRenderTheme, text: string): string {
	return theme.bold?.(text) ?? text;
}

function stripAnsi(value: string): string {
	return value.replace(/\u001b\[[0-9;]*m/g, "");
}
