import {
	createProgressPhaseStateStore,
	type ProgressPhaseState,
	type ProgressPhaseView,
} from "@nseng-ai/sdk/progress-phase-state";
import {
	centerMatrixProgressText,
	clampMatrixProgressLabelWidthChars,
	formatActiveOperationsLine,
	type ActiveOperation,
	isMatrixProgressEvent,
	matrixProgressDisplayWidthChars,
	MATRIX_PROGRESS_MIN_LABEL_WIDTH_CHARS,
	padMatrixProgressTextEnd,
	type NsProgressMatrixCellState,
	type NsProgressMatrixEvent,
	type NsProgressPhaseEvent,
} from "@nseng-ai/sdk";
import type { ScheduledTimer, TimerScheduler } from "@nseng-ai/foundation/timers";
import { formatElapsedMs } from "@nseng-ai/foundation/time-format";
import { truncateToWidth } from "@earendil-works/pi-tui";

import type {
	WidgetContent,
	WidgetTheme,
	WidgetThemeColor,
	WidgetTuiHandle,
} from "../runtime/tool-types.ts";
import { withSafePiUi, withSafePiUiValue } from "../kit/shared/safe-ui.ts";
import { spinnerFrameAt } from "../kit/shared/spinner-frames.ts";
import { unrefTimerScheduler } from "../kit/shared/timers.ts";
import { truncateDisplayLine } from "../kit/terminal/presentation.ts";
import { traceCliCommand } from "./cli-command-trace.ts";

const LIVE_PROGRESS_STATUS_ID = "ns-cli-command";
const LIVE_PROGRESS_WIDGET_ID = "ns-cli-command-output";
const LIVE_PROGRESS_INTERVAL_MS = 1_000;
const LIVE_PROGRESS_MAX_LINES = 8;
const LIVE_PROGRESS_WIDGET_OUTPUT_LINES = 1;
const SPINNER_INTERVAL_MS = 120;

type OutputStreamName = "stdout" | "stderr";
type LiveProgressTarget = "none" | "status" | "widget";
type CommandWidgetPlacement = "aboveEditor" | "belowEditor";

export type LiveProgressWidgetContent = WidgetContent;

/** One styled span of a widget line; layout math runs on `text` before styling. */
export interface WidgetSegment {
	text: string;
	style?: WidgetThemeColor;
	isBold?: boolean;
}

export type WidgetLine = readonly WidgetSegment[];

function paintWidgetLine(line: WidgetLine, theme: WidgetTheme, width: number): string {
	const painted = line
		.map((segment) => {
			const styled =
				segment.style === undefined ? segment.text : theme.fg(segment.style, segment.text);
			return segment.isBold === true ? (theme.bold?.(styled) ?? styled) : styled;
		})
		.join("");
	return truncateToWidth(painted, Math.max(1, width), "…");
}

interface LiveCommandProgressContext {
	hasUI?: boolean;
	ui: {
		setStatus?(key: string, value: string | undefined): void;
		setWidget?(
			key: string,
			value: LiveProgressWidgetContent | undefined,
			options?: { placement?: CommandWidgetPlacement },
		): void;
	};
}

interface LiveCommandProgressOptions {
	cliName: string;
	commandName: string;
	piCommandName: string;
	argv: readonly string[];
	timers?: TimerScheduler;
}

interface LiveOutputLine {
	stream: OutputStreamName;
	text: string;
}

class StructuredPhaseWidget {
	private readonly store = createProgressPhaseStateStore({ unknownKeyPolicy: "append" });
	private hasEvents = false;

	get isActive(): boolean {
		return this.hasEvents;
	}

	applyPhaseEvent(event: NsProgressPhaseEvent): void {
		this.hasEvents = true;
		this.store.apply(event);
	}

	phaseLines(activeGlyph: string): WidgetLine[] {
		const phases = this.store.views();
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

	headerLine(input: {
		cliName: string;
		argv: readonly string[];
		piCommandName: string;
		elapsed: string;
	}): WidgetLine {
		const invocationTitle = `${input.cliName} ${input.argv.join(" ")}`;
		const title = this.store.title();
		const titleSuffix = title !== undefined && title !== invocationTitle ? ` — ${title}` : "";
		const line: WidgetSegment[] = [
			{ text: `/${input.piCommandName}`, style: "accent", isBold: true },
		];
		if (titleSuffix !== "") line.push({ text: titleSuffix, style: "text" });
		line.push({ text: ` (${input.elapsed} elapsed)`, style: "dim" });
		return line;
	}
}

interface StyledPhaseLineOptions {
	phase: ProgressPhaseView;
	nameWidth: number;
	activeGlyph: string;
	indent?: string;
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
	glyph: WidgetThemeColor;
	name: WidgetThemeColor;
	detail: WidgetThemeColor;
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

const MATRIX_DEFAULT_LABEL_HEADER = "Branch / PR";

interface MatrixWidgetColumn {
	key: string;
	label: string;
	width: number;
}

interface MatrixWidgetCell {
	state: NsProgressMatrixCellState;
	text?: string;
}

/**
 * State for the matrix-* progress events: a per-row × per-column grid rendered
 * below the phase checklist as styled widget lines. Cells share the checklist
 * glyph set; the caller supplies the current spinner frame for active cells.
 */
export class MatrixWidgetState {
	private columns: MatrixWidgetColumn[] = [];
	private labelHeader = MATRIX_DEFAULT_LABEL_HEADER;
	private rows: { rowKey: string; label: string }[] = [];
	private cellsByRow = new Map<string, Map<string, MatrixWidgetCell>>();
	private activeOperations: readonly ActiveOperation[] = [];
	private hasDeclared = false;

