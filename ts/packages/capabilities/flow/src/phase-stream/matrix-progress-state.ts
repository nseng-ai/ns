import type { ActiveOperation, NsProgressPhaseEvent, NsProgressPhaseInfo } from "@nseng-ai/sdk";

import type { PhaseView } from "./phase-stream-state.ts";

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

export interface MatrixCellView {
	state: MatrixCellState;
	text?: string;
}

export type MatrixCellRecord<ColumnKey extends string> = Readonly<
	Record<ColumnKey, Readonly<MatrixCellView>>
>;

export type MatrixCellSnapshotRecord<ColumnKey extends string> = Readonly<
	Record<ColumnKey, Readonly<MatrixCellView>>
>;

export type MatrixRowView<
	ColumnKey extends string,
	Row extends MatrixRowSpec = MatrixRowSpec,
> = Readonly<Row> & { readonly cells: MatrixCellRecord<ColumnKey> };

export type MatrixRowSnapshot<
	ColumnKey extends string,
	Row extends MatrixRowSpec = MatrixRowSpec,
> = Readonly<Row> & { readonly cells: MatrixCellSnapshotRecord<ColumnKey> };

export interface MatrixProgressState<ColumnKey extends string, Row extends MatrixRowSpec> {
	readonly title: string;
	readonly activeOperations: readonly Readonly<ActiveOperation>[];
	readonly rows: readonly MatrixRowView<ColumnKey, Row>[];
}

/**
 * A retainable full view of controller-owned progress state. Controller-owned collections and cell and
 * phase views are detached. Workflow-specific row extension values are immutable input data and are not
 * recursively cloned.
 */
export interface MatrixProgressSnapshot<ColumnKey extends string, Row extends MatrixRowSpec> {
	readonly title: string;
	readonly activeOperations: readonly Readonly<ActiveOperation>[];
	readonly phases: readonly PhaseView[];
	readonly rows: readonly MatrixRowSnapshot<ColumnKey, Row>[];
}

/** Requested controller intent. Accepted intent is reduced to a concrete MatrixProgressChange. */
export type MatrixProgressAction<ColumnKey extends string, Row extends MatrixRowSpec> =
	| { kind: "title-changed"; title: string }
	| { kind: "rows-replaced"; rows: readonly Row[] }
	| { kind: "row-patched"; rowKey: string; patch: Partial<Omit<Row, "rowKey">> }
	| { kind: "active-operations-changed"; operations: readonly Readonly<ActiveOperation>[] }
	| { kind: "cell-changed"; rowKey: string; column: ColumnKey; update: MatrixCellUpdate }
	| {
			kind: "cells-in-state-changed";
			column: ColumnKey;
			fromState: MatrixCellState;
			update: MatrixCellUpdate;
	  }
	| { kind: "all-cells-changed"; column: ColumnKey; update: MatrixCellUpdate }
	| {
			kind: "all-other-cells-changed";
			column: ColumnKey;
			excludedRowKey: string;
			update: MatrixCellUpdate;
	  }
	| { kind: "phase-event"; event: NsProgressPhaseEvent }
	| { kind: "note"; text: string };

/** Concrete accepted effect delivered to adapters. Payload collections are controller-owned copies. */
export type MatrixProgressChange<ColumnKey extends string, Row extends MatrixRowSpec> =
	| { kind: "title-changed"; title: string }
	| { kind: "rows-replaced"; rows: readonly Row[] }
	| { kind: "row-patched"; rowKey: string; patch: Partial<Omit<Row, "rowKey">> }
	| { kind: "active-operations-changed"; operations: readonly Readonly<ActiveOperation>[] }
	| { kind: "cell-changed"; rowKey: string; column: ColumnKey; update: MatrixCellUpdate }
	| {
			kind: "cells-changed";
			scope: "selected" | "all" | "all-other";
			column: ColumnKey;
			rowKeys: readonly string[];
			update: MatrixCellUpdate;
	  }
	| { kind: "phase-event"; event: NsProgressPhaseEvent }
	| { kind: "note"; text: string };

