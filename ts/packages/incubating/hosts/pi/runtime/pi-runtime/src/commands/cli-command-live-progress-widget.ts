import { truncateToWidth } from "@earendil-works/pi-tui";
import {
	centerMatrixProgressText,
	clampMatrixProgressLabelWidthChars,
	formatActiveOperationsLine,
	matrixProgressDisplayWidthChars,
	MATRIX_PROGRESS_MIN_LABEL_WIDTH_CHARS,
	padMatrixProgressTextEnd,
	type ActiveOperation,
	type NsProgressMatrixCellState,
} from "@nseng-ai/sdk";
import type { ProgressPhaseState, ProgressPhaseView } from "@nseng-ai/sdk/progress-phase-state";

import { truncateDisplayLine } from "../kit/terminal/presentation.ts";
import type { WidgetTheme, WidgetThemeColor } from "../runtime/tool-types.ts";

const LIVE_PROGRESS_WIDGET_OUTPUT_LINES = 1;

export interface WidgetSegment {
	readonly text: string;
	readonly style?: WidgetThemeColor;
	readonly isBold?: boolean;
}

export type WidgetLine = readonly WidgetSegment[];

export interface LiveProgressOutputLine {
	readonly stream: "stdout" | "stderr";
	readonly text: string;
}

export interface StructuredProgressDisplaySnapshot {
	readonly isActive: boolean;
	readonly title: string | undefined;
	readonly phases: readonly ProgressPhaseView[];
}

export interface MatrixProgressColumnSnapshot {
	readonly key: string;
	readonly label: string;
	readonly width: number;
}

export interface MatrixProgressCellSnapshot {
	readonly columnKey: string;
	readonly state: NsProgressMatrixCellState;
	readonly text?: string;
}

export interface MatrixProgressRowSnapshot {
	readonly rowKey: string;
	readonly label: string;
	readonly cells: readonly MatrixProgressCellSnapshot[];
}

export interface MatrixProgressDisplaySnapshot {
	readonly isActive: boolean;
	readonly labelHeader: string;
	readonly columns: readonly MatrixProgressColumnSnapshot[];
	readonly rows: readonly MatrixProgressRowSnapshot[];
	readonly activeOperations: readonly ActiveOperation[];
}

export interface LiveProgressDisplaySnapshot {
	readonly cliName: string;
	readonly argv: readonly string[];
	readonly piCommandName: string;
	readonly phase: string;
	readonly elapsed: string;
	readonly stdoutChars: number;
	readonly stderrChars: number;
	readonly recentOutputLines: readonly LiveProgressOutputLine[];
	readonly spinnerFrame: string;
	readonly structured: StructuredProgressDisplaySnapshot;
	readonly matrix: MatrixProgressDisplaySnapshot;
}

export function renderLiveProgressWidget(
	snapshot: LiveProgressDisplaySnapshot,
	theme: WidgetTheme,
	width: number,
): string[] {
	if (width <= 0) return [];
	return buildLiveProgressWidgetLines(snapshot, width).map((line) =>
		paintWidgetLine(line, theme, width),
	);
}