	get isActive(): boolean {
		return this.hasDeclared;
	}

	apply(event: NsProgressMatrixEvent): void {
		switch (event.type) {
			case "matrix-declared":
				this.hasDeclared = true;
				this.columns = event.columns.map((column) => ({
					key: column.key,
					label: column.label,
					width: Math.max(column.width ?? 0, matrixProgressDisplayWidthChars(column.label)),
				}));
				if (event.labelHeader !== undefined) this.labelHeader = event.labelHeader;
				return;
			case "matrix-rows": {
				this.rows = event.rows.map((row) => ({ rowKey: row.rowKey, label: row.label }));
				const rowKeys = new Set(this.rows.map((row) => row.rowKey));
				for (const rowKey of this.cellsByRow.keys()) {
					if (!rowKeys.has(rowKey)) this.cellsByRow.delete(rowKey);
				}
				return;
			}
			case "matrix-cell": {
				const cells = this.cellsByRow.get(event.rowKey) ?? new Map<string, MatrixWidgetCell>();
				this.cellsByRow.set(event.rowKey, cells);
				cells.set(event.columnKey, {
					state: event.state,
					...(event.text === undefined ? {} : { text: event.text }),
				});
				return;
			}
			case "matrix-active-operations":
				this.activeOperations = [...event.operations];
				return;
		}
	}

	/** Rendered matrix block; empty until declared. */
	lines(activeGlyph: string, maxLineWidth?: number): WidgetLine[] {
		if (!this.hasDeclared) return [];
		const labelWidth = this.labelWidth(maxLineWidth);
		const header = this.columns
			.map((column) => padMatrixProgressTextEnd(column.label, column.width))
			.join("  ");
		const lines: WidgetLine[] = [
			[
				{
					text: `${padMatrixProgressTextEnd(this.labelHeader, labelWidth)}  ${header}`,
					style: "muted",
				},
			],
		];
		for (const row of this.rows) {
			const label = padMatrixProgressTextEnd(
				truncateDisplayLine(row.label, labelWidth),
				labelWidth,
			);
			const line: WidgetSegment[] = [{ text: label, style: "text" }];
			for (const column of this.columns) {
				line.push({ text: "  " });
				line.push(this.cellSegment(row.rowKey, column, activeGlyph));
			}
			lines.push(line);
		}
		const activeOperationsLine = formatActiveOperationsLine(this.activeOperations);
		if (activeOperationsLine !== undefined) {
			lines.push([{ text: activeOperationsLine, style: "muted" }]);
		}
		return lines;
	}

	private cellSegment(
		rowKey: string,
		column: MatrixWidgetColumn,
		activeGlyph: string,
	): WidgetSegment {
		const cell = this.cellsByRow.get(rowKey)?.get(column.key);
		const state = cell?.state ?? "pending";
		// Compact text renders only when it fits the column (mirrors the CLI matrix);
		// otherwise the state glyph keeps narrow columns scannable.
		const text =
			cell?.text !== undefined && matrixProgressDisplayWidthChars(cell.text) <= column.width
				? cell.text
				: state === "active"
					? activeGlyph
					: phaseGlyph(state);
		return { text: centerMatrixProgressText(text, column.width), style: phaseStateColor(state) };
	}

