import type { Caps } from "@nseng-ai/clinkr";
import {
	createStreamSink,
	type FrameRenderer,
	type StreamSink,
	type StreamSinkDeps,
} from "@nseng-ai/clinkr/stream";
import {
	bold,
	dim,
	ellipsisFor,
	padPlain,
	paint,
	spinnerFrame,
	statusLine,
	truncatePlain,
} from "@nseng-ai/foundation/cli-theme";
import {
	centerMatrixProgressText,
	clampMatrixProgressLabelWidthChars,
	matrixProgressDisplayWidthChars,
	type NsProgress,
	type NsProgressPhaseInfo,
} from "@nseng-ai/kernel/sdk";

import { createPhaseStreamLifecycle } from "./phase-stream-lifecycle.ts";
import type { PhaseSpec } from "./phase-stream-specs.ts";
import { createTranscriptTail } from "./phase-stream-tail.ts";

export type MatrixCellState = "pending" | "active" | "done" | "skipped" | "failed";

export interface MatrixCellUpdate {
	state: MatrixCellState;
	text?: string;
}

export interface MatrixColumnSpec<ColumnKey extends string> {
	key: ColumnKey;
	label: string;
	width: number;
}

export interface MatrixRowSpec {
	rowKey: string;
	label: string;
}

function rowsWithKey<Row extends { label: string }>(
	rows: readonly Row[],
	keyOf: (row: Row) => string,
): readonly (Row & MatrixRowSpec)[] {
	return rows.map((row) => ({ ...row, rowKey: keyOf(row) }));
}

export interface MatrixGlobalRowSpec<GlobalKey extends string> {
	key: GlobalKey;
	label: string;
	detail: string;
	activeLabel: string;
	substeps?: readonly MatrixGlobalSubstepSpec[];
}

export interface MatrixGlobalSubstepSpec {
	key: string;
	label: string;
	detail: string;
	activeLabel: string;
}

export interface MatrixCellView {
	state: MatrixCellState;
	text?: string;
}

export type MatrixCellRecord<ColumnKey extends string> = Record<ColumnKey, MatrixCellView>;

export type MatrixRowView<
	ColumnKey extends string,
	Row extends MatrixRowSpec = MatrixRowSpec,
> = Row & {
	cells: MatrixCellRecord<ColumnKey>;
};

export interface MatrixGlobalView<GlobalKey extends string> {
	key: GlobalKey;
	label: string;
	detail: string;
	activeLabel: string;
	state: MatrixCellState;
	text?: string;
	substeps: MatrixGlobalSubstepView[];
}

export interface MatrixGlobalSubstepView {
	key: string;
	label: string;
	detail: string;
	activeLabel: string;
	state: MatrixCellState;
	text?: string;
}

export interface MatrixProgressSink<
	ColumnKey extends string,
	GlobalKey extends string,
	Row extends MatrixRowSpec = MatrixRowSpec,
> {
	setRows(rows: readonly Row[]): void;
	getRows(): readonly Readonly<Row>[];
	replaceRow(rowKey: string, row: Row): void;
	patchRow(rowKey: string, patch: Partial<Omit<Row, "rowKey">>): void;
	setRunningCommands(commands: readonly string[]): void;
	setGlobal(key: GlobalKey, update: MatrixCellUpdate): void;
	setGlobalSubstep(globalKey: GlobalKey, substepKey: string, update: MatrixCellUpdate): void;
	setCell(rowKey: string, column: ColumnKey, update: MatrixCellUpdate): void;
	setCellsInState(column: ColumnKey, fromState: MatrixCellState, update: MatrixCellUpdate): void;
	setAllCells(column: ColumnKey, update: MatrixCellUpdate): void;
	setAllOtherCells(column: ColumnKey, rowKey: string, update: MatrixCellUpdate): void;
}

export interface MatrixProgressController<
	ColumnKey extends string,
	GlobalKey extends string,
	Row extends MatrixRowSpec = MatrixRowSpec,
> extends MatrixProgressSink<ColumnKey, GlobalKey, Row> {
	begin(): void;
	setTitle(title: string): void;
	note(text: string): void;
	finish(options?: { isFailed?: boolean; finalLines?: readonly string[] }): Promise<void>;
	stop(): Promise<void>;
}

interface MatrixProgressState<
	ColumnKey extends string,
	GlobalKey extends string,
	Row extends MatrixRowSpec,
