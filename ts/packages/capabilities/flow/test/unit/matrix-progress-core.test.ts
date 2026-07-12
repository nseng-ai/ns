import { describe, expect, test } from "vitest";

import type { Caps } from "@nseng-ai/clinkr";
import { stripAnsi } from "@nseng-ai/clinkr/testing";
import { createManualClock } from "@nseng-ai/foundation/time/testing";
import type { ActiveOperation, NsProgressPhaseEvent } from "@nseng-ai/sdk";
import {
	commandOperations,
	defineMatrixWorkflow,
	matrixFrameOptionalFields,
	modelOperation,
	withActiveOperations,
	withCommandOperations,
} from "../../src/phase-stream/matrix-progress-core.ts";
import {
	createMatrixProgressState,
	reduceMatrixProgress,
	snapshotMatrixProgress,
	type MatrixProgressAction,
	type MatrixProgressState,
	type MatrixRowSpec,
} from "../../src/phase-stream/matrix-progress-state.ts";
import { streamCapture } from "./stream-test-helpers.ts";

function caps(parts: Partial<Caps> = {}): Caps {
	return {
		isTty: true,
		colorDepth: "none",
		columns: 96,
		canRenderUnicode: true,
		...parts,
	};
}

const TEST_COLUMNS = [{ key: "metadata" as const, label: "Metadata", width: 8 }];

const testWorkflow = defineMatrixWorkflow({
	columns: TEST_COLUMNS,
	phases: [
		{
			key: "hooks",
			item: { name: "Hooks", detail: "hooks complete", label: "running pre-submit hooks…" },
		},
		{
			key: "checkpoint",
			item: {
				name: "Checkpoint",
				detail: "checkpoint complete",
				label: "checkpointing pending changes…",
			},
			substeps: [
				{
					key: "inspect",
					item: { name: "Inspect", detail: "worktree inspected", label: "inspecting worktree…" },
				},
			],
		},
	],
	rowKey: (row: { label: string }) => row.label,
});

function createController(options: { capsParts?: Partial<Caps>; clockNowMs?: number }): {
	controller: ReturnType<typeof testWorkflow.createController>;
	capture: ReturnType<typeof streamCapture>;
	clock: ReturnType<typeof createManualClock>;
} {
	const capture = streamCapture({ sleep: "pending" });
	const clock = createManualClock(options.clockNowMs ?? 0);
	const controller = testWorkflow.createController({
		presentation: {
			kind: "terminal",
			caps: caps(options.capsParts ?? {}),
			deps: capture.deps,
			clock: clock.clock,
		},
		title: "ns flow submit",
		rows: [{ label: "feature/a" }],
	});
	return { controller, capture, clock };
}

function lastFrame(capture: ReturnType<typeof streamCapture>): string {
	return stripAnsi(capture.redraws.at(-1) ?? "");
}

function frameLine(frame: string, needle: string): string {
	const line = frame.split("\n").find((item) => item.includes(needle));
	if (line === undefined) throw new Error(`missing frame line containing ${needle}`);
	return line;
}

