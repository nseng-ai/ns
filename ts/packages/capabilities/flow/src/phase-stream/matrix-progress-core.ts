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
import type { Clock } from "@nseng-ai/foundation/clock";
import { optionalEntries, optionalEntry } from "@nseng-ai/foundation/primitives";
import { systemClock } from "@nseng-ai/foundation/time";
import { formatElapsedMs } from "@nseng-ai/foundation/time-format";
import {
	centerMatrixProgressText,
	clampMatrixProgressLabelWidthChars,
	formatActiveOperation,
	matrixProgressDisplayWidthChars,
	type ActiveOperation,
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

export function rowsWithKey<Row extends { label: string }>(
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

export interface MatrixRowView<ColumnKey extends string> extends MatrixRowSpec {
	cells: MatrixCellRecord<ColumnKey>;
}

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

export interface MatrixProgressSink<ColumnKey extends string, GlobalKey extends string> {
	setRows(rows: readonly MatrixRowSpec[]): void;
	setActiveOperations(operations: readonly ActiveOperation[]): void;
	setGlobal(key: GlobalKey, update: MatrixCellUpdate): void;
	setGlobalSubstep(globalKey: GlobalKey, substepKey: string, update: MatrixCellUpdate): void;
	setCell(rowKey: string, column: ColumnKey, update: MatrixCellUpdate): void;
	setAllCells(column: ColumnKey, update: MatrixCellUpdate): void;
	setAllOtherCells(column: ColumnKey, rowKey: string, update: MatrixCellUpdate): void;
}

export interface MatrixProgressController<
	ColumnKey extends string,
	GlobalKey extends string,
> extends MatrixProgressSink<ColumnKey, GlobalKey> {
	begin(): void;
	setTitle(title: string): void;
	updateRows(mutator: (rows: MatrixRowView<ColumnKey>[]) => void): void;
	note(text: string): void;
	finish(options?: { isFailed?: boolean; finalLines?: readonly string[] }): Promise<void>;
	stop(): Promise<void>;
}

export interface MatrixProgressState<ColumnKey extends string, GlobalKey extends string> {
	activeOperations: ActiveOperation[];
	globals: MatrixGlobalView<GlobalKey>[];
	rows: MatrixRowView<ColumnKey>[];
}

export interface CreateMatrixProgressControllerOptions<
	ColumnKey extends string,
	GlobalKey extends string,
> {
	caps: Caps;
	deps: StreamSinkDeps;
	title: string;
	rows: readonly MatrixRowSpec[];
	columns: readonly MatrixColumnSpec<ColumnKey>[];
	globalRows: readonly MatrixGlobalRowSpec<GlobalKey>[];
	phases: readonly PhaseSpec[];
	forward?: NsProgress;
	begin?: "immediate" | "lazy";
	/** Wall-clock seam for the tail line's quiet-time counter. Defaults to the system clock. */
	clock?: Clock;
}

/** Quiet time before the tail line grows a "· Ns ago" counter; below this, output reads as flowing. */
export const TAIL_QUIET_NOTICE_MS = 3_000;

export function createMatrixProgressController<ColumnKey extends string, GlobalKey extends string>(
	options: CreateMatrixProgressControllerOptions<ColumnKey, GlobalKey>,
): MatrixProgressController<ColumnKey, GlobalKey> {
	const sink = createStreamSink(options.caps, options.deps);
	const lifecycle = createPhaseStreamLifecycle(options.caps, sink);
	const tail = createTranscriptTail();
	const clock = options.clock ?? systemClock;
	const state = createMatrixProgressState(options.rows, options.columns, options.globalRows);
	let currentTitle = options.title;
	let hasBegun = false;
	let isSettled = false;
	let lastNoteAtMs: number | undefined;
	const renderer = createMatrixProgressRenderer({
		caps: options.caps,
		sink,
		title: () => currentTitle,
		columns: options.columns,
		// The live frame reserves the operations and tail slots (blank when empty) so the region
		// height stays stable; the settled frame drops both so scrollback carries no empty lines.
		activeOperations: () => (isSettled ? undefined : state.activeOperations),
		globals: () => state.globals,
		rows: () => state.rows,
		tailLine: () => (isSettled ? undefined : (tail.line() ?? "")),
		tailSinceOutputMs: () =>
			isSettled || lastNoteAtMs === undefined
				? undefined
				: Math.max(0, clock.nowMs() - lastNoteAtMs),
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

	function setRows(rows: readonly MatrixRowSpec[]): void {
		state.rows = createMatrixRowViews(rows, options.columns);
		ensureBegun();
		render();
	}

	function setActiveOperations(operations: readonly ActiveOperation[]): void {
		state.activeOperations = [...operations];
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

	function updateRows(mutator: (rows: MatrixRowView<ColumnKey>[]) => void): void {
		mutator(state.rows);
		render();
	}

	function note(text: string): void {
		if (!options.caps.isTty) return;
		tail.note(text);
		lastNoteAtMs = clock.nowMs();
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
		isSettled = true;
		state.activeOperations = [];
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
		setActiveOperations,
		setGlobal,
		setGlobalSubstep,
		setCell,
		setAllCells,
		setAllOtherCells,
		updateRows,
		note,
		finish,
		stop,
	};
}

export function createMatrixProgressState<ColumnKey extends string, GlobalKey extends string>(
	rows: readonly MatrixRowSpec[],
	columns: readonly MatrixColumnSpec<ColumnKey>[],
	globalRows: readonly MatrixGlobalRowSpec<GlobalKey>[],
): MatrixProgressState<ColumnKey, GlobalKey> {
	return {
		activeOperations: [],
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

export function createMatrixRowViews<ColumnKey extends string>(
	rows: readonly MatrixRowSpec[],
	columns: readonly MatrixColumnSpec<ColumnKey>[],
): MatrixRowView<ColumnKey>[] {
	return rows.map((row) => ({
		...row,
		cells: Object.fromEntries(
			columns.map((column) => [column.key, { state: "pending" } satisfies MatrixCellView]),
		) as MatrixCellRecord<ColumnKey>,
	}));
}

export interface MatrixFrameOptionalFields {
	/** Omit for a settled frame; an empty array reserves the operations slot on every live frame. */
	activeOperations?: readonly ActiveOperation[];
	/** Omit for a settled frame; an empty string reserves a blank tail slot before any output. */
	tailLine?: string;
	tailSinceOutputMs?: number;
	tick?: number;
}

export function matrixFrameOptionalFields(
	input: MatrixFrameOptionalFields,
): MatrixFrameOptionalFields {
	return optionalEntries({
		activeOperations: input.activeOperations,
		tailLine: input.tailLine,
		tailSinceOutputMs: input.tailSinceOutputMs,
		tick: input.tick,
	});
}

export function renderMatrixProgressFrame<ColumnKey extends string, GlobalKey extends string>(
	input: {
		caps: Caps;
		title: string;
		columns: readonly MatrixColumnSpec<ColumnKey>[];
		globals: readonly MatrixGlobalView<GlobalKey>[];
		rows: readonly MatrixRowView<ColumnKey>[];
		labelHeader?: string;
	} & MatrixFrameOptionalFields,
): readonly string[] {
	const tick = input.tick ?? 0;
	const operationsText = formatActiveOperationsText(input.activeOperations);
	const lines = [bold(input.title)];
	for (const global of input.globals) {
<<<<<<< HEAD
		lines.push(
			renderGlobalLine({
				caps: input.caps,
				row: global,
				tick,
				...optionalEntry("operationsText", host === global ? operationsText : undefined),
			}),
		);
		for (const substep of global.substeps) {
			lines.push(
				renderGlobalSubstepLine({
					caps: input.caps,
					row: substep,
					tick,
					...optionalEntry("operationsText", host === substep ? operationsText : undefined),
				}),
			);
=======
		lines.push(renderMatrixStatusLine(input.caps, global, tick));
		for (const substep of global.substeps) {
			lines.push(renderGlobalSubstepLine(input.caps, substep, tick));
>>>>>>> fd6a968f6 (Name metadata rejection flag as predicate)
		}
	}
	lines.push("");
	lines.push(renderHeader(input.caps, input.columns, input.labelHeader ?? "Branch / PR"));
	for (const row of input.rows) {
		lines.push(renderMatrixRow(input.caps, input.columns, row, tick));
	}
	// Every live frame keeps a dedicated operations slot at the bottom, adjacent to the tail,
	// so a reported operation is visible regardless of which rows happen to be active.
	if (input.activeOperations !== undefined) {
		lines.push(renderOperationsLine(input.caps, operationsText));
	}
	if (input.tailLine !== undefined) {
		lines.push(renderTailLine(input.caps, input.tailLine, input.tailSinceOutputMs));
	}
	return lines;
}

function formatActiveOperationsText(
	operations: readonly ActiveOperation[] | undefined,
): string | undefined {
	if (operations === undefined || operations.length === 0) return undefined;
	return operations.map(formatActiveOperation).join("; ");
}

function renderOperationsLine(caps: Caps, operationsText: string | undefined): string {
	if (operationsText === undefined) return "";
	return dim(truncatePlain(`Running: ${operationsText}`, caps.columns, ellipsisFor(caps)));
}

function renderTailLine(caps: Caps, tailLine: string, sinceOutputMs: number | undefined): string {
	if (tailLine === "") return "";
	// The quiet-time counter is the honest liveness signal: it climbs while the subprocess
	// produces nothing, which is exactly when a spinner alone cannot prove forward motion.
	const suffix =
		sinceOutputMs !== undefined && sinceOutputMs >= TAIL_QUIET_NOTICE_MS
			? ` · ${formatElapsedMs(sinceOutputMs)} ago`
			: "";
	const width = Math.max(0, caps.columns - 7 - suffix.length);
	return `       ${dim(`${truncatePlain(tailLine, width, ellipsisFor(caps))}${suffix}`)}`;
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

export function settleActiveCells<ColumnKey extends string, GlobalKey extends string>(
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

export function applyCellUpdate<Cell extends { state: MatrixCellState; text?: string }>(
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
	activeOperations: () => readonly ActiveOperation[] | undefined;
	globals: () => readonly MatrixGlobalView<GlobalKey>[];
	rows: () => readonly MatrixRowView<ColumnKey>[];
	tailLine: () => string | undefined;
	tailSinceOutputMs: () => number | undefined;
}): { render(): void } {
	const frame: FrameRenderer = (tick) => {
		const activeOperations = options.activeOperations();
		const tailLine = options.tailLine();
		const tailSinceOutputMs = options.tailSinceOutputMs();
		return renderMatrixProgressFrame({
			caps: options.caps,
			title: options.title(),
			columns: options.columns,
			...(activeOperations === undefined ? {} : { activeOperations }),
			globals: options.globals(),
			rows: options.rows(),
			...(tailLine === undefined ? {} : { tailLine }),
			...(tailSinceOutputMs === undefined ? {} : { tailSinceOutputMs }),
			tick,
		});
	};
	return {
		render: () => options.sink.render(frame),
	};
}

export function commandOperations(displays: readonly string[]): readonly ActiveOperation[] {
	return displays.map((display) => ({ kind: "command", display }));
}

export function modelOperation(
	operation: string,
	modelRef: string,
	detail?: string,
): ActiveOperation {
	return {
		kind: "model",
		operation,
		modelRef,
		...optionalEntry("detail", detail),
	};
}

export async function withActiveOperations<T>(
	onActiveOperations: ((operations: readonly ActiveOperation[]) => void) | undefined,
	operations: readonly ActiveOperation[],
	run: () => Promise<T>,
): Promise<T> {
	onActiveOperations?.(operations);
	try {
		return await run();
	} finally {
		onActiveOperations?.([]);
	}
}

export async function withCommandOperations<T>(
	sink: Pick<MatrixProgressSink<string, string>, "setActiveOperations"> | undefined,
	displays: readonly string[],
	run: () => Promise<T>,
): Promise<T> {
	return withActiveOperations(
		sink === undefined ? undefined : (operations) => sink.setActiveOperations(operations),
		commandOperations(displays),
		run,
	);
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
