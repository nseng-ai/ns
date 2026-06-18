import { stripTerminalEscapes } from "./terminal-escapes.ts";

export type TextTableAlign = "left" | "right";

export type TextTableStyle = "bold" | "dim" | "cyan" | "bold-cyan" | "green" | "yellow" | "red";

export interface TextTableColumn {
	header: string;
	align?: TextTableAlign;
	/** ANSI style applied to this column's data cells when ANSI output is enabled. */
	style?: TextTableStyle;
	/** ANSI style for this column's header; falls back to the table-wide headerStyle. */
	headerStyle?: TextTableStyle;
}

export interface RenderTextTableOptions {
	columns: readonly TextTableColumn[];
	/**
	 * One array of cells per row, in column order. A cell may contain newlines; each line is laid out
	 * on its own visual row with the other columns left blank, which is how grouped/continuation rows
	 * (e.g. one Objective with several attributed branches) are expressed.
	 */
	rows: readonly (readonly string[])[];
	/** Column separator. Defaults to two spaces. */
	gap?: string;
	/** When true, emit ANSI styling for headers and styled columns. Resolved from the output sink. */
	canEmitAnsi?: boolean;
	/** When true, draw a rule of box-drawing dashes under the header (Rich SIMPLE_HEAD look). */
	shouldDrawRule?: boolean;
	/** Default ANSI style for every header cell; per-column headerStyle overrides it. */
	headerStyle?: TextTableStyle;
}

const DEFAULT_GAP = "  ";

const ESC = String.fromCharCode(0x1b);
const RESET = `${ESC}[0m`;

const STYLE_CODES: Record<TextTableStyle, string> = {
	bold: "1",
	dim: "2",
	cyan: "36",
	"bold-cyan": "1;36",
	green: "32",
	yellow: "33",
	red: "31",
};

/**
 * Render an aligned, border-less plain-text table for terminal output. Column widths are derived from
 * display width (not code-unit length) so rows carrying wide or combining glyphs stay aligned. Trailing
 * padding is trimmed from every line, so the rightmost column never emits dangling spaces.
 *
 * With `canEmitAnsi`, headers and styled columns gain ANSI styling; with `shouldDrawRule`, a dashed rule is drawn under
 * the header. Styling is applied after width measurement, so colorized cells stay aligned. This is for
 * human terminal output only — Markdown output consumed by a Markdown renderer keeps emitting pipe
 * tables instead.
 */
export function renderTextTable(options: RenderTextTableOptions): string {
	const gap = options.gap ?? DEFAULT_GAP;
	const canEmitAnsi = options.canEmitAnsi === true;
	const columnCount = options.columns.length;
	for (const row of options.rows) {
		if (row.length !== columnCount) {
			throw new Error(`renderTextTable: row has ${row.length} cells but ${columnCount} columns were declared`);
		}
	}

	const cellLinesByRow = options.rows.map((row) => row.map((cell) => cell.split("\n")));
	const widths = computeColumnWidths(options.columns, cellLinesByRow);

	const headerCells = options.columns.map((column) => styled(column.header, column.headerStyle ?? options.headerStyle, canEmitAnsi));
	const lines = [composeLine({ cells: headerCells, columns: options.columns, widths, gap })];
	if (options.shouldDrawRule === true) lines.push(composeRule(widths, gap));
	for (const rowCellLines of cellLinesByRow) {
		const height = Math.max(1, ...rowCellLines.map((cellLines) => cellLines.length));
		for (let lineIndex = 0; lineIndex < height; lineIndex += 1) {
			const cells = options.columns.map((column, columnIndex) => styled(rowCellLines[columnIndex]?.[lineIndex] ?? "", column.style, canEmitAnsi));
			lines.push(composeLine({ cells, columns: options.columns, widths, gap }));
		}
	}
	return lines.join("\n");
}

function computeColumnWidths(columns: readonly TextTableColumn[], cellLinesByRow: readonly (readonly string[][])[]): number[] {
	const widths = columns.map((column) => displayWidth(column.header));
	for (const rowCellLines of cellLinesByRow) {
		for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
			for (const line of rowCellLines[columnIndex] ?? []) {
				widths[columnIndex] = Math.max(widths[columnIndex] ?? 0, displayWidth(line));
			}
		}
	}
	return widths;
}