export function buildLiveProgressWidgetLines(
	snapshot: LiveProgressDisplaySnapshot,
	width: number,
): WidgetLine[] {
	if (snapshot.structured.isActive || snapshot.matrix.isActive) {
		const lines: WidgetLine[] = [structuredHeaderLine(snapshot)];
		lines.push(...structuredPhaseLines(snapshot.structured.phases, snapshot.spinnerFrame));
		if (snapshot.matrix.isActive) {
			lines.push([]);
			lines.push(...buildMatrixProgressWidgetLines(snapshot.matrix, snapshot.spinnerFrame, width));
		}
		const latestOutput = snapshot.recentOutputLines.at(-1);
		if (latestOutput !== undefined) {
			lines.push([{ text: `  ${formatLiveOutputLine(latestOutput)}`, style: "dim" }]);
		}
		return lines;
	}

	const lines: WidgetLine[] = [
		[
			{ text: `/${snapshot.piCommandName}`, style: "accent", isBold: true },
			{ text: ` ${snapshot.phase}`, style: "text" },
			{ text: ` (${snapshot.elapsed} elapsed)`, style: "dim" },
		],
		[
			{
				text: `$ ${formatCommandForDisplay(snapshot.cliName, snapshot.argv)} · stdout ${snapshot.stdoutChars}, stderr ${snapshot.stderrChars}`,
				style: "muted",
			},
		],
	];
	if (snapshot.recentOutputLines.length === 0) {
		lines.push([{ text: "No CLI output yet.", style: "dim" }]);
		return lines;
	}

	const shownLines = snapshot.recentOutputLines.slice(-LIVE_PROGRESS_WIDGET_OUTPUT_LINES);
	const hiddenLineCount = snapshot.recentOutputLines.length - shownLines.length;
	if (hiddenLineCount > 0) {
		lines.push([
			{
				text: `… ${hiddenLineCount} earlier recent CLI line${hiddenLineCount === 1 ? "" : "s"} hidden`,
				style: "dim",
			},
		]);
	}
	for (const line of shownLines) {
		lines.push([{ text: formatLiveOutputLine(line), style: "dim" }]);
	}
	return lines;
}

function paintWidgetLine(line: WidgetLine, theme: WidgetTheme, width: number): string {
	const painted = line
		.map((segment) => {
			const styled =
				segment.style === undefined ? segment.text : theme.fg(segment.style, segment.text);
			return segment.isBold === true ? (theme.bold?.(styled) ?? styled) : styled;
		})
		.join("");
	return truncateToWidth(painted, width, "…");
}

function structuredHeaderLine(snapshot: LiveProgressDisplaySnapshot): WidgetLine {
	const invocationTitle = `${snapshot.cliName} ${snapshot.argv.join(" ")}`;
	const titleSuffix =
		snapshot.structured.title !== undefined && snapshot.structured.title !== invocationTitle
			? ` — ${snapshot.structured.title}`
			: "";
	const line: WidgetSegment[] = [
		{ text: `/${snapshot.piCommandName}`, style: "accent", isBold: true },
	];
	if (titleSuffix !== "") line.push({ text: titleSuffix, style: "text" });
	line.push({ text: ` (${snapshot.elapsed} elapsed)`, style: "dim" });
	return line;
}

function structuredPhaseLines(
	phases: readonly ProgressPhaseView[],
	activeGlyph: string,
): WidgetLine[] {
	const nameWidth = Math.max(0, ...phases.map((phase) => phase.name.length));
	const lines: WidgetLine[] = [];
	for (const phase of phases) {
		lines.push(styledPhaseLine({ phase, nameWidth, activeGlyph }));
		for (const substep of phase.substeps) {
			lines.push(
				styledPhaseLine({
					phase: substep,
					nameWidth: nameWidth - 4,
					activeGlyph,
					indent: "    ",
				}),
			);
		}
	}
	return lines;
}

interface StyledPhaseLineOptions {
	readonly phase: ProgressPhaseView;
	readonly nameWidth: number;
	readonly activeGlyph: string;
	readonly indent?: string;
}

function styledPhaseLine(options: StyledPhaseLineOptions): WidgetLine {
	const { phase, nameWidth, activeGlyph, indent = "" } = options;
	const style = phaseRowStyle(phase.state);
	const glyph = phase.state === "active" ? activeGlyph : phaseGlyph(phase.state);
	const line: WidgetSegment[] = [
		{ text: `${indent}${glyph}`, style: style.glyph },
		{ text: ` ${phase.name.padEnd(Math.max(0, nameWidth))}`, style: style.name },
	];
	const text = textForWidgetPhase(phase);
	if (text !== undefined) line.push({ text: `  ${text}`, style: style.detail });
	return line;
}

function textForWidgetPhase(phase: ProgressPhaseView): string | undefined {
	if (phase.state === "done" || phase.state === "skipped") return phase.detail ?? phase.label;
	return phase.label;
}

interface PhaseRowStyle {
	readonly glyph: WidgetThemeColor;
	readonly name: WidgetThemeColor;
	readonly detail: WidgetThemeColor;
}

