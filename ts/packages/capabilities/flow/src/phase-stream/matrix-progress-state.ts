import type { ActiveOperation, NsProgressPhaseEvent } from "@nseng-ai/sdk";

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

export interface MatrixProgressState<
	ColumnKey extends string,
	Row extends MatrixRowSpec,
	GlobalKey extends string = never,
> {
	title: string;
	activeOperations: ActiveOperation[];
	globals: MatrixGlobalView<GlobalKey>[];
	rows: MatrixRowView<ColumnKey, Row>[];
}

export interface MatrixProgressSnapshot<
	ColumnKey extends string,
	Row extends MatrixRowSpec,
	GlobalKey extends string = never,
> {
	readonly title: string;
	readonly activeOperations: readonly Readonly<ActiveOperation>[];
	readonly globals: readonly Readonly<MatrixGlobalView<GlobalKey>>[];
	readonly rows: readonly MatrixRowSnapshot<ColumnKey, Row>[];
}

export type MatrixProgressMutation<
	ColumnKey extends string,
	Row extends MatrixRowSpec,
	GlobalKey extends string = never,
> =
	| { kind: "title-changed"; title: string }
	| { kind: "rows-replaced"; rows: readonly Row[] }
	| { kind: "row-patched"; rowKey: string; patch: Partial<Omit<Row, "rowKey">> }
	| { kind: "active-operations-changed"; operations: readonly ActiveOperation[] }
	| { kind: "global-changed"; globalKey: GlobalKey; update: MatrixCellUpdate }
	| {
			kind: "global-substep-changed";
			globalKey: GlobalKey;
			substepKey: string;
			update: MatrixCellUpdate;
	  }
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

export type MatrixProgressChange<
	ColumnKey extends string,
	Row extends MatrixRowSpec,
	GlobalKey extends string = never,
> = MatrixProgressMutation<ColumnKey, Row, GlobalKey>;

export type MatrixProgressReduction<
	ColumnKey extends string,
	Row extends MatrixRowSpec,
	GlobalKey extends string = never,
> =
	| { type: "unchanged" }
	| { type: "changed"; change: MatrixProgressChange<ColumnKey, Row, GlobalKey> };

export function createMatrixProgressState<
	ColumnKey extends string,
	Row extends MatrixRowSpec,
	GlobalKey extends string = never,
>(options: {
	title: string;
	rows: readonly Row[];
	columns: readonly MatrixColumnSpec<ColumnKey>[];
	globalRows?: readonly MatrixGlobalRowSpec<GlobalKey>[];
}): MatrixProgressState<ColumnKey, Row, GlobalKey> {
	return {
		title: options.title,
		activeOperations: [],
		globals: (options.globalRows ?? []).map((row) => ({
			...row,
			state: "pending",
			substeps: (row.substeps ?? []).map((substep) => ({ ...substep, state: "pending" })),
		})),
		rows: createMatrixRowViews(options.rows, options.columns),
	};
}

export function snapshotMatrixProgress<
	ColumnKey extends string,
	Row extends MatrixRowSpec,
	GlobalKey extends string = never,
>(
	state: MatrixProgressState<ColumnKey, Row, GlobalKey>,
): MatrixProgressSnapshot<ColumnKey, Row, GlobalKey> {
	return {
		title: state.title,
		activeOperations: state.activeOperations.map((operation) => ({ ...operation })),
		globals: state.globals.map((global) => ({
			...global,
			substeps: global.substeps.map((substep) => ({ ...substep })),
		})),
		rows: state.rows.map((row) => ({
			...row,
			cells: Object.fromEntries(
				(Object.keys(row.cells) as ColumnKey[]).map((key) => [key, { ...row.cells[key] }]),
			) as MatrixCellSnapshotRecord<ColumnKey>,
		})),
	};
}

export function reduceMatrixProgress<
	ColumnKey extends string,
	Row extends MatrixRowSpec,
	GlobalKey extends string = never,