interface ComposeLineOptions {
	cells: readonly string[];
	columns: readonly TextTableColumn[];
	widths: readonly number[];
	gap: string;
}

function composeLine(options: ComposeLineOptions): string {
	const padded = options.cells.map((cell, columnIndex) => padCell(cell, options.widths[columnIndex] ?? 0, options.columns[columnIndex]?.align ?? "left"));
	return padded.join(options.gap).trimEnd();
}

function composeRule(widths: readonly number[], gap: string): string {
	return widths.map((width) => "─".repeat(width)).join(gap);
}

function padCell(value: string, width: number, align: TextTableAlign): string {
	const padding = " ".repeat(Math.max(0, width - displayWidth(value)));
	return align === "right" ? `${padding}${value}` : `${value}${padding}`;
}

function styled(value: string, style: TextTableStyle | undefined, canEmitAnsi: boolean): string {
	if (!canEmitAnsi || style === undefined || value === "") return value;
	return `${ESC}[${STYLE_CODES[style]}m${value}${RESET}`;
}

/**
 * Terminal display width of a string in monospace cells: ANSI escape sequences count as 0, combining and
 * zero-width code points count as 0, East Asian wide / fullwidth and most emoji count as 2, everything
 * else counts as 1. Grapheme clusters built from ZWJ sequences are not collapsed, so exotic emoji
 * sequences can over-count; that is acceptable for the slug/status/timestamp content these tables carry.
 * Keep this local to asdl-core rather than depending on a TUI package for core CLI rendering.
 */
export function displayWidth(value: string): number {
	let width = 0;
	for (const char of stripTerminalEscapes(value)) {
		width += codePointWidth(char.codePointAt(0) ?? 0);
	}
	return width;
}

function codePointWidth(codePoint: number): number {
	// Control characters do not advance the cursor in the table context.
	if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint < 0xa0)) return 0;
	if (isZeroWidth(codePoint)) return 0;
	if (isWide(codePoint)) return 2;
	return 1;
}

function isZeroWidth(codePoint: number): boolean {
	return (
		(codePoint >= 0x0300 && codePoint <= 0x036f) || // combining diacritical marks
		(codePoint >= 0x1ab0 && codePoint <= 0x1aff) || // combining diacritical marks extended
		(codePoint >= 0x1dc0 && codePoint <= 0x1dff) || // combining diacritical marks supplement
		(codePoint >= 0x20d0 && codePoint <= 0x20ff) || // combining diacritical marks for symbols
		(codePoint >= 0xfe20 && codePoint <= 0xfe2f) || // combining half marks
		codePoint === 0x200b || // zero width space
		codePoint === 0x200c || // zero width non-joiner
		codePoint === 0x200d || // zero width joiner
		codePoint === 0xfeff || // zero width no-break space
		(codePoint >= 0xfe00 && codePoint <= 0xfe0f) // variation selectors
	);
}

function isWide(codePoint: number): boolean {
	return (
		(codePoint >= 0x1100 && codePoint <= 0x115f) || // Hangul Jamo
		(codePoint >= 0x2e80 && codePoint <= 0x303e) || // CJK radicals, Kangxi, CJK symbols
		(codePoint >= 0x3041 && codePoint <= 0x33ff) || // Hiragana through CJK compatibility
		(codePoint >= 0x3400 && codePoint <= 0x4dbf) || // CJK extension A
		(codePoint >= 0x4e00 && codePoint <= 0x9fff) || // CJK unified ideographs
		(codePoint >= 0xa000 && codePoint <= 0xa4cf) || // Yi syllables
		(codePoint >= 0xac00 && codePoint <= 0xd7a3) || // Hangul syllables
		(codePoint >= 0xf900 && codePoint <= 0xfaff) || // CJK compatibility ideographs
		(codePoint >= 0xfe30 && codePoint <= 0xfe4f) || // CJK compatibility forms
		(codePoint >= 0xff00 && codePoint <= 0xff60) || // fullwidth forms
		(codePoint >= 0xffe0 && codePoint <= 0xffe6) || // fullwidth signs
		(codePoint >= 0x1f300 && codePoint <= 0x1faff) || // emoji, symbols, pictographs
		(codePoint >= 0x20000 && codePoint <= 0x3fffd) // CJK extension B and beyond
	);
}
