import type { ActiveOperation, NsProgressPhaseEvent } from "@nseng-ai/sdk";

import {
	collectActiveMatrixTransitions,
	createMatrixProgressState,
	reduceMatrixProgress,
	settleActiveMatrixProgress,
	snapshotMatrixProgress,
	type MatrixCellState,
	type MatrixCellUpdate,
	type MatrixColumnSpec,
	type MatrixProgressChange,
	type MatrixGlobalRowSpec,
	type MatrixProgressMutation,
	type MatrixProgressSnapshot,
	type MatrixProgressState,
	type MatrixRowSpec,
} from "./matrix-progress-state.ts";

export interface MatrixProgressSink<
	ColumnKey extends string,
	Row extends MatrixRowSpec = MatrixRowSpec,
	GlobalKey extends string = never,
> {
	setRows(rows: readonly Row[]): void;
	getRows(): readonly Readonly<Row>[];
	patchRow(rowKey: string, patch: Partial<Omit<Row, "rowKey">>): void;
	setActiveOperations(operations: readonly ActiveOperation[]): void;
	phase(event: NsProgressPhaseEvent): void;
	setGlobal(key: GlobalKey, update: MatrixCellUpdate): void;
	setGlobalSubstep(globalKey: GlobalKey, substepKey: string, update: MatrixCellUpdate): void;
	setCell(rowKey: string, column: ColumnKey, update: MatrixCellUpdate): void;
	setCellsInState(column: ColumnKey, fromState: MatrixCellState, update: MatrixCellUpdate): void;
	setAllCells(column: ColumnKey, update: MatrixCellUpdate): void;
	setAllOtherCells(column: ColumnKey, rowKey: string, update: MatrixCellUpdate): void;
}

export interface MatrixProgressController<
	ColumnKey extends string,
	Row extends MatrixRowSpec = MatrixRowSpec,
	GlobalKey extends string = never,
> extends MatrixProgressSink<ColumnKey, Row, GlobalKey> {
	begin(): void;
	setTitle(title: string): void;
	note(text: string): void;
	finish(options?: { isFailed?: boolean; finalLines?: readonly string[] }): Promise<void>;
	stop(): Promise<void>;
}

export type MatrixProgressLifecycle = "idle" | "active" | "finishing" | "finished" | "stopped";

export interface MatrixSettledTransitions<ColumnKey extends string, GlobalKey extends string> {
	globals: readonly { globalKey: GlobalKey; text?: string }[];
	substeps: readonly { globalKey: GlobalKey; substepKey: string; text?: string }[];
	cells: readonly { rowKey: string; columnKey: ColumnKey; text?: string }[];
}

export interface MatrixProgressAdapter<
	ColumnKey extends string,
	Row extends MatrixRowSpec,
	GlobalKey extends string = never,
> {
	begin(snapshot: MatrixProgressSnapshot<ColumnKey, Row, GlobalKey>): void;
	observe(
		change: MatrixProgressChange<ColumnKey, Row, GlobalKey>,
		snapshot: MatrixProgressSnapshot<ColumnKey, Row, GlobalKey>,
	): void;
	beforeFinish(): Promise<void>;
	finish(options: {
		target: "done" | "failed";
		transitions: MatrixSettledTransitions<ColumnKey, GlobalKey>;
		finalLines: readonly string[];
		snapshot: MatrixProgressSnapshot<ColumnKey, Row, GlobalKey>;
	}): Promise<void>;
	stop(): Promise<void>;
}

export function composeMatrixProgressAdapters<
	ColumnKey extends string,
	Row extends MatrixRowSpec,
	GlobalKey extends string = never,
>(
	adapters: readonly MatrixProgressAdapter<ColumnKey, Row, GlobalKey>[],
): MatrixProgressAdapter<ColumnKey, Row, GlobalKey> {
	return {
		begin: (snapshot) => {
			for (const adapter of adapters) adapter.begin(snapshot);
		},
		observe: (change, snapshot) => {
			for (const adapter of adapters) adapter.observe(change, snapshot);
		},
		beforeFinish: async () => {
			await Promise.all(adapters.map((adapter) => adapter.beforeFinish()));
		},
		finish: async (options) => {
			await Promise.all(adapters.map((adapter) => adapter.finish(options)));
		},
		stop: async () => {
			await Promise.all(adapters.map((adapter) => adapter.stop()));
		},
	};
}

export interface CreateMatrixProgressControllerCoreOptions<
	ColumnKey extends string,
	Row extends MatrixRowSpec,
	GlobalKey extends string = never,
> {
	title: string;
	rows: readonly Row[];
	columns: readonly MatrixColumnSpec<ColumnKey>[];
	globalRows?: readonly MatrixGlobalRowSpec<GlobalKey>[];
	begin?: "immediate" | "lazy";
	createAdapter(options: {
		getLifecycle(): MatrixProgressLifecycle;
	}): MatrixProgressAdapter<ColumnKey, Row, GlobalKey>;
}

export function createMatrixProgressControllerCore<
	ColumnKey extends string,
	Row extends MatrixRowSpec,
	GlobalKey extends string = never,
