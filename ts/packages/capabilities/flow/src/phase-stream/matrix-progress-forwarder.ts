// Forwards matrix progress mutations as typed `matrix-*` NsProgressPhaseEvents on the host
// progress wire. Pure event emission: no rendering, no caps, no stream sink. Hosts with matrix
// rendering (the Pi live widget) consume the events; every other listener ignores them. The
// bulk mutators (`setAllCells` / `setAllOtherCells`) are not wire events — they expand into
// per-row `matrix-cell` events over the last declared row set.

import type { ActiveOperation, NsProgress, NsProgressPhaseEvent } from "@nseng-ai/kernel/sdk";

import type { MatrixCellUpdate, MatrixColumnSpec, MatrixRowSpec } from "./matrix-progress-core.ts";

export interface MatrixProgressForwarderOptions<ColumnKey extends string> {
	/** Live host progress sink; construct the forwarder only when `progress.isLive`. */
	progress: NsProgress;
	columns: readonly MatrixColumnSpec<ColumnKey>[];
	labelHeader?: string;
}

export interface MatrixProgressForwarder<ColumnKey extends string> {
	setRows(rows: readonly MatrixRowSpec[]): void;
	setActiveOperations(operations: readonly ActiveOperation[]): void;
	setCell(rowKey: string, column: ColumnKey, update: MatrixCellUpdate): void;
	setAllCells(column: ColumnKey, update: MatrixCellUpdate): void;
	setAllOtherCells(column: ColumnKey, rowKey: string, update: MatrixCellUpdate): void;
}

export function createMatrixProgressForwarder<ColumnKey extends string>(
	options: MatrixProgressForwarderOptions<ColumnKey>,
): MatrixProgressForwarder<ColumnKey> {
	let hasDeclared = false;
	let rowKeys: readonly string[] = [];

	function emit(event: NsProgressPhaseEvent): void {
		options.progress.phase(event);
	}

	function setRows(rows: readonly MatrixRowSpec[]): void {
		if (!hasDeclared) {
			hasDeclared = true;
			emit({
				type: "matrix-declared",
				columns: options.columns.map((column) => ({
					key: column.key,
					label: column.label,
					width: column.width,
				})),
				...(options.labelHeader === undefined ? {} : { labelHeader: options.labelHeader }),
			});
		}
		rowKeys = rows.map((row) => row.rowKey);
		emit({
			type: "matrix-rows",
			rows: rows.map((row) => ({ rowKey: row.rowKey, label: row.label })),
		});
	}

	function setCell(rowKey: string, column: ColumnKey, update: MatrixCellUpdate): void {
		emit({
			type: "matrix-cell",
			rowKey,
			columnKey: column,
			state: update.state,
			...(update.text === undefined ? {} : { text: update.text }),
		});
	}

	return {
		setRows,
		setActiveOperations: (operations) => {
			emit({ type: "matrix-active-operations", operations: [...operations] });
		},
		setCell,
		setAllCells: (column, update) => {
			for (const rowKey of rowKeys) setCell(rowKey, column, update);
		},
		setAllOtherCells: (column, rowKey, update) => {
			for (const otherKey of rowKeys) {
				if (otherKey !== rowKey) setCell(otherKey, column, update);
			}
		},
	};
}
