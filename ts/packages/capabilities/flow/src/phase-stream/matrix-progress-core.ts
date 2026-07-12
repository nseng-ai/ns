import type { Caps } from "@nseng-ai/clinkr";
import type { StreamSinkDeps } from "@nseng-ai/clinkr/stream";
import type { Clock } from "@nseng-ai/foundation/clock";
import { optionalEntries, optionalEntry } from "@nseng-ai/foundation/primitives";
import type { ActiveOperation, NsProgress } from "@nseng-ai/sdk";

import {
	composeMatrixProgressAdapters,
	createMatrixProgressControllerCore,
	type MatrixProgressController,
	type MatrixProgressSink,
} from "./matrix-progress-controller.ts";
import { createMatrixEventAdapter } from "./matrix-progress-event-adapter.ts";
import type {
	MatrixCellState,
	MatrixCellUpdate,
	MatrixColumnSpec,
	MatrixGlobalRowSpec,
	MatrixRowSpec,
	MatrixRowView,
} from "./matrix-progress-state.ts";
import {
	createMatrixTerminalAdapter,
	renderMatrixProgressFrame,
	type MatrixFrameOptionalFields,
} from "./matrix-progress-terminal-adapter.ts";
import type { PhaseSpec } from "./phase-stream-specs.ts";

export type { MatrixProgressController, MatrixProgressSink } from "./matrix-progress-controller.ts";
export {
	createMatrixProgressState,
	reduceMatrixProgress,
	snapshotMatrixProgress,
	type MatrixCellRecord,
	type MatrixCellState,
	type MatrixCellUpdate,
	type MatrixCellView,
	type MatrixColumnSpec,
	type MatrixGlobalRowSpec,
	type MatrixGlobalSubstepSpec,
	type MatrixGlobalSubstepView,
	type MatrixGlobalView,
	type MatrixProgressChange,
	type MatrixProgressMutation,
	type MatrixProgressReduction,
	type MatrixProgressSnapshot,
	type MatrixProgressState,
	type MatrixRowSpec,
	type MatrixRowView,
} from "./matrix-progress-state.ts";
export {
	TAIL_QUIET_NOTICE_MS,
	renderMatrixProgressFrame,
	type MatrixFrameOptionalFields,
} from "./matrix-progress-terminal-adapter.ts";

interface CreateMatrixProgressControllerOptions<
	ColumnKey extends string,
	Row extends MatrixRowSpec,
	GlobalKey extends string,
> {
	caps: Caps;
	deps: StreamSinkDeps;
	title: string;
	rows: readonly Row[];
	columns: readonly MatrixColumnSpec<ColumnKey>[];
	globalRows: readonly MatrixGlobalRowSpec<GlobalKey>[];
	phases: readonly PhaseSpec[];
	progress?: NsProgress;
	labelHeader?: string;
	begin?: "immediate" | "lazy";
	clock?: Clock;
}

interface CreateMatrixProgressEventControllerOptions<
	ColumnKey extends string,
	Row extends MatrixRowSpec,
	GlobalKey extends string,
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

export interface MatrixWorkflowConfig<
	Row extends { label: string },
	ColumnKey extends string,
	GlobalKey extends string = never,
> {
	columns: readonly MatrixColumnSpec<ColumnKey>[];
	globalRows?: readonly MatrixGlobalRowSpec<GlobalKey>[];
	phases: readonly PhaseSpec[];
	labelHeader?: string;
	rowKey(row: Row): string;
}

export interface MatrixWorkflow<
	Row extends { label: string },
	ColumnKey extends string,
	GlobalKey extends string = never,