export type MatrixProgressReduction<ColumnKey extends string, Row extends MatrixRowSpec> =
	| { type: "unchanged" }
	| {
			type: "changed";
			state: MatrixProgressState<ColumnKey, Row>;
			change: MatrixProgressChange<ColumnKey, Row>;
	  };

export function createMatrixProgressState<
	ColumnKey extends string,
	Row extends MatrixRowSpec,
>(options: {
	title: string;
	rows: readonly Row[];
	columns: readonly MatrixColumnSpec<ColumnKey>[];
}): MatrixProgressState<ColumnKey, Row> {
	return {
		title: options.title,
		activeOperations: [],
		rows: createMatrixRowViews(options.rows, options.columns),
	};
}

export function snapshotMatrixProgress<ColumnKey extends string, Row extends MatrixRowSpec>(
	state: MatrixProgressState<ColumnKey, Row>,
	phases: readonly PhaseView[] = [],
): MatrixProgressSnapshot<ColumnKey, Row> {
	return {
		title: state.title,
		activeOperations: state.activeOperations.map((operation) => ({ ...operation })),
		phases: phases.map(copyPhaseView),
		rows: state.rows.map((row) => ({
			...row,
			cells: Object.fromEntries(
				(Object.keys(row.cells) as ColumnKey[]).map((key) => [key, { ...row.cells[key] }]),
			) as MatrixCellSnapshotRecord<ColumnKey>,
		})),
	};
}

export function reduceMatrixProgress<ColumnKey extends string, Row extends MatrixRowSpec>(options: {
	state: MatrixProgressState<ColumnKey, Row>;
	columns: readonly MatrixColumnSpec<ColumnKey>[];
	action: MatrixProgressAction<ColumnKey, Row>;
}): MatrixProgressReduction<ColumnKey, Row> {
	const { state, action } = options;
	switch (action.kind) {
		case "title-changed":
			return changed(
				{ ...state, title: action.title },
				{ kind: "title-changed", title: action.title },
			);
		case "rows-replaced": {
			const rows = action.rows.map((row) => ({ ...row }));
			return changed(
				{ ...state, rows: createMatrixRowViews(rows, options.columns) },
				{ kind: "rows-replaced", rows },
			);
		}
		case "row-patched": {
			const index = state.rows.findIndex((row) => row.rowKey === action.rowKey);
			const row = state.rows[index];
			if (row === undefined) return { type: "unchanged" };
			const patch = { ...action.patch };
			return changed(
				{ ...state, rows: replaceAt(state.rows, index, { ...row, ...patch }) },
				{ kind: "row-patched", rowKey: action.rowKey, patch },
			);
		}
		case "active-operations-changed": {
			const operations = action.operations.map((operation) => ({ ...operation }));
			return changed(
				{
					...state,
					activeOperations: operations.map((operation) => ({ ...operation })),
				},
				{ kind: "active-operations-changed", operations },
			);
		}
		case "cell-changed": {
			const index = state.rows.findIndex((row) => row.rowKey === action.rowKey);
			const row = state.rows[index];
			if (row === undefined) return { type: "unchanged" };
			const update = { ...action.update };
			const nextRow = {
				...row,
				cells: { ...row.cells, [action.column]: matrixCellFromUpdate(update) },
			};
			return changed(
				{ ...state, rows: replaceAt(state.rows, index, nextRow) },
				{
					kind: "cell-changed",
					rowKey: action.rowKey,
					column: action.column,
					update,
				},
			);
		}
		case "cells-in-state-changed":
			return changeCells({
				state,
				selection: { scope: "selected", fromState: action.fromState },
				column: action.column,
				requestedUpdate: action.update,
			});
		case "all-cells-changed":
			return changeCells({
				state,
				selection: { scope: "all" },
				column: action.column,
				requestedUpdate: action.update,
			});
		case "all-other-cells-changed":
			return changeCells({
				state,
				selection: { scope: "all-other", excludedRowKey: action.excludedRowKey },
				column: action.column,
				requestedUpdate: action.update,
			});
		case "phase-event":
			return changed(state, { kind: "phase-event", event: copyPhaseEvent(action.event) });
		case "note":
			return changed(state, { kind: "note", text: action.text });
	}
}

