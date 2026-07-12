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
	formatActiveOperationsLine,
	matrixProgressDisplayWidthChars,
	type ActiveOperation,
	type NsProgress,
	type NsProgressPhaseEvent,
	type NsProgressPhaseInfo,
} from "@nseng-ai/sdk";

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
	patchRow(rowKey: string, patch: Partial<Omit<Row, "rowKey">>): void;
	setActiveOperations(operations: readonly ActiveOperation[]): void;
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
	activeOperations: ActiveOperation[];
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
	/** Wall-clock seam for the tail line's quiet-time counter. Defaults to the system clock. */
	clock?: Clock;
}

/** Quiet time before the tail line grows a "· Ns ago" counter; below this, output reads as flowing. */
export const TAIL_QUIET_NOTICE_MS = 3_000;

interface MatrixProgressControllerContext<
	ColumnKey extends string,
	GlobalKey extends string,
	Row extends MatrixRowSpec,
> {
	readonly state: MatrixProgressState<ColumnKey, GlobalKey, Row>;
	getTitle(): string;
	isBegun(): boolean;
	isFinished(): boolean;
}

interface MatrixSettledTransitions<ColumnKey extends string, GlobalKey extends string> {
	globals: readonly { globalKey: GlobalKey; text?: string }[];
	substeps: readonly { globalKey: GlobalKey; substepKey: string; text?: string }[];
	cells: readonly { rowKey: string; columnKey: ColumnKey; text?: string }[];
}

interface MatrixProgressControllerHooks<ColumnKey extends string, GlobalKey extends string> {
	onBegin(): void;
	onTitleChanged(title: string): void;
	onRowsChanged(options: { isPreviouslyBegun: boolean }): void;
	onRowPatched(options: { isPreviouslyBegun: boolean }): void;
	onActiveOperationsChanged(operations: readonly ActiveOperation[]): void;
	onGlobalChanged(key: GlobalKey, update: MatrixCellUpdate): void;
	onGlobalSubstepChanged(globalKey: GlobalKey, substepKey: string, update: MatrixCellUpdate): void;
	onCellsChanged(column: ColumnKey, rowKeys: readonly string[], update: MatrixCellUpdate): void;
	onNote(text: string): void;
	onBeforeFinish(): Promise<void>;
	onFinish(options: {
		target: "done" | "failed";
		transitions: MatrixSettledTransitions<ColumnKey, GlobalKey>;
		finalLines: readonly string[];
	}): Promise<void>;
	onStop(): Promise<void>;
}

interface MatrixProgressAutoBeginPolicy {
	shouldBeginOnSetRows: boolean;
	shouldBeginOnPatchRow: boolean;
	shouldBeginOnSetActiveOperations: boolean;
	shouldBeginOnSetGlobal: boolean;
	shouldBeginOnSetGlobalSubstep: boolean;
	shouldBeginOnSetCell: boolean;
	shouldBeginOnSetCellsInState: boolean;
	shouldBeginOnSetAllCells: boolean;
	shouldBeginOnSetAllOtherCells: boolean;
}

function createMatrixProgressControllerCore<
	ColumnKey extends string,
	GlobalKey extends string,
	Row extends MatrixRowSpec,