	private labelWidth(maxLineWidth?: number): number {
		const longest = Math.max(
			matrixProgressDisplayWidthChars(this.labelHeader),
			...this.rows.map((row) => matrixProgressDisplayWidthChars(row.label)),
		);
		if (maxLineWidth === undefined) return clampMatrixProgressLabelWidthChars(longest);

		const columnWidth = this.columns.reduce((width, column) => width + column.width, 0);
		const columnSeparatorsWidth = Math.max(0, this.columns.length - 1) * 2;
		const availableLabelWidth = maxLineWidth - columnWidth - columnSeparatorsWidth - 2;
		return Math.max(MATRIX_PROGRESS_MIN_LABEL_WIDTH_CHARS, Math.min(longest, availableLabelWidth));
	}
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

export class LiveCommandProgress {
	private readonly ctx: LiveCommandProgressContext;
	private readonly options: LiveCommandProgressOptions;
	private readonly startedAt = Date.now();
	private readonly target: LiveProgressTarget;
	private phase = "starting";
	private stdoutChars = 0;
	private stderrChars = 0;
	private stdoutPending = "";
	private stderrPending = "";
	private outputLines: LiveOutputLine[] = [];
	private readonly structuredWidget = new StructuredPhaseWidget();
	private readonly matrixWidget = new MatrixWidgetState();
	private lastStatusValue: string | undefined;
	private timer: ScheduledTimer | undefined;
	private isClosed = false;
	private spinnerTick = 0;
	private readonly widgetRenderRequests = new Set<() => void>();

	constructor(ctx: LiveCommandProgressContext, options: LiveCommandProgressOptions) {
		this.ctx = ctx;
		this.options = options;
		this.target = liveProgressTarget(ctx);
		traceCliCommand("live_progress_start", {
			commandName: options.commandName,
			piCommandName: options.piCommandName,
			sendMessageCalled: false,
			target: this.target,
		});

		if (this.target === "none") return;

		if (this.target === "widget") {
			this.installWidget();
			if (this.isClosed) return;
			this.timer = (options.timers ?? unrefTimerScheduler).setInterval(() => {
				this.spinnerTick += 1;
				this.requestWidgetRender();
			}, SPINNER_INTERVAL_MS);
			return;
		}

		this.refresh();
		if (this.isClosed) return;
		this.timer = (options.timers ?? unrefTimerScheduler).setInterval(() => {
			this.refresh();
		}, LIVE_PROGRESS_INTERVAL_MS);
	}

	setPhase(phase: string): void {
		this.phase = phase;
		this.refresh();
	}

	appendOutput(stream: OutputStreamName, text: string): void {
		if (text === "") return;

		if (stream === "stdout") {
			this.stdoutChars += text.length;
		} else {
			this.stderrChars += text.length;
		}
		this.recordOutput(stream, text);
		traceCliCommand("live_progress_output", {
			chunkChars: text.length,
			commandName: this.options.commandName,
			piCommandName: this.options.piCommandName,
			sendMessageCalled: false,
			stderrChars: this.stderrChars,
			stdoutChars: this.stdoutChars,
			stream,
			target: this.target,
		});
		this.refresh();
	}

	applyPhaseEvent(event: NsProgressPhaseEvent): void {
		// Matrix events have no phaseKey; keep them out of the phase checklist store.
		if (isMatrixProgressEvent(event)) {
			this.matrixWidget.apply(event);
		} else {
			this.structuredWidget.applyPhaseEvent(event);
		}
		this.refresh();
	}

	close(): void {
		if (this.isClosed) return;
		this.isClosed = true;
		this.clearTimer();
		if (this.target !== "none") {
			this.runLiveUiUpdate(() => {
				this.ctx.ui.setStatus?.(LIVE_PROGRESS_STATUS_ID, undefined);
				this.ctx.ui.setWidget?.(LIVE_PROGRESS_WIDGET_ID, undefined);
			});
		}
		traceCliCommand("live_progress_stop", {
			commandName: this.options.commandName,
			elapsedMs: Date.now() - this.startedAt,
			piCommandName: this.options.piCommandName,
			sendMessageCalled: false,
			stderrChars: this.stderrChars,
			stdoutChars: this.stdoutChars,
			target: this.target,
		});
	}

	private refresh(): void {
		if (this.target === "none" || this.isClosed) return;

		if (this.target === "widget") {
			this.requestWidgetRender();
			return;
		}

		const elapsed = formatElapsedMs(Date.now() - this.startedAt);
		this.runLiveUiUpdate(() => {
			this.renderStatus(elapsed);
		});
	}

	private installWidget(): void {
		this.runLiveUiUpdate(() => {
			this.ctx.ui.setWidget?.(
				LIVE_PROGRESS_WIDGET_ID,
				(tui: WidgetTuiHandle, theme: WidgetTheme) => {
					const requestRender = (): void => {
						tui.requestRender();
					};
					this.widgetRenderRequests.add(requestRender);
					return {
						render: (width: number): string[] => {
							if (this.isClosed || width <= 0) return [];
							const elapsed = formatElapsedMs(Date.now() - this.startedAt);
							return this.buildWidgetLines(elapsed, width).map((line) =>
								paintWidgetLine(line, theme, width),
							);
						},
						invalidate(): void {},
						dispose: (): void => {
							this.widgetRenderRequests.delete(requestRender);
						},
					};
				},
				{ placement: "aboveEditor" },
			);
		});
	}