> {
	runningCommands: string[];
	globals: MatrixGlobalView<GlobalKey>[];
	rows: MatrixRowView<ColumnKey, Row>[];
}

interface CreateMatrixProgressControllerOptions<
	ColumnKey extends string,
	GlobalKey extends string,
	Row extends MatrixRowSpec,
> {
	caps: Caps;
	deps: StreamSinkDeps;
	title: string;
	rows: readonly Row[];
	columns: readonly MatrixColumnSpec<ColumnKey>[];
	globalRows: readonly MatrixGlobalRowSpec<GlobalKey>[];
	phases: readonly PhaseSpec[];
	forward?: NsProgress;
	begin?: "immediate" | "lazy";
}

function createMatrixProgressController<
	ColumnKey extends string,
	GlobalKey extends string,
	Row extends MatrixRowSpec,
>(
	options: CreateMatrixProgressControllerOptions<ColumnKey, GlobalKey, Row>,
): MatrixProgressController<ColumnKey, GlobalKey, Row> {
	const sink = createStreamSink(options.caps, options.deps);
	const lifecycle = createPhaseStreamLifecycle(options.caps, sink);
	const tail = createTranscriptTail();
	const state = createMatrixProgressState(options.rows, options.columns, options.globalRows);
	let currentTitle = options.title;
	let hasBegun = false;
	const renderer = createMatrixProgressRenderer({
		caps: options.caps,
		sink,
		title: () => currentTitle,
		columns: options.columns,
		runningCommands: () => state.runningCommands,
		globals: () => state.globals,
		rows: () => state.rows,
		tailLine: tail.line,
	});
	const isForwarding = options.forward?.isLive === true;

	function render(): void {
		if (!hasBegun) return;
		renderer.render();
	}

	function begin(): void {
		if (hasBegun) return;
		hasBegun = true;
		if (isForwarding) {
			options.forward?.phase({
				type: "phases-declared",
				title: currentTitle,
				phases: phaseInfos(options.phases),
			});
		}
		lifecycle.startLiveRegion();
		renderer.render();
		lifecycle.startPump();
	}

	function ensureBegun(): void {
		if (options.begin === "lazy") begin();
	}

	function setTitle(title: string): void {
		currentTitle = title;
		if (isForwarding && hasBegun) options.forward?.phase({ type: "title-changed", title });
		render();
	}

	function setRows(rows: readonly Row[]): void {
		state.rows = createMatrixRowViews(rows, options.columns);
		ensureBegun();
		render();
	}

	function getRows(): readonly Readonly<Row>[] {
		return state.rows.map((row) => ({ ...row }));
	}

	function replaceRow(rowKey: string, row: Row): void {
		const rowIndex = state.rows.findIndex((candidate) => candidate.rowKey === rowKey);
		const existing = state.rows[rowIndex];
		if (existing === undefined) return;
		state.rows[rowIndex] = { ...row, cells: existing.cells };
		render();
	}

	function patchRow(rowKey: string, patch: Partial<Omit<Row, "rowKey">>): void {
		const rowIndex = state.rows.findIndex((candidate) => candidate.rowKey === rowKey);
		const existing = state.rows[rowIndex];
		if (existing === undefined) return;
		state.rows[rowIndex] = { ...existing, ...patch };
		render();
	}

	function setRunningCommands(commands: readonly string[]): void {
		state.runningCommands = [...commands];
		render();
	}

	function setGlobal(key: GlobalKey, update: MatrixCellUpdate): void {
		const rowIndex = state.globals.findIndex((global) => global.key === key);
		const row = state.globals[rowIndex];
		if (row === undefined) return;
		state.globals[rowIndex] = applyCellUpdate(row, update);
		ensureBegun();
		render();
	}

	function setGlobalSubstep(
		globalKey: GlobalKey,
		substepKey: string,
		update: MatrixCellUpdate,
	): void {
		const row = state.globals.find((global) => global.key === globalKey);
		const substepIndex = row?.substeps.findIndex((item) => item.key === substepKey) ?? -1;
		const substep = row?.substeps[substepIndex];
		if (row === undefined || substep === undefined) return;
		row.substeps[substepIndex] = applyCellUpdate(substep, update);
		ensureBegun();
		render();
	}

	function setCell(rowKey: string, column: ColumnKey, update: MatrixCellUpdate): void {
		const row = state.rows.find((item) => item.rowKey === rowKey);
		if (row === undefined) return;
		row.cells[column] = matrixCellFromUpdate(update);
		ensureBegun();
		render();
	}

	function setCellsInState(
		column: ColumnKey,
		fromState: MatrixCellState,
		update: MatrixCellUpdate,
	): void {
		for (const row of state.rows) {
			if (row.cells[column].state !== fromState) continue;
			row.cells[column] = matrixCellFromUpdate(update);
		}
		render();
	}

	function setAllCells(column: ColumnKey, update: MatrixCellUpdate): void {
		for (const row of state.rows) {
			row.cells[column] = matrixCellFromUpdate(update);
		}
		ensureBegun();
		render();
	}

	function setAllOtherCells(column: ColumnKey, rowKey: string, update: MatrixCellUpdate): void {
		for (const row of state.rows) {
			if (row.rowKey === rowKey) continue;
			row.cells[column] = matrixCellFromUpdate(update);
		}
		ensureBegun();
		render();
	}

	function note(text: string): void {
		if (!options.caps.isTty) return;
		tail.note(text);
		render();
	}

	function failActive(): void {
		settleActiveCells(state, options.columns, "failed");
		render();
	}

	async function finish(
		finishOptions: { isFailed?: boolean; finalLines?: readonly string[] } = {},
	): Promise<void> {
		if (!hasBegun) return;
		await lifecycle.drainPump();
		if (finishOptions.isFailed === true) failActive();
		else settleActiveCells(state, options.columns, "done");
		tail.clear();
		renderer.render();
		sink.finish(finishOptions.finalLines ?? []);
		await lifecycle.stop();
	}

	async function stop(): Promise<void> {
		if (!hasBegun) return;
		await lifecycle.stop();
	}

	if (options.begin !== "lazy") begin();

	return {
		begin,
		setTitle,
		setRows,
		getRows,
		replaceRow,
		patchRow,
		setRunningCommands,
		setGlobal,
		setGlobalSubstep,
		setCell,
		setCellsInState,
		setAllCells,
		setAllOtherCells,
		note,
		finish,
		stop,
	};
}

