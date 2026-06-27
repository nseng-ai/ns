// Composable aligned-column + key/value primitives for clinkr's buffered surfaces. Generalized from
// the throwaway harness's `renderObjectiveList` column math, with the objective-specific columns lifted
// out into a caller-supplied column spec + rows. Pure: column specs + rows in, styled lines out.
//
// Width math measures VISIBLE cells: cells carry their own plain text alongside the styled string, so
// SGR escapes never skew layout (see `Cell`). Columns size three ways — `fixed`, content-`auto` (clamped
// by min/max), and `fill` (split the leftover terminal width) — and cells clip to their column width
// with a caps-aware ellipsis.

import ansis from "ansis";

import type { Caps } from "../caps.ts";
import { ellipsisFor } from "./glyphs.ts";
import { dim, paint } from "./palette.ts";
import { padCell, truncatePlain } from "./text.ts";

/** Default gap (in spaces) rendered between adjacent columns. */
const DEFAULT_GAP = 2;

/**
 * A single table cell: the `styled` text to display plus its `plain` text used for width math and as
 * the clip source when the cell overflows its column. Callers pair the two (mirroring how a colored
 * status glyph rides alongside its uncolored plain form) so alignment stays correct under color.
 */
export interface Cell {
	styled: string;
	plain: string;
}

/** How a column derives its width: a `fixed` count, content-`"auto"` (clamped), or `"fill"` leftover. */
export type ColumnWidth = number | "auto" | "fill";

/** A column's header text, width policy, and optional clamps/alignment. */
export interface Column {
	header: string;
	width: ColumnWidth;
	/** Lower bound for `auto`/`fill` widths. */
	min?: number;
	/** Upper bound for `auto` widths (defaults to the available budget). */
	max?: number;
	/** Cell alignment within the column; defaults to left. */
	align?: "left" | "right";
}

/** Options for {@link renderTable}. */
export interface TableOptions {
	/** Optional dim footer line rendered after a blank separator (e.g. a marker legend). */
	legend?: string;
	/** Spaces between columns; defaults to {@link DEFAULT_GAP}. */
	gap?: number;
}

/**
 * Build a {@link Cell}. When `plain` is omitted it is derived by stripping SGR escapes from `styled`,
 * which is correct for fully-wrapped styled text; pass `plain` explicitly when the two differ in length.
 */
export function cell(styled: string, plain?: string): Cell {
	return { styled, plain: plain ?? ansis.strip(styled) };
}

/**
 * A key/value line: the key reads as recessive (muted — a color in rich terminals, a dim in mono) and
 * the value carries the foreground weight.
 */
export function kv(caps: Caps, key: string, value: string): string {
	return `${paint(caps, "muted", key)} ${value}`;
}

/**
 * Lay out `rows` under `columns` for the given caps. Returns the lines: a dim header row, one line per
 * row with cells padded/clipped to their resolved column widths, and an optional dim legend footer.
 */
export function renderTable(
	caps: Caps,
	columns: readonly Column[],
	rows: readonly (readonly Cell[])[],
	options: TableOptions = {},
): string[] {
	const gap = options.gap ?? DEFAULT_GAP;
	const widths = computeWidths(caps, columns, rows, gap);

	const lines: string[] = [];
	const headerCells = columns.map(
		(column): Cell => ({ styled: dim(column.header), plain: column.header }),
	);
	lines.push(renderRow(caps, columns, widths, headerCells, gap));
	for (const row of rows) lines.push(renderRow(caps, columns, widths, row, gap));

	if (options.legend !== undefined) {
		lines.push("");
		lines.push(dim(options.legend));
	}
	return lines;
}

/** Widest plain content in a column, including its header, across all rows. */
function contentWidth(column: Column, index: number, rows: readonly (readonly Cell[])[]): number {
	let max = column.header.length;
	for (const row of rows) {
		const c = row[index];
		if (c !== undefined) max = Math.max(max, c.plain.length);
	}
	return max;
}

/**
 * Resolve a concrete width per column. Fixed and auto columns size first (auto clamped by min/max and
 * the available budget); the remaining width is split evenly across the fill columns, each kept at or
 * above its min. The budget is the terminal width minus the inter-column gaps.
 */
function computeWidths(
	caps: Caps,
	columns: readonly Column[],
	rows: readonly (readonly Cell[])[],
	gap: number,
): number[] {
	const separators = gap * Math.max(0, columns.length - 1);
	const budget = Math.max(0, caps.columns - separators);

	const widths: number[] = Array.from({ length: columns.length }, () => 0);
	const fills: { index: number; min: number }[] = [];
	let nonFillSum = 0;

	columns.forEach((column, index) => {
		if (column.width === "fill") {
			const min = column.min ?? 0;
			fills.push({ index, min });
			widths[index] = min;
			return;
		}
		const resolved =
			column.width === "auto"
				? clamp(contentWidth(column, index, rows), column.min ?? 1, column.max ?? budget)
				: column.width;
		widths[index] = resolved;
		nonFillSum += resolved;
	});

	if (fills.length > 0) {
		const per = Math.floor(Math.max(0, budget - nonFillSum) / fills.length);
		for (const fill of fills) widths[fill.index] = Math.max(fill.min, per);
	}
	return widths;
}

/** Render one row of cells against the resolved column widths. */
function renderRow(
	caps: Caps,
	columns: readonly Column[],
	widths: readonly number[],
	cells: readonly Cell[],
	gap: number,
): string {
	const parts = columns.map((column, index) => {
		const width = widths[index] ?? 0;
		const value = cells[index] ?? { styled: "", plain: "" };
		// The last left-aligned column is never right-padded, so lines carry no trailing whitespace.
		const isLast = index === columns.length - 1;
		return renderCell(caps, value, width, column.align ?? "left", isLast);
	});
	return parts.join(" ".repeat(gap));
}

/**
 * Place a single cell in a column of `width`. A cell that fits is padded (keeping its styling); a cell
 * that overflows is clipped on its plain text with a caps-aware ellipsis (styling is dropped on the
 * clipped remainder, which is the rare path). Right-aligned cells pad on the left.
 */
function renderCell(
	caps: Caps,
	value: Cell,
	width: number,
	align: "left" | "right",
	isLast: boolean,
): string {
	if (value.plain.length > width) {
		const clipped = truncatePlain(value.plain, width, ellipsisFor(caps));
		return align === "right" ? padLeftPlain(clipped, width) : clipped;
	}
	if (align === "right") return padLeftStyled(value.styled, value.plain, width);
	// Left-aligned final column needs no trailing pad.
	return isLast ? value.styled : padCell(value.styled, value.plain, width);
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

/** Left-pad plain (unstyled) text to `width`; a no-op when already at or beyond it. */
function padLeftPlain(text: string, width: number): string {
	return text.length >= width ? text : " ".repeat(width - text.length) + text;
}

/** Left-pad a styled cell using its known plain width so SGR escapes do not skew alignment. */
function padLeftStyled(styled: string, plain: string, width: number): string {
	const lead = width - plain.length;
	return lead > 0 ? " ".repeat(lead) + styled : styled;
}