>(options: {
	state: MatrixProgressState<ColumnKey, Row, GlobalKey>;
	columns: readonly MatrixColumnSpec<ColumnKey>[];
	mutation: MatrixProgressMutation<ColumnKey, Row, GlobalKey>;
}): MatrixProgressReduction<ColumnKey, Row, GlobalKey> {
	const { state, mutation } = options;
	switch (mutation.kind) {
		case "title-changed":
			state.title = mutation.title;
			return changed(mutation);
		case "rows-replaced":
			state.rows = createMatrixRowViews(mutation.rows, options.columns);
			return changed({ ...mutation, rows: mutation.rows.map((row) => ({ ...row })) });
		case "row-patched": {
			const index = state.rows.findIndex((row) => row.rowKey === mutation.rowKey);
			const row = state.rows[index];
			if (row === undefined) return { type: "unchanged" };
			state.rows[index] = { ...row, ...mutation.patch };
			return changed({ ...mutation, patch: { ...mutation.patch } });
		}
		case "active-operations-changed":
			state.activeOperations = [...mutation.operations];
			return changed({ ...mutation, operations: [...state.activeOperations] });
		case "global-changed": {
			const index = state.globals.findIndex((global) => global.key === mutation.globalKey);
			const global = state.globals[index];
			if (global === undefined) return { type: "unchanged" };
			state.globals[index] = { ...global, ...matrixCellFromUpdate(mutation.update) };
			return changed({ ...mutation, update: { ...mutation.update } });
		}
		case "global-substep-changed": {
			const global = state.globals.find((item) => item.key === mutation.globalKey);
			const index =
				global?.substeps.findIndex((substep) => substep.key === mutation.substepKey) ?? -1;
			const substep = global?.substeps[index];
			if (global === undefined || substep === undefined) return { type: "unchanged" };
			global.substeps[index] = { ...substep, ...matrixCellFromUpdate(mutation.update) };
			return changed({ ...mutation, update: { ...mutation.update } });
		}
		case "cell-changed": {
			const row = state.rows.find((item) => item.rowKey === mutation.rowKey);
			if (row === undefined) return { type: "unchanged" };
			row.cells[mutation.column] = matrixCellFromUpdate(mutation.update);
			return changed({ ...mutation, update: { ...mutation.update } });
		}
		case "cells-changed": {
			const requested = new Set(mutation.rowKeys);
			const affected = state.rows.filter((row) => requested.has(row.rowKey));
			if (affected.length === 0) return { type: "unchanged" };
			for (const row of affected)
				row.cells[mutation.column] = matrixCellFromUpdate(mutation.update);
			return changed({
				...mutation,
				rowKeys: affected.map((row) => row.rowKey),
				update: { ...mutation.update },
			});
		}
		case "phase-event":
			return changed({ ...mutation, event: { ...mutation.event } });
		case "note":
			return changed(mutation);
	}
}

export interface ActiveMatrixTransitions<ColumnKey extends string, GlobalKey extends string> {
	globals: readonly { globalKey: GlobalKey; text?: string }[];
	substeps: readonly { globalKey: GlobalKey; substepKey: string; text?: string }[];
	cells: readonly { rowKey: string; columnKey: ColumnKey; text?: string }[];
}

export function collectActiveMatrixTransitions<ColumnKey extends string, GlobalKey extends string>(
	state: MatrixProgressState<ColumnKey, MatrixRowSpec, GlobalKey>,
	columns: readonly MatrixColumnSpec<ColumnKey>[],
): ActiveMatrixTransitions<ColumnKey, GlobalKey> {
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

export function settleActiveMatrixProgress<ColumnKey extends string, GlobalKey extends string>(
	state: MatrixProgressState<ColumnKey, MatrixRowSpec, GlobalKey>,
	columns: readonly MatrixColumnSpec<ColumnKey>[],
	target: "done" | "failed",
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

function changed<ColumnKey extends string, Row extends MatrixRowSpec, GlobalKey extends string>(
	change: MatrixProgressChange<ColumnKey, Row, GlobalKey>,
): MatrixProgressReduction<ColumnKey, Row, GlobalKey> {
	return { type: "changed", change };
}

function matrixCellFromUpdate(update: MatrixCellUpdate): MatrixCellView {
	return { state: update.state, ...(update.text === undefined ? {} : { text: update.text }) };
}