>(
	options: CreateMatrixProgressControllerCoreOptions<ColumnKey, Row, GlobalKey>,
): MatrixProgressController<ColumnKey, Row, GlobalKey> {
	const state = createMatrixProgressState(options);
	let lifecycle: MatrixProgressLifecycle = "idle";
	let terminalPromise: Promise<void> | undefined;
	const adapter = options.createAdapter({ getLifecycle: () => lifecycle });

	function snapshot(): MatrixProgressSnapshot<ColumnKey, Row, GlobalKey> {
		return snapshotMatrixProgress(state);
	}

	function begin(): void {
		if (lifecycle !== "idle") return;
		lifecycle = "active";
		adapter.begin(snapshot());
	}

	function mutate(mutation: MatrixProgressMutation<ColumnKey, Row, GlobalKey>): void {
		if (lifecycle === "finishing" || lifecycle === "finished" || lifecycle === "stopped") return;
		const reduction = reduceMatrixProgress({ state, columns: options.columns, mutation });
		if (reduction.type === "unchanged") return;
		if (options.begin === "lazy" && shouldStartMatrixProgress(reduction.change)) begin();
		adapter.observe(reduction.change, snapshot());
	}

	function setTitle(title: string): void {
		mutate({ kind: "title-changed", title });
	}

	function setRows(rows: readonly Row[]): void {
		mutate({ kind: "rows-replaced", rows: rows.map((row) => ({ ...row })) });
	}

	function getRows(): readonly Readonly<Row>[] {
		return state.rows.map((row) => ({ ...row }));
	}

	function patchRow(rowKey: string, patch: Partial<Omit<Row, "rowKey">>): void {
		mutate({ kind: "row-patched", rowKey, patch: { ...patch } });
	}

	function setActiveOperations(operations: readonly ActiveOperation[]): void {
		mutate({
			kind: "active-operations-changed",
			operations: operations.map((operation) => ({ ...operation })),
		});
	}

	function phase(event: NsProgressPhaseEvent): void {
		mutate({ kind: "phase-event", event: { ...event } });
	}

	function setGlobal(globalKey: GlobalKey, update: MatrixCellUpdate): void {
		mutate({ kind: "global-changed", globalKey, update: { ...update } });
	}

	function setGlobalSubstep(
		globalKey: GlobalKey,
		substepKey: string,
		update: MatrixCellUpdate,
	): void {
		mutate({ kind: "global-substep-changed", globalKey, substepKey, update: { ...update } });
	}

	function setCell(rowKey: string, column: ColumnKey, update: MatrixCellUpdate): void {
		mutate({ kind: "cell-changed", rowKey, column, update: { ...update } });
	}

	function setCellsInState(
		column: ColumnKey,
		fromState: MatrixCellState,
		update: MatrixCellUpdate,
	): void {
		mutate({
			kind: "cells-changed",
			scope: "selected",
			column,
			rowKeys: state.rows
				.filter((row) => row.cells[column].state === fromState)
				.map((row) => row.rowKey),
			update: { ...update },
		});
	}

	function setAllCells(column: ColumnKey, update: MatrixCellUpdate): void {
		mutate({
			kind: "cells-changed",
			scope: "all",
			column,
			rowKeys: state.rows.map((row) => row.rowKey),
			update: { ...update },
		});
	}

	function setAllOtherCells(column: ColumnKey, rowKey: string, update: MatrixCellUpdate): void {
		mutate({
			kind: "cells-changed",
			scope: "all-other",
			column,
			rowKeys: state.rows.filter((row) => row.rowKey !== rowKey).map((row) => row.rowKey),
			update: { ...update },
		});
	}

	function note(text: string): void {
		mutate({ kind: "note", text });
	}

	function finish(
		finishOptions: { isFailed?: boolean; finalLines?: readonly string[] } = {},
	): Promise<void> {
		if (terminalPromise !== undefined) return terminalPromise;
		if (lifecycle === "idle" || lifecycle === "stopped") return Promise.resolve();
		lifecycle = "finishing";
		const target = finishOptions.isFailed === true ? "failed" : "done";
		const transitions = collectActiveMatrixTransitions(state, options.columns);
		settleActiveMatrixProgress(state, options.columns, target);
		state.activeOperations = [];
		terminalPromise = Promise.resolve().then(async () => {
			let beforeFinishError: unknown;
			try {
				await adapter.beforeFinish();
			} catch (error) {
				beforeFinishError = error;
			}
			try {
				await adapter.finish({
					target,
					transitions,
					finalLines: [...(finishOptions.finalLines ?? [])],
					snapshot: snapshot(),
				});
				if (beforeFinishError !== undefined) throw beforeFinishError;
			} finally {
				lifecycle = "finished";
			}
		});
		return terminalPromise;
	}

	function stop(): Promise<void> {
		if (lifecycle === "finishing") return terminalPromise ?? Promise.resolve();
		if (terminalPromise !== undefined) return terminalPromise;
		if (lifecycle === "finished") return Promise.resolve();
		lifecycle = "stopped";
		terminalPromise = Promise.resolve().then(() => adapter.stop());
		return terminalPromise;
	}

	if (options.begin !== "lazy") begin();

	return {
		begin,
		setTitle,
		setRows,
		getRows,
		patchRow,
		setActiveOperations,
		phase,
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

export function shouldStartMatrixProgress<
	ColumnKey extends string,
	Row extends MatrixRowSpec,
	GlobalKey extends string = never,
>(change: MatrixProgressChange<ColumnKey, Row, GlobalKey>): boolean {
	switch (change.kind) {
		case "rows-replaced":
		case "global-changed":
		case "global-substep-changed":
		case "cell-changed":
			return true;
		case "cells-changed":
			return change.scope !== "selected" && change.rowKeys.length > 0;
		case "phase-event":
			return (
				change.event.type === "phase-started" ||
				change.event.type === "phase-progress" ||
				change.event.type === "phase-done" ||
				change.event.type === "phase-failed"
			);
		case "title-changed":
		case "row-patched":
		case "active-operations-changed":
		case "note":
			return false;
	}
}

export type { MatrixProgressState };
