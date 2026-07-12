import type { Caps } from "@nseng-ai/clinkr";
import type { StreamSinkDeps } from "@nseng-ai/clinkr/stream";
import type { Clock } from "@nseng-ai/foundation/clock";
import { optionalEntries, optionalEntry } from "@nseng-ai/foundation/primitives";
import type { ActiveOperation, NsProgress } from "@nseng-ai/sdk";

import {
	composeMatrixProgressAdapters,
	createMatrixProgressControllerCore,
	type MatrixProgressAdapter,
} from "./matrix-progress-controller.ts";
import { createMatrixEventAdapter } from "./matrix-progress-event-adapter.ts";
import { createMatrixSettledAdapter } from "./matrix-progress-settled-adapter.ts";
import type {
	MatrixCellState,
	MatrixCellUpdate,
	MatrixColumnSpec,
	MatrixProgressAction,
	MatrixRowSpec,
	MatrixRowView,
} from "./matrix-progress-state.ts";
import {
	createMatrixTerminalAdapter,
	renderMatrixProgressFrame,
	type MatrixFrameOptionalFields,
} from "./matrix-progress-terminal-adapter.ts";
import type { PhaseSpec } from "./phase-stream-specs.ts";

export type MatrixProgressPresentation =
	| {
			kind: "terminal";
			caps: Caps;
			deps: StreamSinkDeps;
			clock?: Clock;
	  }
	| { kind: "event"; progress: NsProgress }
	| {
			kind: "terminal-and-event";
			caps: Caps;
			deps: StreamSinkDeps;
			progress: NsProgress;
			clock?: Clock;
	  }
	| { kind: "settled-transcript"; caps: Caps; deps: StreamSinkDeps };

interface CreateMatrixWorkflowControllerOptions<Row> {
	title: string;
	rows: readonly Row[];
	presentation: MatrixProgressPresentation;
	begin?: "immediate" | "lazy";
}

export interface MatrixWorkflowConfig<Row extends { label: string }, ColumnKey extends string> {
	columns: readonly MatrixColumnSpec<ColumnKey>[];
	phases: readonly PhaseSpec[];
	labelHeader?: string;
	rowKey(row: Row): string;
}

type MatrixWorkflowAction<Row extends { label: string }, ColumnKey extends string> =
	| Exclude<MatrixProgressAction<ColumnKey, Row & MatrixRowSpec>, { kind: "rows-replaced" }>
	| { kind: "rows-replaced"; rows: readonly Row[] };

export interface MatrixWorkflowController<Row extends { label: string }, ColumnKey extends string> {
	begin(): void;
	dispatch(action: MatrixWorkflowAction<Row, ColumnKey>): void;
	getRows(): readonly Readonly<Row & MatrixRowSpec>[];
	finish(options?: { isFailed?: boolean; finalLines?: readonly string[] }): Promise<void>;
	stop(): Promise<void>;
}

export interface MatrixWorkflow<Row extends { label: string }, ColumnKey extends string> {
	createController(
		options: CreateMatrixWorkflowControllerOptions<Row>,
	): MatrixWorkflowController<Row, ColumnKey>;
	renderFrame(
		input: Omit<Parameters<typeof renderMatrixProgressFrame<ColumnKey>>[0], "columns" | "rows"> & {
			rows: readonly (Row & Pick<MatrixRowView<ColumnKey>, "cells">)[];
		},
	): readonly string[];
}

export function defineMatrixWorkflow<Row extends { label: string }, ColumnKey extends string>(
	config: MatrixWorkflowConfig<Row, ColumnKey>,
): MatrixWorkflow<Row, ColumnKey> {
	return {
		createController: (options) => {
			const controller = createMatrixProgressControllerCore({
				title: options.title,
				rows: rowsWithKey(options.rows, config.rowKey),
				columns: config.columns,
				phases: config.phases,
				...(options.begin === undefined ? {} : { begin: options.begin }),
				adapter: createAdapter(config, options.presentation),
			});
			return {
				...controller,
				dispatch: (action) => {
					if (action.kind === "rows-replaced") {
						controller.dispatch({
							kind: "rows-replaced",
							rows: rowsWithKey(action.rows, config.rowKey),
						});
						return;
					}
					controller.dispatch(action);
				},
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

function createAdapter<Row extends { label: string }, ColumnKey extends string>(
	config: MatrixWorkflowConfig<Row, ColumnKey>,
	presentation: MatrixProgressPresentation,
): MatrixProgressAdapter<ColumnKey, Row & MatrixRowSpec> {
	const event = (progress: NsProgress) =>
		createMatrixEventAdapter<ColumnKey, Row & MatrixRowSpec>({
			progress,
			columns: config.columns,
			phases: config.phases,
			...(config.labelHeader === undefined ? {} : { labelHeader: config.labelHeader }),
		});
	const terminal = (options: { caps: Caps; deps: StreamSinkDeps; clock?: Clock }) =>
		createMatrixTerminalAdapter<ColumnKey, Row & MatrixRowSpec>({
			caps: options.caps,
			deps: options.deps,
			columns: config.columns,
			...(options.clock === undefined ? {} : { clock: options.clock }),
		});
	switch (presentation.kind) {
		case "terminal":
			return terminal(presentation);
		case "event":
			return event(presentation.progress);
		case "terminal-and-event":
			return composeMatrixProgressAdapters([terminal(presentation), event(presentation.progress)]);
		case "settled-transcript":
			return createMatrixSettledAdapter(presentation);
	}
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
	sink: { setActiveOperations(operations: readonly ActiveOperation[]): void } | undefined,
	displays: readonly string[],
	run: () => Promise<T>,
): Promise<T> {
	return withActiveOperations(
		sink === undefined ? undefined : (operations) => sink.setActiveOperations(operations),
		commandOperations(displays),
		run,
	);
}
