import type { NsProgress, NsProgressPhaseEvent, NsProgressPhaseInfo } from "@nseng-ai/sdk";

import type {
	MatrixProgressAdapter,
	MatrixProgressLifecycle,
} from "./matrix-progress-controller.ts";
import type {
	MatrixCellUpdate,
	MatrixColumnSpec,
	MatrixGlobalRowSpec,
	MatrixProgressSnapshot,
	MatrixRowSpec,
} from "./matrix-progress-state.ts";
import { progressPhaseInfos, type PhaseSpec } from "./phase-stream-specs.ts";

export interface CreateMatrixEventAdapterOptions<
	ColumnKey extends string,
	GlobalKey extends string,
> {
	progress: NsProgress;
	columns: readonly MatrixColumnSpec<ColumnKey>[];
	globalRows: readonly MatrixGlobalRowSpec<GlobalKey>[];
	phases: readonly PhaseSpec[];
	labelHeader?: string;
	isLazy: boolean;
	getLifecycle(): MatrixProgressLifecycle;
}

export function createMatrixEventAdapter<
	ColumnKey extends string,
	Row extends MatrixRowSpec,
	GlobalKey extends string,
>(
	options: CreateMatrixEventAdapterOptions<ColumnKey, GlobalKey>,
): MatrixProgressAdapter<ColumnKey, Row, GlobalKey> {
	let isAwaitingLazyBeginObservation = false;
	let hasDeclaredRowsOnLazyBegin = false;

	function emit(event: NsProgressPhaseEvent): void {
		options.progress.phase(event);
	}

	function emitRows(snapshot: MatrixProgressSnapshot<ColumnKey, Row, GlobalKey>): void {
		emit({
			type: "matrix-rows",
			rows: snapshot.rows.map((row) => ({ rowKey: row.rowKey, label: row.label })),
		});
	}

	return {
		begin: (snapshot) => {
			emit({
				type: "phases-declared",
				title: snapshot.title,
				phases: [...globalPhaseInfos(options.globalRows), ...progressPhaseInfos(options.phases)],
			});
			emit({
				type: "matrix-declared",
				columns: options.columns.map((column) => ({ ...column })),
				...(options.labelHeader === undefined ? {} : { labelHeader: options.labelHeader }),
			});
			if (snapshot.rows.length > 0) {
				emitRows(snapshot);
				hasDeclaredRowsOnLazyBegin = options.isLazy;
			}
			isAwaitingLazyBeginObservation = options.isLazy;
		},
		observe: (change, snapshot) => {
			if (options.getLifecycle() !== "active") return;
			const shouldSuppressInitialRows =
				isAwaitingLazyBeginObservation &&
				hasDeclaredRowsOnLazyBegin &&
				change.kind === "rows-replaced";
			isAwaitingLazyBeginObservation = false;
			hasDeclaredRowsOnLazyBegin = false;
			switch (change.kind) {
				case "title-changed":
					emit({ type: "title-changed", title: change.title });
					return;
				case "rows-replaced":
					if (!shouldSuppressInitialRows) emitRows(snapshot);
					return;
				case "row-patched":
					emitRows(snapshot);
					return;
				case "active-operations-changed":
					emit({ type: "matrix-active-operations", operations: [...change.operations] });
					return;
				case "global-changed":
					emit(globalPhaseEvent(change.globalKey, change.update));
					return;
				case "global-substep-changed":
					emit(globalPhaseEvent(change.substepKey, change.update));
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
		},
		beforeFinish: async () => {},
		finish: async ({ target, transitions }) => {
			for (const global of transitions.globals) {
				emit(globalPhaseEvent(global.globalKey, { state: target, ...optionalText(global.text) }));
			}
			for (const substep of transitions.substeps) {
				emit(
					globalPhaseEvent(substep.substepKey, { state: target, ...optionalText(substep.text) }),
				);
			}
			for (const cell of transitions.cells) {
				emit({ type: "matrix-cell", ...cell, state: target });
			}
		},
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

function globalPhaseEvent(
	key: string,
	update: Pick<MatrixCellUpdate, "state" | "text">,
): NsProgressPhaseEvent {
	switch (update.state) {
		case "active":
			return { type: "phase-started", phaseKey: key, ...optionalLabel(update.text) };
		case "failed":
			return { type: "phase-failed", phaseKey: key, detail: update.text ?? "failed" };
		case "done":
		case "skipped":
		case "pending":
			return { type: "phase-done", phaseKey: key, ...optionalDetail(update.text) };
	}
}

function globalPhaseInfos<GlobalKey extends string>(
	rows: readonly MatrixGlobalRowSpec<GlobalKey>[],
): readonly NsProgressPhaseInfo[] {
	return rows.map((row) => ({
		key: row.key,
		name: row.label,
		label: row.activeLabel,
		detail: row.detail,
		...(row.substeps === undefined
			? {}
			: {
					substeps: row.substeps.map((substep) => ({
						key: substep.key,
						name: substep.label,
						label: substep.activeLabel,
						detail: substep.detail,
					})),
				}),
	}));
}

function optionalText(text: string | undefined): { text?: string } {
	return text === undefined ? {} : { text };
}

function optionalLabel(label: string | undefined): { label?: string } {
	return label === undefined ? {} : { label };
}

function optionalDetail(detail: string | undefined): { detail?: string } {
	return detail === undefined ? {} : { detail };
}
