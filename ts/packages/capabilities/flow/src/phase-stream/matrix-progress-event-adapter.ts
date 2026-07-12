import type { NsProgress, NsProgressPhaseEvent } from "@nseng-ai/sdk";

import type {
	MatrixProgressAdapter,
	MatrixProgressSnapshotAccessor,
} from "./matrix-progress-controller.ts";
import type {
	MatrixCellUpdate,
	MatrixColumnSpec,
	MatrixProgressChange,
	MatrixProgressSnapshot,
	MatrixRowSpec,
} from "./matrix-progress-state.ts";
import { progressPhaseInfos, type PhaseSpec } from "./phase-stream-specs.ts";

export interface CreateMatrixEventAdapterOptions<ColumnKey extends string> {
	progress: NsProgress;
	columns: readonly MatrixColumnSpec<ColumnKey>[];
	phases: readonly PhaseSpec[];
	labelHeader?: string;
}

export function createMatrixEventAdapter<ColumnKey extends string, Row extends MatrixRowSpec>(
	options: CreateMatrixEventAdapterOptions<ColumnKey>,
): MatrixProgressAdapter<ColumnKey, Row> {
	function emit(event: NsProgressPhaseEvent): void {
		options.progress.phase(event);
	}

	function emitRows(snapshot: MatrixProgressSnapshot<ColumnKey, Row>): void {
		emit({
			type: "matrix-rows",
			rows: snapshot.rows.map((row) => ({ rowKey: row.rowKey, label: row.label })),
		});
	}

	function emitChange(
		change: MatrixProgressChange<ColumnKey, Row>,
		getSnapshot: MatrixProgressSnapshotAccessor<ColumnKey, Row>,
	): void {
		switch (change.kind) {
			case "title-changed":
				emit({ type: "title-changed", title: change.title });
				return;
			case "rows-replaced":
			case "row-patched":
				emitRows(getSnapshot());
				return;
			case "active-operations-changed":
				emit({ type: "matrix-active-operations", operations: [...change.operations] });
				return;
			case "cell-changed":
				emitMatrixCell(emit, change.rowKey, change.column, change.update);
				return;
			case "cells-changed":
				for (const rowKey of change.rowKeys) {
					emitMatrixCell(emit, rowKey, change.column, change.update);
				}
				return;
			case "phase-event":
				emit(change.event);
				return;
			case "note":
				return;
		}
	}

	return {
		begin: ({ snapshot, initiatingChange }) => {
			emit({
				type: "phases-declared",
				title: snapshot.title,
				phases: progressPhaseInfos(options.phases),
			});
			emit({
				type: "matrix-declared",
				columns: options.columns.map((column) => ({ ...column })),
				...(options.labelHeader === undefined ? {} : { labelHeader: options.labelHeader }),
			});
			if (snapshot.rows.length > 0) emitRows(snapshot);
			if (initiatingChange !== undefined && initiatingChange.kind !== "rows-replaced") {
				emitChange(initiatingChange, () => snapshot);
			}
		},
		observe: emitChange,
		beforeFinish: async () => {},
		finish: async () => {},
		stop: async () => {},
	};
}

function emitMatrixCell(
	emit: (event: NsProgressPhaseEvent) => void,
	rowKey: string,
	columnKey: string,
	update: MatrixCellUpdate,
): void {
	emit({
		type: "matrix-cell",
		rowKey,
		columnKey,
		state: update.state,
		...(update.text === undefined ? {} : { text: update.text }),
	});
}