export interface MatrixWorkflowConfig<
	Row extends { label: string },
	ColumnKey extends string,
	GlobalKey extends string,
> {
	columns: readonly MatrixColumnSpec<ColumnKey>[];
	globalRows: readonly MatrixGlobalRowSpec<GlobalKey>[];
	phases: readonly PhaseSpec[];
	rowKey(row: Row): string;
}

export interface MatrixWorkflow<
	Row extends { label: string },
	ColumnKey extends string,
	GlobalKey extends string,
> {
	createController(
		options: Omit<
			CreateMatrixProgressControllerOptions<ColumnKey, GlobalKey, Row & MatrixRowSpec>,
			"rows" | "columns" | "globalRows" | "phases"
		> & { rows: readonly Row[] },
	): Omit<MatrixProgressController<ColumnKey, GlobalKey, Row & MatrixRowSpec>, "setRows"> & {
		setRows(rows: readonly Row[]): void;
	};
	renderFrame(
		input: Omit<
			Parameters<typeof renderMatrixProgressFrame<ColumnKey, GlobalKey>>[0],
			"columns" | "rows"
		> & {
			rows: readonly (Row & Pick<MatrixRowView<ColumnKey>, "cells">)[];
		},
	): readonly string[];
}

export function defineMatrixWorkflow<
	Row extends { label: string },
	ColumnKey extends string,
	GlobalKey extends string,
>(
	config: MatrixWorkflowConfig<Row, ColumnKey, GlobalKey>,
): MatrixWorkflow<Row, ColumnKey, GlobalKey> {
	return {
		createController: (options) => {
			const controller = createMatrixProgressController({
				...options,
				rows: rowsWithKey(options.rows, config.rowKey),
				columns: config.columns,
				globalRows: config.globalRows,
				phases: config.phases,
			});
			return {
				...controller,
				setRows: (rows) => controller.setRows(rowsWithKey(rows, config.rowKey)),
			};
		},
		renderFrame: (input) =>
			renderMatrixProgressFrame({
				...input,
				columns: config.columns,
				rows: rowsWithKey(input.rows, config.rowKey),
			}),
	};
}

function createMatrixProgressState<
	ColumnKey extends string,
	GlobalKey extends string,
	Row extends MatrixRowSpec,
