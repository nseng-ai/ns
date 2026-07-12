import type { ActiveOperation, NsProgressPhaseEvent } from "@nseng-ai/sdk";

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

export type MatrixCellRecord<ColumnKey extends string> = Record<ColumnKey, MatrixCellView>;

export type MatrixCellSnapshotRecord<ColumnKey extends string> = Readonly<
	Record<ColumnKey, Readonly<MatrixCellView>>
>;

export type MatrixRowView<
	ColumnKey extends string,
	Row extends MatrixRowSpec = MatrixRowSpec,
> = Row & { cells: MatrixCellRecord<ColumnKey> };

export type MatrixRowSnapshot<
	ColumnKey extends string,
	Row extends MatrixRowSpec = MatrixRowSpec,
> = Readonly<Row> & { readonly cells: MatrixCellSnapshotRecord<ColumnKey> };

export interface MatrixProgressState<ColumnKey extends string, Row extends MatrixRowSpec> {
	title: string;
	activeOperations: ActiveOperation[];
	rows: MatrixRowView<ColumnKey, Row>[];
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
	| { kind: "active-operations-changed"; operations: readonly ActiveOperation[] }
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

/** Concrete accepted effect delivered to adapters. Payload collections are controller-owned copies. */
export type MatrixProgressChange<ColumnKey extends string, Row extends MatrixRowSpec> =
	| { kind: "title-changed"; title: string }
	| { kind: "rows-replaced"; rows: readonly Row[] }
	| { kind: "row-patched"; rowKey: string; patch: Partial<Omit<Row, "rowKey">> }
	| { kind: "active-operations-changed"; operations: readonly ActiveOperation[] }
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
	| { type: "changed"; change: MatrixProgressChange<ColumnKey, Row> };

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
			state.title = action.title;
			return changed({ kind: "title-changed", title: action.title });
		case "rows-replaced": {
			const rows = action.rows.map((row) => ({ ...row }));
			state.rows = createMatrixRowViews(rows, options.columns);
			return changed({ kind: "rows-replaced", rows });
		}
		case "row-patched": {
			const index = state.rows.findIndex((row) => row.rowKey === action.rowKey);
			const row = state.rows[index];
			if (row === undefined) return { type: "unchanged" };
			const patch = { ...action.patch };
			state.rows[index] = { ...row, ...patch };
			return changed({ kind: "row-patched", rowKey: action.rowKey, patch });
		}
		case "active-operations-changed": {
			const operations = action.operations.map((operation) => ({ ...operation }));
			state.activeOperations = operations;
			return changed({ kind: "active-operations-changed", operations });
		}
		case "cell-changed": {
			const row = state.rows.find((item) => item.rowKey === action.rowKey);
			if (row === undefined) return { type: "unchanged" };
			const update = { ...action.update };
			row.cells[action.column] = matrixCellFromUpdate(update);
			return changed({
				kind: "cell-changed",
				rowKey: action.rowKey,
				column: action.column,
				update,
			});
		}
		case "cells-changed": {
			const requested = new Set(action.rowKeys);
			const affected = state.rows.filter((row) => requested.has(row.rowKey));
			if (affected.length === 0) return { type: "unchanged" };
			const update = { ...action.update };
			for (const row of affected) row.cells[action.column] = matrixCellFromUpdate(update);
			return changed({
				kind: "cells-changed",
				scope: action.scope,
				column: action.column,
				rowKeys: affected.map((row) => row.rowKey),
				update,
			});
		}
		case "phase-event":
			return changed({ kind: "phase-event", event: { ...action.event } });
		case "note":
			return changed({ kind: "note", text: action.text });
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

function changed<ColumnKey extends string, Row extends MatrixRowSpec>(
	change: MatrixProgressChange<ColumnKey, Row>,
): MatrixProgressReduction<ColumnKey, Row> {
	return { type: "changed", change };
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