function phaseRowStyle(state: ProgressPhaseState): PhaseRowStyle {
	const glyph = phaseStateColor(state);
	switch (state) {
		case "active":
			return { glyph, name: "text", detail: "text" };
		case "done":
			return { glyph, name: "muted", detail: "muted" };
		case "pending":
			return { glyph, name: "dim", detail: "dim" };
		case "skipped":
			return { glyph, name: "muted", detail: "muted" };
		case "failed":
			return { glyph, name: "error", detail: "text" };
	}
}

export function buildMatrixProgressWidgetLines(
	snapshot: MatrixProgressDisplaySnapshot,
	activeGlyph: string,
	maxLineWidth?: number,
): WidgetLine[] {
	if (!snapshot.isActive) return [];
	const labelWidth = matrixLabelWidth(snapshot, maxLineWidth);
	const header = snapshot.columns
		.map((column) => padMatrixProgressTextEnd(column.label, column.width))
		.join("  ");
	const lines: WidgetLine[] = [
		[
			{
				text: `${padMatrixProgressTextEnd(snapshot.labelHeader, labelWidth)}  ${header}`,
				style: "muted",
			},
		],
	];
	for (const row of snapshot.rows) {
		const label = padMatrixProgressTextEnd(truncateDisplayLine(row.label, labelWidth), labelWidth);
		const line: WidgetSegment[] = [{ text: label, style: "text" }];
		for (const column of snapshot.columns) {
			line.push({ text: "  " });
			line.push(matrixCellSegment(row, column, activeGlyph));
		}
		lines.push(line);
	}
	const activeOperationsLine = formatActiveOperationsLine(snapshot.activeOperations);
	if (activeOperationsLine !== undefined) {
		lines.push([{ text: activeOperationsLine, style: "muted" }]);
	}
	return lines;
}

function matrixCellSegment(
	row: MatrixProgressRowSnapshot,
	column: MatrixProgressColumnSnapshot,
	activeGlyph: string,
): WidgetSegment {
	const cell = row.cells.find((candidate) => candidate.columnKey === column.key);
	const state = cell?.state ?? "pending";
	const text =
		cell?.text !== undefined && matrixProgressDisplayWidthChars(cell.text) <= column.width
			? cell.text
			: state === "active"
				? activeGlyph
				: phaseGlyph(state);
	return { text: centerMatrixProgressText(text, column.width), style: phaseStateColor(state) };
}

function matrixLabelWidth(snapshot: MatrixProgressDisplaySnapshot, maxLineWidth?: number): number {
	const longest = Math.max(
		matrixProgressDisplayWidthChars(snapshot.labelHeader),
		...snapshot.rows.map((row) => matrixProgressDisplayWidthChars(row.label)),
	);
	if (maxLineWidth === undefined) return clampMatrixProgressLabelWidthChars(longest);

	const columnWidth = snapshot.columns.reduce((width, column) => width + column.width, 0);
	const columnSeparatorsWidth = Math.max(0, snapshot.columns.length - 1) * 2;
	const availableLabelWidth = maxLineWidth - columnWidth - columnSeparatorsWidth - 2;
	return Math.max(MATRIX_PROGRESS_MIN_LABEL_WIDTH_CHARS, Math.min(longest, availableLabelWidth));
}

function phaseStateColor(state: ProgressPhaseState): WidgetThemeColor {
	switch (state) {
		case "active":
			return "accent";
		case "done":
			return "success";
		case "pending":
			return "dim";
		case "skipped":
			return "muted";
		case "failed":
			return "error";
	}
}

function formatCommandForDisplay(cliName: string, argv: readonly string[]): string {
	return [cliName, ...argv].map(formatDisplayArg).join(" ");
}

function formatDisplayArg(arg: string): string {
	if (/^[A-Za-z0-9_./:=@+-]+$/.test(arg)) return arg;
	return JSON.stringify(arg);
}

function formatLiveOutputLine(line: LiveProgressOutputLine): string {
	return `${line.stream}: ${line.text}`;
}

function phaseGlyph(state: Exclude<ProgressPhaseState, "active">): string {
	switch (state) {
		case "done":
			return "✓";
		case "pending":
			return "·";
		case "skipped":
			return "–";
		case "failed":
			return "✗";
	}
}