export function collectActiveCellChanges<ColumnKey extends string, Row extends MatrixRowSpec>(
	state: MatrixProgressState<ColumnKey, Row>,
	columns: readonly MatrixColumnSpec<ColumnKey>[],
	target: "done" | "failed",
): readonly MatrixProgressAction<ColumnKey, Row>[] {
	return state.rows.flatMap((row) =>
		columns.flatMap((column) => {
			const cell = row.cells[column.key];
			if (cell.state !== "active") return [];
			return [
				{
					kind: "cell-changed" as const,
					rowKey: row.rowKey,
					column: column.key,
					update: {
						state: target,
						...(cell.text === undefined ? {} : { text: cell.text }),
					},
				},
			];
		}),
	);
}

type CellSelection =
	| { scope: "selected"; fromState: MatrixCellState }
	| { scope: "all" }
	| { scope: "all-other"; excludedRowKey: string };

function changeCells<ColumnKey extends string, Row extends MatrixRowSpec>(options: {
	state: MatrixProgressState<ColumnKey, Row>;
	selection: CellSelection;
	column: ColumnKey;
	requestedUpdate: MatrixCellUpdate;
}): MatrixProgressReduction<ColumnKey, Row> {
	const rowKeys = options.state.rows
		.filter((row) => isSelectedCellRow(row, options.selection, options.column))
		.map((row) => row.rowKey);
	if (rowKeys.length === 0) return { type: "unchanged" };
	const selectedRowKeys = new Set(rowKeys);
	const update = { ...options.requestedUpdate };
	const rows = options.state.rows.map((row) =>
		selectedRowKeys.has(row.rowKey)
			? {
					...row,
					cells: { ...row.cells, [options.column]: matrixCellFromUpdate(update) },
				}
			: row,
	);
	return changed(
		{ ...options.state, rows },
		{
			kind: "cells-changed",
			scope: options.selection.scope,
			column: options.column,
			rowKeys,
			update,
		},
	);
}

function isSelectedCellRow<ColumnKey extends string, Row extends MatrixRowSpec>(
	row: MatrixRowView<ColumnKey, Row>,
	selection: CellSelection,
	column: ColumnKey,
): boolean {
	switch (selection.scope) {
		case "selected":
			return row.cells[column].state === selection.fromState;
		case "all":
			return true;
		case "all-other":
			return row.rowKey !== selection.excludedRowKey;
	}
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

function replaceAt<T>(items: readonly T[], index: number, item: T): T[] {
	return items.map((current, currentIndex) => (currentIndex === index ? item : current));
}

function changed<ColumnKey extends string, Row extends MatrixRowSpec>(
	state: MatrixProgressState<ColumnKey, Row>,
	change: MatrixProgressChange<ColumnKey, Row>,
): MatrixProgressReduction<ColumnKey, Row> {
	return { type: "changed", state, change };
}

function copyPhaseEvent(event: NsProgressPhaseEvent): NsProgressPhaseEvent {
	switch (event.type) {
		case "phases-declared":
			return { ...event, phases: event.phases.map(copyPhaseInfo) };
		case "matrix-declared":
			return { ...event, columns: event.columns.map((column) => ({ ...column })) };
		case "matrix-rows":
			return { ...event, rows: event.rows.map((row) => ({ ...row })) };
		case "matrix-active-operations":
			return { ...event, operations: event.operations.map((operation) => ({ ...operation })) };
		case "title-changed":
		case "phase-started":
		case "phase-progress":
		case "phase-done":
		case "phase-failed":
		case "matrix-cell":
			return { ...event };
	}
}

function copyPhaseInfo(info: NsProgressPhaseInfo): NsProgressPhaseInfo {
	return {
		...info,
		...(info.substeps === undefined ? {} : { substeps: info.substeps.map(copyPhaseInfo) }),
	};
}

function matrixCellFromUpdate(update: MatrixCellUpdate): MatrixCellView {
	return { state: update.state, ...(update.text === undefined ? {} : { text: update.text }) };
}

function copyPhaseView(view: PhaseView): PhaseView {
	return {
		key: view.key,
		item: { ...view.item },
		state: view.state,
		label: view.label,
		history: [...view.history],
		substeps: view.substeps.map(copyPhaseView),
	};
}