>(options: {
	title: string;
	rows: readonly Row[];
	columns: readonly MatrixColumnSpec<ColumnKey>[];
	globalRows: readonly MatrixGlobalRowSpec<GlobalKey>[];
	begin?: "immediate" | "lazy";
	autoBegin: MatrixProgressAutoBeginPolicy;
	createHooks(
		context: MatrixProgressControllerContext<ColumnKey, GlobalKey, Row>,
	): MatrixProgressControllerHooks<ColumnKey, GlobalKey>;
}): MatrixProgressController<ColumnKey, GlobalKey, Row> {
	const state = createMatrixProgressState(options.rows, options.columns, options.globalRows);
	let currentTitle = options.title;
	let hasBegun = false;
	let isFinishing = false;
	let isFinished = false;
	const context: MatrixProgressControllerContext<ColumnKey, GlobalKey, Row> = {
		state,
		getTitle: () => currentTitle,
		isBegun: () => hasBegun,
		isFinished: () => isFinished,
	};
	const hooks = options.createHooks(context);

	function begin(): void {
		if (hasBegun || isFinishing || isFinished) return;
		hasBegun = true;
		hooks.onBegin();
	}

	function beginWhen(enabled: boolean): void {
		if (enabled) begin();
	}

	function setTitle(title: string): void {
		currentTitle = title;
		hooks.onTitleChanged(title);
	}

	function setRows(rows: readonly Row[]): void {
		const isPreviouslyBegun = hasBegun;
		replaceMatrixRows(state, rows, options.columns);
		beginWhen(options.autoBegin.shouldBeginOnSetRows);
		hooks.onRowsChanged({ isPreviouslyBegun });
	}

	function getRows(): readonly Readonly<Row>[] {
		return state.rows.map((row) => ({ ...row }));
	}

	function patchRow(rowKey: string, patch: Partial<Omit<Row, "rowKey">>): void {
		if (!patchMatrixRow(state, rowKey, patch)) return;
		const isPreviouslyBegun = hasBegun;
		beginWhen(options.autoBegin.shouldBeginOnPatchRow);
		hooks.onRowPatched({ isPreviouslyBegun });
	}

	function setActiveOperations(operations: readonly ActiveOperation[]): void {
		state.activeOperations = [...operations];
		beginWhen(options.autoBegin.shouldBeginOnSetActiveOperations);
		hooks.onActiveOperationsChanged(operations);
	}

	function setGlobal(key: GlobalKey, update: MatrixCellUpdate): void {
		if (!updateMatrixGlobal({ state, key, update })) return;
		beginWhen(options.autoBegin.shouldBeginOnSetGlobal);
		hooks.onGlobalChanged(key, update);
	}

	function setGlobalSubstep(
		globalKey: GlobalKey,
		substepKey: string,
		update: MatrixCellUpdate,
	): void {
		if (!updateMatrixGlobalSubstep({ state, globalKey, substepKey, update })) return;
		beginWhen(options.autoBegin.shouldBeginOnSetGlobalSubstep);
		hooks.onGlobalSubstepChanged(globalKey, substepKey, update);
	}

	function setCell(rowKey: string, column: ColumnKey, update: MatrixCellUpdate): void {
		if (!updateMatrixCell({ state, rowKey, column, update })) return;
		beginWhen(options.autoBegin.shouldBeginOnSetCell);
		hooks.onCellsChanged(column, [rowKey], update);
	}

	function setCellsInState(
		column: ColumnKey,
		fromState: MatrixCellState,
		update: MatrixCellUpdate,
	): void {
		const rowKeys = updateMatrixCellsInState({ state, column, fromState, update });
		if (rowKeys.length > 0) beginWhen(options.autoBegin.shouldBeginOnSetCellsInState);
		hooks.onCellsChanged(column, rowKeys, update);
	}

	function setAllCells(column: ColumnKey, update: MatrixCellUpdate): void {
		const rowKeys = updateAllMatrixCells({ state, column, update });
		beginWhen(options.autoBegin.shouldBeginOnSetAllCells);
		hooks.onCellsChanged(column, rowKeys, update);
	}

	function setAllOtherCells(column: ColumnKey, rowKey: string, update: MatrixCellUpdate): void {
		const rowKeys = updateAllOtherMatrixCells({ state, column, rowKey, update });
		beginWhen(options.autoBegin.shouldBeginOnSetAllOtherCells);
		hooks.onCellsChanged(column, rowKeys, update);
	}

	function note(text: string): void {
		hooks.onNote(text);
	}

	async function finish(
		finishOptions: { isFailed?: boolean; finalLines?: readonly string[] } = {},
	): Promise<void> {
		if (!hasBegun || isFinishing || isFinished) return;
		isFinishing = true;
		await hooks.onBeforeFinish();
		const target = finishOptions.isFailed === true ? "failed" : "done";
		const transitions = collectActiveMatrixTransitions(state, options.columns);
		settleActiveCells(state, options.columns, target);
		state.activeOperations = [];
		isFinished = true;
		await hooks.onFinish({
			target,
			transitions,
			finalLines: finishOptions.finalLines ?? [],
		});
	}

	async function stop(): Promise<void> {
		if (!hasBegun || isFinishing || isFinished) return;
		await hooks.onStop();
	}

	if (options.begin !== "lazy") begin();

	return {
		begin,
		setTitle,
		setRows,
		getRows,
		patchRow,
		setActiveOperations,
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

function createMatrixProgressController<
	ColumnKey extends string,
	GlobalKey extends string,
	Row extends MatrixRowSpec,
>(
	options: CreateMatrixProgressControllerOptions<ColumnKey, GlobalKey, Row>,
): MatrixProgressController<ColumnKey, GlobalKey, Row> {
	return createMatrixProgressControllerCore({
		title: options.title,
		rows: options.rows,
		columns: options.columns,
		globalRows: options.globalRows,
		...(options.begin === undefined ? {} : { begin: options.begin }),
		autoBegin: {
			shouldBeginOnSetRows: options.begin === "lazy",
			shouldBeginOnPatchRow: false,
			shouldBeginOnSetActiveOperations: false,
			shouldBeginOnSetGlobal: options.begin === "lazy",
			shouldBeginOnSetGlobalSubstep: options.begin === "lazy",
			shouldBeginOnSetCell: options.begin === "lazy",
			shouldBeginOnSetCellsInState: false,
			shouldBeginOnSetAllCells: options.begin === "lazy",
			shouldBeginOnSetAllOtherCells: options.begin === "lazy",
		},
		createHooks: (context) => createMatrixStreamControllerHooks(options, context),
	});
}

function createMatrixStreamControllerHooks<
	ColumnKey extends string,
	GlobalKey extends string,
	Row extends MatrixRowSpec,
>(
	options: CreateMatrixProgressControllerOptions<ColumnKey, GlobalKey, Row>,
	context: MatrixProgressControllerContext<ColumnKey, GlobalKey, Row>,
): MatrixProgressControllerHooks<ColumnKey, GlobalKey> {
	const sink = createStreamSink(options.caps, options.deps);
	const lifecycle = createPhaseStreamLifecycle(options.caps, sink);
	const tail = createTranscriptTail();
	const clock = options.clock ?? systemClock;
	let isSettled = false;
	let lastNoteAtMs: number | undefined;
	const renderer = createMatrixProgressRenderer({
		caps: options.caps,
		sink,
		title: context.getTitle,
		columns: options.columns,
		activeOperations: () => (isSettled ? undefined : context.state.activeOperations),
		globals: () => context.state.globals,
		rows: () => context.state.rows,
		tailLine: () => (isSettled ? undefined : (tail.line() ?? "")),
		tailSinceOutputMs: () =>
			isSettled || lastNoteAtMs === undefined
				? undefined
				: Math.max(0, clock.nowMs() - lastNoteAtMs),
	});
	const isForwarding = options.forward?.isLive === true;

	function render(): void {
		if (context.isBegun()) renderer.render();
	}

	return {
		onBegin: () => {
			if (isForwarding) {
				options.forward?.phase({
					type: "phases-declared",
					title: context.getTitle(),
					phases: phaseInfos(options.phases),
				});
			}
			lifecycle.startLiveRegion();
			renderer.render();
			lifecycle.startPump();
		},
		onTitleChanged: (title) => {
			if (isForwarding && context.isBegun()) {
				options.forward?.phase({ type: "title-changed", title });
			}
			render();
		},
		onRowsChanged: render,
		onRowPatched: render,
		onActiveOperationsChanged: render,
		onGlobalChanged: render,
		onGlobalSubstepChanged: render,
		onCellsChanged: render,
		onNote: (text) => {
			if (!options.caps.isTty) return;
			tail.note(text);
			lastNoteAtMs = clock.nowMs();
			render();
		},
		onBeforeFinish: () => lifecycle.drainPump(),
		onFinish: async (finishOptions) => {
			isSettled = true;
			tail.clear();
			renderer.render();
			sink.finish(finishOptions.finalLines);
			await lifecycle.stop();
		},
		onStop: () => lifecycle.stop(),
	};
}

interface CreateMatrixProgressEventControllerOptions<
	ColumnKey extends string,
	GlobalKey extends string,
	Row extends MatrixRowSpec,
> {
	progress: NsProgress;
	title: string;
	rows: readonly Row[];
	columns: readonly MatrixColumnSpec<ColumnKey>[];
	globalRows: readonly MatrixGlobalRowSpec<GlobalKey>[];
	phases: readonly PhaseSpec[];
	labelHeader?: string;
	begin?: "immediate" | "lazy";
}

function createMatrixProgressEventController<
	ColumnKey extends string,
	GlobalKey extends string,
	Row extends MatrixRowSpec,
>(
	options: CreateMatrixProgressEventControllerOptions<ColumnKey, GlobalKey, Row>,
): MatrixProgressController<ColumnKey, GlobalKey, Row> {
	return createMatrixProgressControllerCore({
		title: options.title,
		rows: options.rows,
		columns: options.columns,
		globalRows: options.globalRows,
		...(options.begin === undefined ? {} : { begin: options.begin }),
		autoBegin: {
			shouldBeginOnSetRows: true,
			shouldBeginOnPatchRow: true,
			shouldBeginOnSetActiveOperations: true,
			shouldBeginOnSetGlobal: true,
			shouldBeginOnSetGlobalSubstep: true,
			shouldBeginOnSetCell: true,
			shouldBeginOnSetCellsInState: true,
			shouldBeginOnSetAllCells: true,
			shouldBeginOnSetAllOtherCells: true,
		},
		createHooks: (context) => createMatrixEventControllerHooks(options, context),
	});
}

function createMatrixEventControllerHooks<
	ColumnKey extends string,
	GlobalKey extends string,
	Row extends MatrixRowSpec,
>(
	options: CreateMatrixProgressEventControllerOptions<ColumnKey, GlobalKey, Row>,
	context: MatrixProgressControllerContext<ColumnKey, GlobalKey, Row>,
): MatrixProgressControllerHooks<ColumnKey, GlobalKey> {
	function emit(event: NsProgressPhaseEvent): void {
		options.progress.phase(event);
	}

	function emitRows(): void {
		emit({
			type: "matrix-rows",
			rows: context.state.rows.map((row) => ({ rowKey: row.rowKey, label: row.label })),
		});
	}

	function emitRowsAfterMutation(isPreviouslyBegun: boolean): void {
		if (isPreviouslyBegun || context.state.rows.length === 0) emitRows();
	}

	return {
		onBegin: () => {
			emit({
				type: "phases-declared",
				title: context.getTitle(),
				phases: phaseInfos(options.phases),
			});
			emit({
				type: "matrix-declared",
				columns: options.columns.map((column) => ({
					key: column.key,
					label: column.label,
					width: column.width,
				})),
				...(options.labelHeader === undefined ? {} : { labelHeader: options.labelHeader }),
				globalRows: options.globalRows.map((row) => ({
					key: row.key,
					label: row.label,
					detail: row.detail,
					activeLabel: row.activeLabel,
					...(row.substeps === undefined
						? {}
						: { substeps: row.substeps.map((substep) => ({ ...substep })) }),
				})),
			});
			if (context.state.rows.length > 0) emitRows();
		},
		onTitleChanged: (title) => {
			if (context.isBegun() && !context.isFinished()) {
				emit({ type: "title-changed", title });
			}
		},
		onRowsChanged: ({ isPreviouslyBegun }) => emitRowsAfterMutation(isPreviouslyBegun),
		onRowPatched: ({ isPreviouslyBegun }) => emitRowsAfterMutation(isPreviouslyBegun),
		onActiveOperationsChanged: (operations) => {
			emit({ type: "matrix-active-operations", operations: [...operations] });
		},
		onGlobalChanged: (key, update) => {
			emit({
				type: "matrix-global",
				globalKey: key,
				state: update.state,
				...(update.text === undefined ? {} : { text: update.text }),
			});
		},
		onGlobalSubstepChanged: (globalKey, substepKey, update) => {
			emit({
				type: "matrix-global-substep",
				globalKey,
				substepKey,
				state: update.state,
				...(update.text === undefined ? {} : { text: update.text }),
			});
		},
		onCellsChanged: (column, rowKeys, update) => {
			for (const rowKey of rowKeys) {
				emitMatrixCell({ emit, rowKey, column, update });
			}
		},
		onNote: () => {},
		onBeforeFinish: async () => {},
		onFinish: async ({ target, transitions }) => {
			for (const global of transitions.globals) {
				emit({ type: "matrix-global", ...global, state: target });
			}
			for (const substep of transitions.substeps) {
				emit({ type: "matrix-global-substep", ...substep, state: target });
			}
			for (const cell of transitions.cells) {
				emit({ type: "matrix-cell", ...cell, state: target });
			}
			emit({ type: "matrix-active-operations", operations: [] });
		},
		onStop: async () => {},
	};
}

function collectActiveMatrixTransitions<ColumnKey extends string, GlobalKey extends string>(
	state: MatrixProgressState<ColumnKey, GlobalKey, MatrixRowSpec>,
	columns: readonly MatrixColumnSpec<ColumnKey>[],
): MatrixSettledTransitions<ColumnKey, GlobalKey> {
	return {
		globals: state.globals.flatMap((global) =>
			global.state === "active"
				? [{ globalKey: global.key, ...(global.text === undefined ? {} : { text: global.text }) }]
				: [],
		),
		substeps: state.globals.flatMap((global) =>
			global.substeps.flatMap((substep) =>
				substep.state === "active"
					? [
							{
								globalKey: global.key,
								substepKey: substep.key,
								...(substep.text === undefined ? {} : { text: substep.text }),
							},
						]
					: [],
			),
		),
		cells: state.rows.flatMap((row) =>
			columns.flatMap((column) => {
				const cell = row.cells[column.key];
				return cell.state === "active"
					? [
							{
								rowKey: row.rowKey,
								columnKey: column.key,
								...(cell.text === undefined ? {} : { text: cell.text }),
							},
						]
					: [];
			}),
		),
	};
}

function emitMatrixCell<ColumnKey extends string>(options: {
	emit(event: NsProgressPhaseEvent): void;
	rowKey: string;
	column: ColumnKey;
	update: MatrixCellUpdate;
}): void {
	options.emit({
		type: "matrix-cell",
		rowKey: options.rowKey,
		columnKey: options.column,
		state: options.update.state,
		...(options.update.text === undefined ? {} : { text: options.update.text }),
	});
}

export interface MatrixWorkflowConfig<
	Row extends { label: string },
	ColumnKey extends string,
	GlobalKey extends string,
> {
	columns: readonly MatrixColumnSpec<ColumnKey>[];
	globalRows: readonly MatrixGlobalRowSpec<GlobalKey>[];
	phases: readonly PhaseSpec[];
	labelHeader?: string;
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
	createEventController(options: {
		progress: NsProgress;
		title: string;
		rows: readonly Row[];
		begin?: "immediate" | "lazy";
	}): Omit<MatrixProgressController<ColumnKey, GlobalKey, Row & MatrixRowSpec>, "setRows"> & {
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
		createEventController: (options) => {
			const controller = createMatrixProgressEventController({
				progress: options.progress,
				title: options.title,
				rows: rowsWithKey(options.rows, config.rowKey),
				columns: config.columns,
				globalRows: config.globalRows,
				phases: config.phases,
				...(config.labelHeader === undefined ? {} : { labelHeader: config.labelHeader }),
				...(options.begin === undefined ? {} : { begin: options.begin }),
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
	const operationsLine = formatActiveOperationsLine(input.activeOperations ?? []);
	const lines = [bold(input.title)];
	for (const global of input.globals) {
		lines.push(renderMatrixStatusLine(input.caps, global, tick));
		for (const substep of global.substeps) {
			lines.push(renderGlobalSubstepLine(input.caps, substep, tick));
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
		lines.push(renderOperationsLine(input.caps, operationsLine));
	}
	if (input.tailLine !== undefined) {
		lines.push(renderTailLine(input.caps, input.tailLine, input.tailSinceOutputMs));
	}
	return lines;
}

function renderOperationsLine(caps: Caps, operationsLine: string | undefined): string {
	if (operationsLine === undefined) return "";
	return dim(truncatePlain(operationsLine, caps.columns, ellipsisFor(caps)));
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

function replaceMatrixRows<
	ColumnKey extends string,
	GlobalKey extends string,
	Row extends MatrixRowSpec,
>(
	state: MatrixProgressState<ColumnKey, GlobalKey, Row>,
	rows: readonly Row[],
	columns: readonly MatrixColumnSpec<ColumnKey>[],
): void {
	state.rows = createMatrixRowViews(rows, columns);
}

function patchMatrixRow<
	ColumnKey extends string,
	GlobalKey extends string,
	Row extends MatrixRowSpec,
>(
	state: MatrixProgressState<ColumnKey, GlobalKey, Row>,
	rowKey: string,
	patch: Partial<Omit<Row, "rowKey">>,
): boolean {
	const rowIndex = state.rows.findIndex((candidate) => candidate.rowKey === rowKey);
	const existing = state.rows[rowIndex];
	if (existing === undefined) return false;
	state.rows[rowIndex] = { ...existing, ...patch };
	return true;
}

interface UpdateMatrixGlobalOptions<
	ColumnKey extends string,
	GlobalKey extends string,
	Row extends MatrixRowSpec,
> {
	state: MatrixProgressState<ColumnKey, GlobalKey, Row>;
	key: GlobalKey;
	update: MatrixCellUpdate;
}

function updateMatrixGlobal<
	ColumnKey extends string,
	GlobalKey extends string,
	Row extends MatrixRowSpec,
>(options: UpdateMatrixGlobalOptions<ColumnKey, GlobalKey, Row>): boolean {
	const { state, key, update } = options;
	const rowIndex = state.globals.findIndex((global) => global.key === key);
	const row = state.globals[rowIndex];
	if (row === undefined) return false;
	state.globals[rowIndex] = applyCellUpdate(row, update);
	return true;
}

interface UpdateMatrixGlobalSubstepOptions<
	ColumnKey extends string,
	GlobalKey extends string,
	Row extends MatrixRowSpec,
> {
	state: MatrixProgressState<ColumnKey, GlobalKey, Row>;
	globalKey: GlobalKey;
	substepKey: string;
	update: MatrixCellUpdate;
}

function updateMatrixGlobalSubstep<
	ColumnKey extends string,
	GlobalKey extends string,
	Row extends MatrixRowSpec,
>(options: UpdateMatrixGlobalSubstepOptions<ColumnKey, GlobalKey, Row>): boolean {
	const { state, globalKey, substepKey, update } = options;
	const row = state.globals.find((global) => global.key === globalKey);
	const substepIndex = row?.substeps.findIndex((item) => item.key === substepKey) ?? -1;
	const substep = row?.substeps[substepIndex];
	if (row === undefined || substep === undefined) return false;
	row.substeps[substepIndex] = applyCellUpdate(substep, update);
	return true;
}

interface UpdateMatrixCellOptions<
	ColumnKey extends string,
	GlobalKey extends string,
	Row extends MatrixRowSpec,
> {
	state: MatrixProgressState<ColumnKey, GlobalKey, Row>;
	rowKey: string;
	column: ColumnKey;
	update: MatrixCellUpdate;
}

function updateMatrixCell<
	ColumnKey extends string,
	GlobalKey extends string,
	Row extends MatrixRowSpec,
>(options: UpdateMatrixCellOptions<ColumnKey, GlobalKey, Row>): boolean {
	const { state, rowKey, column, update } = options;
	const row = state.rows.find((item) => item.rowKey === rowKey);
	if (row === undefined) return false;
	row.cells[column] = matrixCellFromUpdate(update);
	return true;
}

interface UpdateMatrixCellsInStateOptions<
	ColumnKey extends string,
	GlobalKey extends string,
	Row extends MatrixRowSpec,
> {
	state: MatrixProgressState<ColumnKey, GlobalKey, Row>;
	column: ColumnKey;
	fromState: MatrixCellState;
	update: MatrixCellUpdate;
}

function updateMatrixCellsInState<
	ColumnKey extends string,
	GlobalKey extends string,
	Row extends MatrixRowSpec,
>(options: UpdateMatrixCellsInStateOptions<ColumnKey, GlobalKey, Row>): readonly string[] {
	const { state, column, fromState, update } = options;
	const rowKeys: string[] = [];
	for (const row of state.rows) {
		if (row.cells[column].state !== fromState) continue;
		row.cells[column] = matrixCellFromUpdate(update);
		rowKeys.push(row.rowKey);
	}
	return rowKeys;
}

interface UpdateAllMatrixCellsOptions<
	ColumnKey extends string,
	GlobalKey extends string,
	Row extends MatrixRowSpec,
> {
	state: MatrixProgressState<ColumnKey, GlobalKey, Row>;
	column: ColumnKey;
	update: MatrixCellUpdate;
}

function updateAllMatrixCells<
	ColumnKey extends string,
	GlobalKey extends string,
	Row extends MatrixRowSpec,
>(options: UpdateAllMatrixCellsOptions<ColumnKey, GlobalKey, Row>): readonly string[] {
	const { state, column, update } = options;
	for (const row of state.rows) row.cells[column] = matrixCellFromUpdate(update);
	return state.rows.map((row) => row.rowKey);
}

interface UpdateAllOtherMatrixCellsOptions<
	ColumnKey extends string,
	GlobalKey extends string,
	Row extends MatrixRowSpec,
> {
	state: MatrixProgressState<ColumnKey, GlobalKey, Row>;
	column: ColumnKey;
	rowKey: string;
	update: MatrixCellUpdate;
}

function updateAllOtherMatrixCells<
	ColumnKey extends string,
	GlobalKey extends string,
	Row extends MatrixRowSpec,
>(options: UpdateAllOtherMatrixCellsOptions<ColumnKey, GlobalKey, Row>): readonly string[] {
	const { state, column, rowKey, update } = options;
	const rowKeys: string[] = [];
	for (const row of state.rows) {
		if (row.rowKey === rowKey) continue;
		row.cells[column] = matrixCellFromUpdate(update);
		rowKeys.push(row.rowKey);
	}
	return rowKeys;
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
			...optionalEntry("activeOperations", activeOperations),
			globals: options.globals(),
			rows: options.rows(),
			...(tailLine === undefined ? {} : { tailLine }),
			...optionalEntry("tailSinceOutputMs", tailSinceOutputMs),
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