>(
	rows: readonly Row[],
	columns: readonly MatrixColumnSpec<ColumnKey>[],
	globalRows: readonly MatrixGlobalRowSpec<GlobalKey>[],
): MatrixProgressState<ColumnKey, GlobalKey, Row> {
	return {
		runningCommands: [],
		globals: globalRows.map((row) => ({
			key: row.key,
			label: row.label,
			detail: row.detail,
			activeLabel: row.activeLabel,
			state: "pending",
			substeps: (row.substeps ?? []).map((substep) => ({ ...substep, state: "pending" })),
		})),
		rows: createMatrixRowViews(rows, columns),
	};
}

function createMatrixRowViews<ColumnKey extends string, Row extends MatrixRowSpec>(
	rows: readonly Row[],
	columns: readonly MatrixColumnSpec<ColumnKey>[],
): MatrixRowView<ColumnKey, Row>[] {
	return rows.map((row) => ({
		...row,
		cells: Object.fromEntries(
			columns.map((column) => [column.key, { state: "pending" } satisfies MatrixCellView]),
		) as MatrixCellRecord<ColumnKey>,
	}));
}

export function renderMatrixProgressFrame<
	ColumnKey extends string,
	GlobalKey extends string,
>(input: {
	caps: Caps;
	title: string;
	runningCommands?: readonly string[];
	columns: readonly MatrixColumnSpec<ColumnKey>[];
	globals: readonly MatrixGlobalView<GlobalKey>[];
	rows: readonly MatrixRowView<ColumnKey>[];
	labelHeader?: string;
	tailLine?: string;
	tick?: number;
}): readonly string[] {
	const tick = input.tick ?? 0;
	const lines = [bold(input.title), renderRunningCommands(input.caps, input.runningCommands ?? [])];
	for (const global of input.globals) {
		lines.push(renderGlobalLine(input.caps, global, tick));
		for (const substep of global.substeps) {
			lines.push(renderGlobalSubstepLine(input.caps, substep, tick));
		}
	}
	lines.push("");
	lines.push(renderHeader(input.caps, input.columns, input.labelHeader ?? "Branch / PR"));
	for (const row of input.rows) {
		lines.push(renderMatrixRow(input.caps, input.columns, row, tick));
	}
	if (input.tailLine !== undefined) {
		lines.push(
			`       ${dim(truncatePlain(input.tailLine, Math.max(0, input.caps.columns - 7), ellipsisFor(input.caps)))}`,
		);
	}
	return lines;
}

export function updateForPhase(state: MatrixCellState, text: string | undefined): MatrixCellUpdate {
	return { state, ...(text === undefined ? {} : { text }) };
}

export interface RunTrackedMatrixStepOptions<Result extends { type: string }> {
	onActive(): void;
	onDone(result: Result): void;
	onFailed(result: Result): void;
	op(): Promise<Result>;
}

export async function runTrackedMatrixStep<Result extends { type: string }>(
	options: RunTrackedMatrixStepOptions<Result>,
): Promise<Result> {
	options.onActive();
	const result = await options.op();
	if (result.type === "failure") options.onFailed(result);
	else options.onDone(result);
	return result;
}

function settleActiveCells<ColumnKey extends string, GlobalKey extends string>(
	state: { globals: MatrixGlobalView<GlobalKey>[]; rows: MatrixRowView<ColumnKey>[] },
	columns: readonly MatrixColumnSpec<ColumnKey>[],
	target: MatrixCellState,
): void {
	for (const global of state.globals) {
		if (global.state === "active") global.state = target;
		for (const substep of global.substeps) {
			if (substep.state === "active") substep.state = target;
		}
	}
	for (const row of state.rows) {
		for (const column of columns) {
			const cell = row.cells[column.key];
			if (cell.state === "active") row.cells[column.key] = { ...cell, state: target };
		}
	}
}

function applyCellUpdate<Cell extends { state: MatrixCellState; text?: string }>(
	cell: Cell,
	update: MatrixCellUpdate,
): Cell {
	if (update.text !== undefined) return { ...cell, state: update.state, text: update.text };
	const { text: _text, ...cellWithoutText } = cell;
	return { ...cellWithoutText, state: update.state } as Cell;
}