	private requestWidgetRender(): void {
		if (this.isClosed) return;
		for (const requestRender of this.widgetRenderRequests) {
			try {
				requestRender();
			} catch {
				// A callback from a disposed TUI must not break later progress updates.
				this.widgetRenderRequests.delete(requestRender);
			}
		}
	}

	private renderStatus(elapsed: string): void {
		if (this.target !== "status") return;

		const value = this.statusValue(elapsed);
		if (value === this.lastStatusValue) return;

		this.lastStatusValue = value;
		this.ctx.ui.setStatus?.(LIVE_PROGRESS_STATUS_ID, value);
	}

	private runLiveUiUpdate(action: () => void): void {
		const result = withSafePiUi(action);
		if (result.type === "ok") return;

		this.isClosed = true;
		this.clearTimer();
		traceCliCommand("live_progress_stale_context", {
			commandName: this.options.commandName,
			piCommandName: this.options.piCommandName,
			target: this.target,
		});
	}

	private clearTimer(): void {
		if (this.timer === undefined) return;
		this.timer.cancel();
		this.timer = undefined;
	}

	private statusValue(elapsed: string): string {
		return `/${this.options.piCommandName} ${this.phase} (${elapsed})`;
	}

	private buildWidgetLines(elapsed: string, width: number): WidgetLine[] {
		const activeGlyph = spinnerFrameAt(this.spinnerTick);
		if (this.structuredWidget.isActive || this.matrixWidget.isActive) {
			const lines: WidgetLine[] = [
				this.structuredWidget.headerLine({
					cliName: this.options.cliName,
					argv: this.options.argv,
					piCommandName: this.options.piCommandName,
					elapsed,
				}),
				...this.structuredWidget.phaseLines(activeGlyph),
			];
			if (this.matrixWidget.isActive) {
				lines.push([]);
				lines.push(...this.matrixWidget.lines(activeGlyph, width));
			}
			const latestOutput = this.recentOutputLines().at(-1);
			if (latestOutput !== undefined) {
				lines.push([{ text: `  ${formatLiveOutputLine(latestOutput)}`, style: "dim" }]);
			}
			return lines;
		}

		const lines: WidgetLine[] = [
			[
				{ text: `/${this.options.piCommandName}`, style: "accent", isBold: true },
				{ text: ` ${this.phase}`, style: "text" },
				{ text: ` (${elapsed} elapsed)`, style: "dim" },
			],
			[
				{
					text: `$ ${formatCommandForDisplay(this.options.cliName, this.options.argv)} · stdout ${this.stdoutChars}, stderr ${this.stderrChars}`,
					style: "muted",
				},
			],
		];
		const recentLines = this.recentOutputLines();
		if (recentLines.length === 0) {
			lines.push([{ text: "No CLI output yet.", style: "dim" }]);
			return lines;
		}

		const shownLines = recentLines.slice(-LIVE_PROGRESS_WIDGET_OUTPUT_LINES);
		const hiddenLineCount = recentLines.length - shownLines.length;
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

	private recordOutput(stream: OutputStreamName, text: string): void {
		const pending = stream === "stdout" ? this.stdoutPending : this.stderrPending;
		const parts = `${pending}${text.replace(/\r/g, "\n")}`.split("\n");
		const nextPending = parts.pop() ?? "";
		for (const line of parts) {
			this.outputLines.push({ stream, text: line });
		}
		if (stream === "stdout") {
			this.stdoutPending = nextPending;
		} else {
			this.stderrPending = nextPending;
		}
		this.outputLines = this.outputLines.slice(-LIVE_PROGRESS_MAX_LINES);
	}

	private recentOutputLines(): LiveOutputLine[] {
		const lines = [...this.outputLines];
		if (this.stdoutPending !== "") {
			lines.push({ stream: "stdout", text: this.stdoutPending });
		}
		if (this.stderrPending !== "") {
			lines.push({ stream: "stderr", text: this.stderrPending });
		}
		return lines.slice(-LIVE_PROGRESS_MAX_LINES);
	}
}

function liveProgressTarget(ctx: LiveCommandProgressContext): LiveProgressTarget {
	if (!ctx.hasUI) return "none";

	const result = withSafePiUiValue(() => {
		const hasStatus = ctx.ui.setStatus !== undefined;
		const hasWidget = ctx.ui.setWidget !== undefined;
		if (hasWidget) return "widget";
		if (hasStatus) return "status";
		return "none";
	});
	if (result.type === "stale-context") return "none";
	return result.value;
}

function formatCommandForDisplay(cliName: string, argv: readonly string[]): string {
	return [cliName, ...argv].map(formatDisplayArg).join(" ");
}

function formatDisplayArg(arg: string): string {
	if (/^[A-Za-z0-9_./:=@+-]+$/.test(arg)) return arg;
	return JSON.stringify(arg);
}

function formatLiveOutputLine(line: LiveOutputLine): string {
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