> {
	createController(
		options: Omit<
			CreateMatrixProgressControllerOptions<ColumnKey, Row & MatrixRowSpec, GlobalKey>,
			"rows" | "columns" | "globalRows" | "phases"
		> & { rows: readonly Row[] },
	): Omit<MatrixProgressController<ColumnKey, Row & MatrixRowSpec, GlobalKey>, "setRows"> & {
		setRows(rows: readonly Row[]): void;
	};
	createEventController(options: {
		progress: NsProgress;
		title: string;
		rows: readonly Row[];
		begin?: "immediate" | "lazy";
	}): Omit<MatrixProgressController<ColumnKey, Row & MatrixRowSpec, GlobalKey>, "setRows"> & {
		setRows(rows: readonly Row[]): void;
	};
	renderFrame(
		input: Omit<Parameters<typeof renderMatrixProgressFrame<ColumnKey>>[0], "columns" | "rows"> & {
			rows: readonly (Row & Pick<MatrixRowView<ColumnKey>, "cells">)[];
		},
	): readonly string[];
}

export function defineMatrixWorkflow<
	Row extends { label: string },
	ColumnKey extends string,
	GlobalKey extends string = never,
>(
	config: MatrixWorkflowConfig<Row, ColumnKey, GlobalKey>,
): MatrixWorkflow<Row, ColumnKey, GlobalKey> {
	return {
		createController: (options) => {
			const controller = createMatrixProgressController({
				...options,
				rows: rowsWithKey(options.rows, config.rowKey),
				columns: config.columns,
				globalRows: config.globalRows ?? [],
				phases: config.phases,
				...(config.labelHeader === undefined ? {} : { labelHeader: config.labelHeader }),
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
				globalRows: config.globalRows ?? [],
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

function createMatrixProgressController<
	ColumnKey extends string,
	Row extends MatrixRowSpec,
	GlobalKey extends string,
>(
	options: CreateMatrixProgressControllerOptions<ColumnKey, Row, GlobalKey>,
): MatrixProgressController<ColumnKey, Row, GlobalKey> {
	return createMatrixProgressControllerCore({
		title: options.title,
		rows: options.rows,
		columns: options.columns,
		globalRows: options.globalRows,
		...(options.begin === undefined ? {} : { begin: options.begin }),
		createAdapter: ({ getLifecycle }) => {
			const terminal = createMatrixTerminalAdapter<ColumnKey, Row, GlobalKey>({
				caps: options.caps,
				deps: options.deps,
				columns: options.columns,
				phases: options.phases,
				getLifecycle,
				...(options.clock === undefined ? {} : { clock: options.clock }),
			});
			if (options.progress === undefined) return terminal;
			return composeMatrixProgressAdapters([
				terminal,
				createMatrixEventAdapter<ColumnKey, Row, GlobalKey>({
					progress: options.progress,
					columns: options.columns,
					globalRows: options.globalRows,
					phases: options.phases,
					isLazy: options.begin === "lazy",
					getLifecycle,
					...(options.labelHeader === undefined ? {} : { labelHeader: options.labelHeader }),
				}),
			]);
		},
	});
}

function createMatrixProgressEventController<
	ColumnKey extends string,
	Row extends MatrixRowSpec,
	GlobalKey extends string,
>(
	options: CreateMatrixProgressEventControllerOptions<ColumnKey, Row, GlobalKey>,
): MatrixProgressController<ColumnKey, Row, GlobalKey> {
	return createMatrixProgressControllerCore({
		title: options.title,
		rows: options.rows,
		columns: options.columns,
		globalRows: options.globalRows,
		...(options.begin === undefined ? {} : { begin: options.begin }),
		createAdapter: ({ getLifecycle }) =>
			createMatrixEventAdapter({
				progress: options.progress,
				columns: options.columns,
				globalRows: options.globalRows,
				phases: options.phases,
				isLazy: options.begin === "lazy",
				getLifecycle,
				...(options.labelHeader === undefined ? {} : { labelHeader: options.labelHeader }),
			}),
	});
}

function rowsWithKey<Row extends { label: string }>(
	rows: readonly Row[],
	keyOf: (row: Row) => string,
): readonly (Row & MatrixRowSpec)[] {
	return rows.map((row) => ({ ...row, rowKey: keyOf(row) }));
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
	sink: Pick<MatrixProgressSink<string>, "setActiveOperations"> | undefined,
	displays: readonly string[],
	run: () => Promise<T>,
): Promise<T> {
	return withActiveOperations(
		sink === undefined ? undefined : (operations) => sink.setActiveOperations(operations),
		commandOperations(displays),
		run,
	);
}