function createMatrixProgressRenderer<ColumnKey extends string, GlobalKey extends string>(options: {
	caps: Caps;
	sink: StreamSink;
	title: () => string;
	columns: readonly MatrixColumnSpec<ColumnKey>[];
	runningCommands: () => readonly string[];
	globals: () => readonly MatrixGlobalView<GlobalKey>[];
	rows: () => readonly MatrixRowView<ColumnKey>[];
	tailLine: () => string | undefined;
}): { render(): void } {
	const frame: FrameRenderer = (tick) => {
		const tailLine = options.tailLine();
		return renderMatrixProgressFrame({
			caps: options.caps,
			title: options.title(),
			columns: options.columns,
			runningCommands: options.runningCommands(),
			globals: options.globals(),
			rows: options.rows(),
			...(tailLine === undefined ? {} : { tailLine }),
			tick,
		});
	};
	return {
		render: () => options.sink.render(frame),
	};
}

function renderRunningCommands(caps: Caps, commands: readonly string[]): string {
	const text = commands.length === 0 ? "Running: —" : `Running: ${commands.join("; ")}`;
	return dim(truncatePlain(text, caps.columns, ellipsisFor(caps)));
}

function renderGlobalLine(caps: Caps, row: MatrixGlobalView<string>, tick: number): string {
	return renderMatrixStatusLine(caps, row, tick);
}

function renderGlobalSubstepLine(caps: Caps, row: MatrixGlobalSubstepView, tick: number): string {
	const rendered = renderMatrixStatusLine(
		{ ...caps, columns: Math.max(0, caps.columns - 4) },
		row,
		tick,
	);
	return `    ${rendered}`;
}

function renderMatrixStatusLine(
	caps: Caps,
	row: MatrixGlobalView<string> | MatrixGlobalSubstepView,
	tick: number,
): string {
	return statusLine({
		caps,
		item: { name: row.label, detail: row.text ?? row.detail, label: row.text ?? row.activeLabel },
		state: row.state,
		tick,
		showSettledText: false,
	});
}

function renderHeader<ColumnKey extends string>(
	caps: Caps,
	columns: readonly MatrixColumnSpec<ColumnKey>[],
	labelHeader: string,
): string {
	return dim(
		`${padPlain(labelHeader, labelWidth(caps))}  ${columns.map((column) => padPlain(column.label, column.width)).join("  ")}`,
	);
}

function renderMatrixRow<ColumnKey extends string>(
	caps: Caps,
	columns: readonly MatrixColumnSpec<ColumnKey>[],
	row: MatrixRowView<ColumnKey>,
	tick: number,
): string {
	const label = padPlain(
		truncatePlain(row.label, labelWidth(caps), ellipsisFor(caps)),
		labelWidth(caps),
	);
	const cells = columns
		.map((column) =>
			centerMatrixProgressText(
				renderCell({ caps, cell: row.cells[column.key], tick, width: column.width }),
				column.width,
			),
		)
		.join("  ");
	return `${label}  ${cells}`;
}

function renderCell(options: {
	caps: Caps;
	cell: MatrixCellView;
	tick: number;
	width: number;
}): string {
	// Compact text renders only when it fits the column; longer text (for example full
	// command displays) falls back to the legacy symbols so narrow columns stay scannable.
	const text =
		options.cell.text !== undefined &&
		matrixProgressDisplayWidthChars(options.cell.text) <= options.width
			? options.cell.text
			: undefined;
	switch (options.cell.state) {
		case "pending":
			return dim(text ?? "·");
		case "active":
			return paint(options.caps, "accent", text ?? spinnerFrame(options.caps, options.tick));
		case "done":
			return text ?? "✓";
		case "skipped":
			return dim(text ?? "–");
		case "failed":
			return text === undefined ? "✗" : paint(options.caps, "error", text);
	}
}

function labelWidth(caps: Caps): number {
	return clampMatrixProgressLabelWidthChars(caps.columns - 44);
}

function matrixCellFromUpdate(update: MatrixCellUpdate): MatrixCellView {
	return { state: update.state, ...(update.text === undefined ? {} : { text: update.text }) };
}

function phaseInfos(specs: readonly PhaseSpec[]): readonly NsProgressPhaseInfo[] {
	return specs.map((spec) => ({
		key: spec.key,
		name: spec.item.name,
		...(spec.item.label === undefined ? {} : { label: spec.item.label }),
		...(spec.item.detail === undefined ? {} : { detail: spec.item.detail }),
	}));
}