describe("matrix progress core", () => {
	test("projects only defined optional frame fields from a wider runtime object", () => {
		const widerInput = {
			activeOperations: [{ kind: "command" as const, display: "just" }],
			tailLine: "tests passing",
			tailSinceOutputMs: 125,
			tick: 3,
			rows: ["unkeyed row"],
			title: "must not pass through",
			isSentinel: true,
		};

		expect(matrixFrameOptionalFields(widerInput)).toEqual({
			activeOperations: [{ kind: "command", display: "just" }],
			tailLine: "tests passing",
			tailSinceOutputMs: 125,
			tick: 3,
		});
		const omitted = matrixFrameOptionalFields({});
		expect(Object.hasOwn(omitted, "activeOperations")).toBe(false);
		expect(Object.hasOwn(omitted, "tailLine")).toBe(false);
		expect(Object.hasOwn(omitted, "tailSinceOutputMs")).toBe(false);
		expect(Object.hasOwn(omitted, "tick")).toBe(false);
	});

	test("reduces actions to detached committed changes and snapshots", () => {
		const columns = [{ key: "metadata" as const, label: "Metadata", width: 8 }];
		const inputRows = [{ rowKey: "feature/a", label: "feature/a" }];
		const initialState = createMatrixProgressState({
			title: "Workflow",
			rows: inputRows,
			columns,
		});
		const operations: ActiveOperation[] = [{ kind: "command", display: "just" }];

		const reduction = reduceMatrixProgress({
			state: initialState,
			columns,
			action: { kind: "active-operations-changed", operations },
		});
		operations[0] = { kind: "command", display: "mutated" };
		operations.length = 0;
		if (reduction.type !== "changed") throw new Error("expected committed change");
		expect(reduction.change).toEqual({
			kind: "active-operations-changed",
			operations: [{ kind: "command", display: "just" }],
		});
		if (reduction.change.kind !== "active-operations-changed") {
			throw new Error("expected active operations change");
		}
		expect(reduction.state.activeOperations[0]).not.toBe(reduction.change.operations[0]);
		expect(initialState.activeOperations).toEqual([]);
		let state = reduction.state;
		inputRows[0] = { rowKey: "mutated", label: "mutated" };
		expect(snapshotMatrixProgress(state).activeOperations).toEqual([
			{ kind: "command", display: "just" },
		]);
		expect(snapshotMatrixProgress(state).rows[0]?.rowKey).toBe("feature/a");
		const retained = snapshotMatrixProgress(state);
		const cellReduction = reduceMatrixProgress({
			state,
			columns,
			action: {
				kind: "cell-changed",
				rowKey: "feature/a",
				column: "metadata",
				update: { state: "done", text: "new" },
			},
		});
		if (cellReduction.type !== "changed") throw new Error("expected committed cell change");
		state = cellReduction.state;
		expect(retained.rows[0]?.cells.metadata).toEqual({ state: "pending" });
		expect(snapshotMatrixProgress(state).rows[0]?.cells.metadata).toEqual({
			state: "done",
			text: "new",
		});

		const repeat = reduceMatrixProgress({
			state,
			columns,
			action: {
				kind: "active-operations-changed",
				operations: [{ kind: "command", display: "just" }],
			},
		});
		expect(repeat.type).toBe("changed");
	});

	test("detaches collection-bearing phase events from action payloads", () => {
		const columns = [{ key: "metadata" as const, label: "Metadata", width: 8 }];
		const state = createMatrixProgressState({ title: "Workflow", rows: [], columns });

		function acceptedEvent(event: NsProgressPhaseEvent): NsProgressPhaseEvent {
			const reduction = reduceMatrixProgress({
				state,
				columns,
				action: { kind: "phase-event", event },
			});
			if (reduction.type !== "changed" || reduction.change.kind !== "phase-event") {
				throw new Error("expected accepted phase event");
			}
			return reduction.change.event;
		}

		const phases = [
			{
				key: "prepare",
				name: "Prepare",
				substeps: [{ key: "inspect", name: "Inspect" }],
			},
		];
		const declared = acceptedEvent({ type: "phases-declared", title: "Workflow", phases });
		phases[0]!.name = "mutated";
		phases[0]!.substeps[0]!.name = "mutated";
		expect(declared).toEqual({
			type: "phases-declared",
			title: "Workflow",
			phases: [
				{
					key: "prepare",
					name: "Prepare",
					substeps: [{ key: "inspect", name: "Inspect" }],
				},
			],
		});

		const matrixColumns = [{ key: "metadata", label: "Metadata", width: 8 }];
		const matrixDeclared = acceptedEvent({ type: "matrix-declared", columns: matrixColumns });
		matrixColumns[0]!.label = "mutated";
		expect(matrixDeclared).toEqual({
			type: "matrix-declared",
			columns: [{ key: "metadata", label: "Metadata", width: 8 }],
		});

		const rows = [{ rowKey: "feature/a", label: "feature/a" }];
		const rowsDeclared = acceptedEvent({ type: "matrix-rows", rows });
		rows[0]!.label = "mutated";
		expect(rowsDeclared).toEqual({
			type: "matrix-rows",
			rows: [{ rowKey: "feature/a", label: "feature/a" }],
		});

		const operations: ActiveOperation[] = [{ kind: "command", display: "just" }];
		const operationsDeclared = acceptedEvent({
			type: "matrix-active-operations",
			operations,
		});
		operations[0] = { kind: "command", display: "mutated" };
		expect(operationsDeclared).toEqual({
			type: "matrix-active-operations",
			operations: [{ kind: "command", display: "just" }],
		});
	});

	test("does not mutate prior state, rows, or cells across matrix reductions", () => {
		type Row = MatrixRowSpec & { detail: string };
		const columns = [{ key: "metadata" as const, label: "Metadata", width: 8 }];
		const createState = (): MatrixProgressState<"metadata", Row> =>
			createMatrixProgressState({
				title: "Workflow",
				rows: [
					{ rowKey: "feature/a", label: "feature/a", detail: "a" },
					{ rowKey: "feature/b", label: "feature/b", detail: "b" },
				],
				columns,
			});

		function applyPurely(
			state: MatrixProgressState<"metadata", Row>,
			action: MatrixProgressAction<"metadata", Row>,
		): MatrixProgressState<"metadata", Row> {
			const rows = state.rows;
			const cells = rows.map((row) => row.cells);
			const before = snapshotMatrixProgress(state);
			const reduction = reduceMatrixProgress({ state, columns, action });
			if (reduction.type !== "changed") throw new Error(`expected ${action.kind} to change state`);
			expect(reduction.state).not.toBe(state);
			expect(state.rows).toBe(rows);
			expect(rows.map((row) => row.cells)).toEqual(cells);
			for (const [index, row] of rows.entries()) expect(row.cells).toBe(cells[index]);
			expect(snapshotMatrixProgress(state)).toEqual(before);
			return reduction.state;
		}

		applyPurely(createState(), { kind: "title-changed", title: "Next" });
		applyPurely(createState(), {
			kind: "row-patched",
			rowKey: "feature/a",
			patch: { detail: "patched" },
		});
		applyPurely(createState(), {
			kind: "cell-changed",
			rowKey: "feature/a",
			column: "metadata",
			update: { state: "active" },
		});
		const stateWithActiveCell = applyPurely(createState(), {
			kind: "cell-changed",
			rowKey: "feature/a",
			column: "metadata",
			update: { state: "active" },
		});
		applyPurely(stateWithActiveCell, {
			kind: "cells-in-state-changed",
			column: "metadata",
			fromState: "active",
			update: { state: "done" },
		});
		applyPurely(createState(), {
			kind: "all-cells-changed",
			column: "metadata",
			update: { state: "done" },
		});
		applyPurely(createState(), {
			kind: "all-other-cells-changed",
			column: "metadata",
			excludedRowKey: "feature/a",
			update: { state: "skipped" },
		});
	});

	test.each([
		{
			name: "missing row patch",
			action: { kind: "row-patched", rowKey: "missing", patch: { label: "x" } } as const,
		},
		{
			name: "missing cell",
			action: {
				kind: "cell-changed",
				rowKey: "missing",
				column: "metadata",
				update: { state: "done" },
			} as const,
		},
		{
			name: "empty bulk",
			action: {
				kind: "cells-in-state-changed",
				column: "metadata",
				fromState: "done",
				update: { state: "done" },
			} as const,
		},
	])("returns unchanged for $name", ({ action }) => {
		const columns = [{ key: "metadata" as const, label: "Metadata", width: 8 }];
		const state = createMatrixProgressState({
			title: "Workflow",
			rows: [{ rowKey: "feature/a", label: "feature/a" }],
			columns,
		});
		expect(reduceMatrixProgress({ state, columns, action })).toEqual({ type: "unchanged" });
	});

	test("constructs model operations without an undefined detail", () => {
		expect(modelOperation("generating metadata", "openai/gpt-test")).toEqual({
			kind: "model",
			operation: "generating metadata",
			modelRef: "openai/gpt-test",
		});
		expect(modelOperation("generating metadata", "openai/gpt-test", "branch 1/2")).toEqual({
			kind: "model",
			operation: "generating metadata",
			modelRef: "openai/gpt-test",
			detail: "branch 1/2",
		});
	});

	test("clears command operations when the wrapped work rejects", async () => {
		const operations: string[][] = [];
		const sink = {
			setActiveOperations: (active: readonly ActiveOperation[]) => {
				operations.push(
					active.map((operation) =>
						operation.kind === "command" ? operation.display : operation.operation,
					),
				);
			},
		};

		await expect(
			withCommandOperations(sink, ["gt submit --dry-run"], async () => {
				throw new Error("submit failed");
			}),
		).rejects.toThrow("submit failed");
		expect(operations).toEqual([["gt submit --dry-run"], []]);
	});

	test("clears arbitrary active operations when the wrapped work rejects", async () => {
		const snapshots: ActiveOperation[][] = [];
		const operation = modelOperation("generating PR description", "openai/gpt-test");

		await expect(
			withActiveOperations(
				(operations) => snapshots.push([...operations]),
				[operation],
				async () => {
					throw new Error("generation failed");
				},
			),
		).rejects.toThrow("generation failed");
		expect(snapshots).toEqual([[operation], []]);
	});

	test("renders active operations on a dedicated line while rows keep their own labels", () => {
		const { controller, capture } = createController({});

		controller.dispatch({
			kind: "phase-event",
			event: { type: "phase-started", phaseKey: "hooks", label: "running just…" },
		});
		controller.dispatch({
			kind: "active-operations-changed",
			operations: commandOperations(["just"]),
		});
		let frame = lastFrame(capture);
		expect(frameLine(frame, "Hooks")).toContain("running just…");
		expect(frameLine(frame, "Running:")).toBe("Running: just");

		controller.dispatch({
			kind: "phase-event",
			event: { type: "phase-done", phaseKey: "hooks", detail: "hooks complete" },
		});
		controller.dispatch({
			kind: "phase-event",
			event: { type: "phase-started", phaseKey: "checkpoint" },
		});
		controller.dispatch({
			kind: "phase-event",
			event: { type: "phase-started", phaseKey: "inspect", label: "inspecting worktree…" },
		});
		controller.dispatch({
			kind: "active-operations-changed",
			operations: commandOperations(["git status --porcelain"]),
		});
		frame = lastFrame(capture);
		// Active rows keep their own labels; the operation stays on the dedicated line.
		expect(frameLine(frame, "Inspect")).toContain("inspecting worktree…");
		expect(frameLine(frame, "Inspect")).not.toContain("git status --porcelain");
		expect(frameLine(frame, "Running:")).toBe("Running: git status --porcelain");

		controller.dispatch({ kind: "active-operations-changed", operations: [] });
		frame = lastFrame(capture);
		// Without an operation the slot stays reserved but blank.
		expect(frame).not.toContain("Running:");
		expect(frameLine(frame, "Inspect")).toContain("inspecting worktree…");
	});

	test("renders controller-owned phase and substep state while forwarding canonical events", () => {
		const capture = streamCapture({ sleep: "pending" });
		const events: NsProgressPhaseEvent[] = [];
		const controller = testWorkflow.createController({
			presentation: {
				kind: "terminal-and-event",
				caps: caps(),
				deps: capture.deps,
				progress: { isLive: true, phase: (event) => events.push(event) },
			},
			title: "Workflow",
			rows: [{ label: "feature/a" }],
		});

		controller.dispatch({
			kind: "phase-event",
			event: { type: "phase-started", phaseKey: "checkpoint", label: "saving changes" },
		});
		controller.dispatch({
			kind: "phase-event",
			event: { type: "phase-started", phaseKey: "inspect", label: "checking worktree" },
		});

		const frame = lastFrame(capture);
		expect(frameLine(frame, "Checkpoint")).toContain("saving changes");
		expect(frameLine(frame, "Inspect")).toContain("checking worktree");
		expect(events).toContainEqual({
			type: "phase-started",
			phaseKey: "checkpoint",
			label: "saving changes",
		});
		expect(events).toContainEqual({
			type: "phase-started",
			phaseKey: "inspect",
			label: "checking worktree",
		});
	});

	test("reserves a blank tail slot and counts quiet time since the last output line", () => {
		const { controller, capture, clock } = createController({ clockNowMs: 1_000 });

		controller.dispatch({
			kind: "phase-event",
			event: { type: "phase-started", phaseKey: "hooks" },
		});
		expect(lastFrame(capture).split("\n").at(-1)).toBe("");

		controller.dispatch({ kind: "note", text: "✓ shell-cli.test.ts (3 tests)\n" });
		expect(lastFrame(capture).split("\n").at(-1)).toBe("       ✓ shell-cli.test.ts (3 tests)");

		clock.advanceMs(14_000);
		controller.dispatch({
			kind: "phase-event",
			event: { type: "phase-progress", phaseKey: "hooks", label: "still running" },
		});
		expect(lastFrame(capture).split("\n").at(-1)).toBe(
			"       ✓ shell-cli.test.ts (3 tests) · 14s ago",
		);

		controller.dispatch({ kind: "note", text: "✓ sdk.test.ts (9 tests)\n" });
		const tailLine = lastFrame(capture).split("\n").at(-1);
		expect(tailLine).toContain("✓ sdk.test.ts (9 tests)");
		expect(tailLine).not.toContain("ago");
	});

	test("settled frames drop the operations and tail slots", async () => {
		const { controller, capture } = createController({ capsParts: { isTty: false } });

		controller.dispatch({
			kind: "phase-event",
			event: { type: "phase-started", phaseKey: "hooks" },
		});
		controller.dispatch({
			kind: "active-operations-changed",
			operations: commandOperations(["just"]),
		});
		await controller.finish();

		const settled = stripAnsi(capture.writes.join(""));
		expect(settled).toContain("hooks complete");
		expect(settled).not.toContain("Running:");
		expect(settled.trimEnd().split("\n").at(-1)).toContain("feature/a");
	});

	test("settled-transcript presentation surfaces phase progress and renders only canonical phases", async () => {
		const capture = streamCapture({ sleep: "resolve" });
		const controller = testWorkflow.createController({
			presentation: {
				kind: "settled-transcript",
				caps: caps({ isTty: false }),
				deps: capture.deps,
			},
			title: "Workflow",
			rows: [{ label: "feature/a" }],
		});
		controller.dispatch({
			kind: "phase-event",
			event: { type: "phase-started", phaseKey: "hooks" },
		});
		controller.dispatch({
			kind: "phase-event",
			event: { type: "phase-progress", phaseKey: "hooks", label: "hook 1/2 complete" },
		});
		controller.dispatch({ kind: "title-changed", title: "Updated workflow" });
		controller.dispatch({
			kind: "cell-changed",
			rowKey: "feature/a",
			column: "metadata",
			update: { state: "active" },
		});

		expect(capture.outputs).toEqual(["running pre-submit hooks…", "hook 1/2 complete"]);
		expect(capture.writes).toEqual([]);
		expect(capture.redraws).toEqual([]);

		await controller.finish({ isFailed: true, finalLines: ["submit failed"] });

		const settled = stripAnsi(capture.writes.join(""));
		expect(settled).toContain("Updated workflow");
		expect(settled).toContain("✗");
		expect(settled).toContain("hook 1/2 complete");
		expect(settled).toContain("submit failed");
		expect(settled).not.toContain("hooks complete");
		expect(settled).not.toContain("Branch / PR");
		expect(settled).not.toContain("feature/a");
		expect(settled).not.toContain("\u001B[");
	});
});
