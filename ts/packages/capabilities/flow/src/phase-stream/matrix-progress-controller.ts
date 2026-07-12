import type { NsProgressPhaseEvent } from "@nseng-ai/sdk";

import {
	collectActiveCellChanges,
	createMatrixProgressState,
	reduceMatrixProgress,
	snapshotMatrixProgress,
	type MatrixColumnSpec,
	type MatrixProgressAction,
	type MatrixProgressChange,
	type MatrixProgressSnapshot,
	type MatrixProgressState,
	type MatrixRowSpec,
} from "./matrix-progress-state.ts";
import { createPhaseStateStore, type PhaseView } from "./phase-stream-state.ts";
import type { PhaseSpec } from "./phase-stream-specs.ts";

export interface MatrixProgressController<
	ColumnKey extends string,
	Row extends MatrixRowSpec = MatrixRowSpec,
> {
	begin(): void;
	dispatch(action: MatrixProgressAction<ColumnKey, Row>): void;
	getRows(): readonly Readonly<Row>[];
	finish(options?: { isFailed?: boolean; finalLines?: readonly string[] }): Promise<void>;
	stop(): Promise<void>;
}

export type MatrixProgressLifecycle = "idle" | "active" | "finishing" | "finished" | "stopped";
export type MatrixProgressSnapshotAccessor<
	ColumnKey extends string,
	Row extends MatrixRowSpec,
> = () => MatrixProgressSnapshot<ColumnKey, Row>;

export interface MatrixProgressAdapter<ColumnKey extends string, Row extends MatrixRowSpec> {
	begin(options: {
		snapshot: MatrixProgressSnapshot<ColumnKey, Row>;
		initiatingChange?: MatrixProgressChange<ColumnKey, Row>;
	}): void;
	/** The accessor is synchronous, lazy, and memoized once for this delivery. Snapshots may be retained. */
	observe(
		change: MatrixProgressChange<ColumnKey, Row>,
		getSnapshot: MatrixProgressSnapshotAccessor<ColumnKey, Row>,
	): void;
	beforeFinish(): Promise<void>;
	finish(options: {
		target: "done" | "failed";
		finalLines: readonly string[];
		snapshot: MatrixProgressSnapshot<ColumnKey, Row>;
	}): Promise<void>;
	stop(): Promise<void>;
}

export function composeMatrixProgressAdapters<ColumnKey extends string, Row extends MatrixRowSpec>(
	adapters: readonly MatrixProgressAdapter<ColumnKey, Row>[],
): MatrixProgressAdapter<ColumnKey, Row> {
	return {
		begin: (options) => {
			for (const adapter of adapters) adapter.begin(options);
		},
		observe: (change, getSnapshot) => {
			for (const adapter of adapters) adapter.observe(change, getSnapshot);
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
> {
	title: string;
	rows: readonly Row[];
	columns: readonly MatrixColumnSpec<ColumnKey>[];
	phases: readonly PhaseSpec[];
	begin?: "immediate" | "lazy";
	createSnapshot?(
		state: MatrixProgressState<ColumnKey, Row>,
		phases: readonly PhaseView[],
	): MatrixProgressSnapshot<ColumnKey, Row>;
	adapter: MatrixProgressAdapter<ColumnKey, Row>;
}

export function createMatrixProgressControllerCore<
	ColumnKey extends string,
	Row extends MatrixRowSpec,
>(
	options: CreateMatrixProgressControllerCoreOptions<ColumnKey, Row>,
): MatrixProgressController<ColumnKey, Row> {
	const state = createMatrixProgressState(options);
	const phases = createPhaseStateStore(options.phases);
	let lifecycle: MatrixProgressLifecycle = "idle";
	let terminalPromise: Promise<void> | undefined;
	const adapter = options.adapter;

	function snapshot(): MatrixProgressSnapshot<ColumnKey, Row> {
		return (options.createSnapshot ?? snapshotMatrixProgress)(state, phases.views());
	}

	function begin(initiatingChange?: MatrixProgressChange<ColumnKey, Row>): void {
		if (lifecycle !== "idle") return;
		lifecycle = "active";
		adapter.begin({
			snapshot: snapshot(),
			...(initiatingChange === undefined ? {} : { initiatingChange }),
		});
	}

	function commit(action: MatrixProgressAction<ColumnKey, Row>, isFinishing = false): void {
		if (
			(!isFinishing && lifecycle === "finishing") ||
			lifecycle === "finished" ||
			lifecycle === "stopped"
		) {
			return;
		}
		const reduction = reduceMatrixProgress({ state, columns: options.columns, action });
		if (reduction.type === "unchanged") return;
		if (reduction.change.kind === "phase-event") phases.apply(reduction.change.event);
		if (
			lifecycle === "idle" &&
			options.begin === "lazy" &&
			shouldStartMatrixProgress(reduction.change)
		) {
			begin(reduction.change);
			return;
		}
		if (lifecycle === "idle") return;
		adapter.observe(reduction.change, memoizeSnapshot(snapshot));
	}

	function getRows(): readonly Readonly<Row>[] {
		return state.rows.map((row) => ({ ...row }));
	}

	function finish(
		finishOptions: { isFailed?: boolean; finalLines?: readonly string[] } = {},
	): Promise<void> {
		if (terminalPromise !== undefined) return terminalPromise;
		if (lifecycle === "idle" || lifecycle === "stopped") return Promise.resolve();
		lifecycle = "finishing";
		const target = finishOptions.isFailed === true ? "failed" : "done";
		for (const event of phaseSettlementEvents(phases.views(), target)) {
			commit({ kind: "phase-event", event }, true);
		}
		for (const action of collectActiveCellChanges(state, options.columns, target)) {
			commit(action, true);
		}
		if (state.activeOperations.length > 0) {
			commit({ kind: "active-operations-changed", operations: [] }, true);
		}
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
		begin: () => begin(),
		dispatch: commit,
		getRows,
		finish,
		stop,
	};
}

export function shouldStartMatrixProgress<ColumnKey extends string, Row extends MatrixRowSpec>(
	change: MatrixProgressChange<ColumnKey, Row>,
): boolean {
	switch (change.kind) {
		case "rows-replaced":
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

function memoizeSnapshot<ColumnKey extends string, Row extends MatrixRowSpec>(
	createSnapshot: MatrixProgressSnapshotAccessor<ColumnKey, Row>,
): MatrixProgressSnapshotAccessor<ColumnKey, Row> {
	let cached: MatrixProgressSnapshot<ColumnKey, Row> | undefined;
	return () => {
		cached ??= createSnapshot();
		return cached;
	};
}

function phaseSettlementEvents(
	views: readonly PhaseView[],
	target: "done" | "failed",
): readonly NsProgressPhaseEvent[] {
	if (target === "done") {
		if (views.some(hasFailedPhase)) return [];
		return views.flatMap((view) =>
			view.state === "pending" || view.state === "active"
				? [{ type: "phase-done" as const, phaseKey: view.key }]
				: [],
		);
	}
	for (const view of views) {
		const activeSubstep = view.substeps.find((substep) => substep.state === "active");
		if (activeSubstep !== undefined) {
			return [
				{
					type: "phase-failed",
					phaseKey: activeSubstep.key,
					detail: activeSubstep.label ?? "failed",
				},
			];
		}
		if (view.state === "active") {
			return [{ type: "phase-failed", phaseKey: view.key, detail: view.label ?? "failed" }];
		}
	}
	return [];
}

function hasFailedPhase(view: PhaseView): boolean {
	return view.state === "failed" || view.substeps.some(hasFailedPhase);
}

export type { MatrixProgressState };
