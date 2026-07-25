import { describe, expect, test } from "vitest";

import type { Caps } from "@nseng-ai/clinkr";
import type { NsProgress, NsProgressPhaseEvent } from "@nseng-ai/sdk";
import { createProgressPhaseStateStore } from "@nseng-ai/sdk/progress-phase-state";
import { stripAnsi } from "@nseng-ai/clinkr/testing";

import {
	composeMatrixProgressAdapters,
	createMatrixProgressControllerCore,
	type MatrixProgressAdapter,
} from "../../src/phase-stream/matrix-progress-controller.ts";
import { defineMatrixWorkflow } from "../../src/phase-stream/matrix-progress-core.ts";
import type {
	MatrixProgressChange,
	MatrixProgressSnapshot,
	MatrixRowSpec,
} from "../../src/phase-stream/matrix-progress-state.ts";
import { streamCapture } from "./stream-test-helpers.ts";

const COLUMNS = [
	{ key: "build", label: "Build", width: 5 },
	{ key: "test", label: "Test", width: 4 },
] as const;
const workflow = defineMatrixWorkflow({
	columns: COLUMNS,
	phases: [
		{
			key: "prepare",
			item: { name: "Prepare", detail: "prepared", label: "preparing…" },
			substeps: [
				{ key: "inspect", item: { name: "Inspect", detail: "inspected", label: "inspecting…" } },
			],
		},
		{ key: "publish", item: { name: "Publish", detail: "published", label: "publishing…" } },
	],
	labelHeader: "Branch",
	rowKey: (row: { branch: string; label: string }) => row.branch,
});
const ROWS = [
	{ branch: "feature/a", label: "feature/a" },
	{ branch: "feature/b", label: "feature/b" },
];

function caps(parts: Partial<Caps> = {}): Caps {
	return {
		isTty: false,
		colorDepth: "none",
		columns: 96,
		canRenderUnicode: true,
		...parts,
	};
}

function latestFrame(redraws: readonly string[]): string {
	const frame = redraws.at(-1);
	if (frame === undefined) throw new Error("missing progress frame");
	return stripAnsi(frame);
}

function recordingProgress(): { events: NsProgressPhaseEvent[]; progress: NsProgress } {
	const events: NsProgressPhaseEvent[] = [];
	return {
		events,
		progress: { isLive: true, phase: (event) => events.push(event) },
	};
}

function createController(
	parts: Partial<Caps> = { isTty: true },
	options: { sleep?: "resolve" | "pending" } = { sleep: "pending" },
) {
	const capture = streamCapture(options.sleep === undefined ? {} : { sleep: options.sleep });
	const controller = workflow.createController({
		presentation: { kind: "terminal", caps: caps(parts), deps: capture.deps },
		title: "Workflow",
		rows: ROWS,
		begin: "lazy",
	});
	return { capture, controller };
}

describe("matrix progress controller", () => {
	test("lazy controllers do not render until an intent begins them", () => {
		const { capture, controller } = createController();

		expect(capture.redraws).toEqual([]);
		controller.dispatch({
			kind: "phase-event",
			event: { type: "phase-started", phaseKey: "prepare" },
		});

		expect(capture.redraws.length).toBeGreaterThan(0);
		expect(latestFrame(capture.redraws)).toContain("Prepare");
	});

	test.each([
		{
			name: "title",
			starts: false,
			act: (controller: ReturnType<typeof createController>["controller"]) =>
				controller.dispatch({ kind: "title-changed", title: "Next" }),
		},
		{
			name: "row patch",
			starts: false,
			act: (controller: ReturnType<typeof createController>["controller"]) =>
				controller.dispatch({
					kind: "row-patched",
					rowKey: "feature/a",
					patch: { label: "patched" },
				}),
		},
		{
			name: "active operations",
			starts: false,
			act: (controller: ReturnType<typeof createController>["controller"]) =>
				controller.dispatch({
					kind: "active-operations-changed",
					operations: [{ kind: "command", display: "just" }],
				}),
		},
		{
			name: "state-selective bulk",
			starts: false,
			act: (controller: ReturnType<typeof createController>["controller"]) =>
				controller.dispatch({
					kind: "cells-in-state-changed",
					column: "build",
					fromState: "pending",
					update: { state: "done" },
				}),
		},
		{
			name: "note",
			starts: false,
			act: (controller: ReturnType<typeof createController>["controller"]) =>
				controller.dispatch({ kind: "note", text: "quiet" }),
		},
		{
			name: "rows replacement",
			starts: true,
			act: (controller: ReturnType<typeof createController>["controller"]) =>
				controller.dispatch({ kind: "rows-replaced", rows: [] }),
		},
		{
			name: "phase event",
			starts: true,
			act: (controller: ReturnType<typeof createController>["controller"]) =>
				controller.dispatch({
					kind: "phase-event",
					event: { type: "phase-done", phaseKey: "prepare" },
				}),
		},
		{
			name: "single cell",
			starts: true,
			act: (controller: ReturnType<typeof createController>["controller"]) =>
				controller.dispatch({
					kind: "cell-changed",
					rowKey: "feature/a",
					column: "build",
					update: { state: "active" },
				}),
		},
		{
			name: "all cells",
			starts: true,
			act: (controller: ReturnType<typeof createController>["controller"]) =>
				controller.dispatch({
					kind: "all-cells-changed",
					column: "build",
					update: { state: "done" },
				}),
		},
		{
			name: "all other cells",
			starts: true,
			act: (controller: ReturnType<typeof createController>["controller"]) =>
				controller.dispatch({
					kind: "all-other-cells-changed",
					column: "build",
					excludedRowKey: "feature/a",
					update: { state: "done" },
				}),
		},
	])("applies the explicit lazy-start policy for $name", ({ starts, act }) => {
		const { capture, controller } = createController();
		act(controller);
		expect(capture.redraws.length > 0).toBe(starts);
	});

	test("phase and cell changes rerender through the captured workflow", () => {
		const { capture, controller } = createController();
		controller.begin();
		const initialRedraws = capture.redraws.length;

		controller.dispatch({
			kind: "phase-event",
			event: { type: "phase-done", phaseKey: "prepare", detail: "ready" },
		});
		controller.dispatch({
			kind: "cell-changed",
			rowKey: "feature/a",
			column: "build",
			update: { state: "done", text: "ok" },
		});

		expect(capture.redraws.length).toBeGreaterThan(initialRedraws);
		const frame = latestFrame(capture.redraws);
		expect(frame).toContain("prepared");
		expect(frame).toContain("ok");
	});

	test("setCellsInState updates only cells in the selected state", () => {
		const { capture, controller } = createController();
		controller.begin();
		controller.dispatch({
			kind: "cell-changed",
			rowKey: "feature/a",
			column: "test",
			update: { state: "done", text: "kept" },
		});

		controller.dispatch({
			kind: "cells-in-state-changed",
			column: "test",
			fromState: "pending",
			update: { state: "skipped", text: "skip" },
		});

		const frame = latestFrame(capture.redraws);
		expect(frame).toContain("kept");
		expect(frame).toContain("skip");
	});

	test("patchRow changes selected row fields", () => {
		const { capture, controller } = createController();
		controller.begin();

		controller.dispatch({
			kind: "row-patched",
			rowKey: "feature/a",
			patch: { label: "feature/a (#10)" },
		});

		const frame = latestFrame(capture.redraws);
		expect(frame).toContain("feature/a (#10)");
		expect(frame).toContain("feature/b");
	});

	test.each([
		{ isFailed: false, symbol: "✓" },
		{ isFailed: true, symbol: "✗" },
	])("finish settles active cells when isFailed=$isFailed", async ({ isFailed, symbol }) => {
		const { capture, controller } = createController({ isTty: true }, { sleep: "resolve" });
		controller.dispatch({
			kind: "cell-changed",
			rowKey: "feature/a",
			column: "build",
			update: { state: "active" },
		});

		await controller.finish({ isFailed });

		expect(latestFrame(capture.redraws)).toContain(symbol);
		expect(capture.dones).toEqual([1]);
	});

	test.each(["done", "failed"] as const)(
		"terminal and event adapters settle phases, cells, and operations equivalently to %s",
		async (target) => {
			const capture = streamCapture({ sleep: "resolve" });
			const recording = recordingProgress();
			const controller = workflow.createController({
				presentation: {
					kind: "terminal-and-event",
					caps: caps({ isTty: true }),
					deps: capture.deps,
					progress: recording.progress,
				},
				title: "Workflow",
				rows: ROWS,
			});
			controller.dispatch({
				kind: "phase-event",
				event: { type: "phase-started", phaseKey: "prepare" },
			});
			controller.dispatch({
				kind: "phase-event",
				event: { type: "phase-started", phaseKey: "inspect" },
			});
			controller.dispatch({
				kind: "cell-changed",
				rowKey: "feature/a",
				column: "build",
				update: { state: "active" },
			});
			controller.dispatch({
				kind: "active-operations-changed",
				operations: [{ kind: "command", display: "just" }],
			});
			recording.events.length = 0;

			await controller.finish({ isFailed: target === "failed" });

			expect(recording.events).toEqual([
				...(target === "done"
					? [
							{ type: "phase-done", phaseKey: "prepare" } as const,
							{ type: "phase-done", phaseKey: "publish" } as const,
						]
					: [
							{
								type: "phase-failed",
								phaseKey: "inspect",
								detail: "inspecting…",
							} as const,
						]),
				{
					type: "matrix-cell",
					rowKey: "feature/a",
					columnKey: "build",
					state: target,
				},
				{ type: "matrix-active-operations", operations: [] },
			]);
			const phaseState = createProgressPhaseStateStore({
				phases: [
					{
						key: "prepare",
						name: "Prepare",
						detail: "prepared",
						substeps: [{ key: "inspect", name: "Inspect", detail: "inspected" }],
					},
					{ key: "publish", name: "Publish", detail: "published" },
				],
			});
			phaseState.apply({ type: "phase-started", phaseKey: "prepare" });
			phaseState.apply({ type: "phase-started", phaseKey: "inspect" });
			for (const event of recording.events) phaseState.apply(event);
			expect(phaseState.views().map((view) => view.state)).toEqual(
				target === "done" ? ["done", "done"] : ["failed", "pending"],
			);
			const frame = latestFrame(capture.redraws);
			expect(frame).not.toContain("Running:");
			expect(frame).toContain(target === "done" ? "✓" : "✗");
		},
	);

	test("notes render only for TTY controllers", () => {
		const tty = createController({ isTty: true });
		tty.controller.begin();
		tty.controller.dispatch({ kind: "note", text: "visible note" });
		expect(latestFrame(tty.capture.redraws)).toContain("visible note");

		const nonTty = createController({ isTty: false });
		nonTty.controller.begin();
		const outputCount = nonTty.capture.redraws.length + nonTty.capture.writes.length;
		nonTty.controller.dispatch({ kind: "note", text: "hidden note" });
		expect(nonTty.capture.redraws.length + nonTty.capture.writes.length).toBe(outputCount);
	});

	test("terminal operations win once and suppress every later mutation", async () => {
		const recording = recordingProgress();
		const controller = workflow.createController({
			presentation: { kind: "event", progress: recording.progress },
			title: "Workflow",
			rows: ROWS,
		});
		controller.dispatch({
			kind: "cell-changed",
			rowKey: "feature/a",
			column: "build",
			update: { state: "active" },
		});
		const finish = controller.finish();
		expect(controller.finish({ isFailed: true })).toBe(finish);
		expect(controller.stop()).toBe(finish);
		await finish;
		const terminalEvents = [...recording.events];

		controller.dispatch({ kind: "title-changed", title: "ignored" });
		controller.dispatch({ kind: "rows-replaced", rows: [] });
		controller.dispatch({ kind: "row-patched", rowKey: "feature/a", patch: { label: "ignored" } });
		controller.dispatch({
			kind: "active-operations-changed",
			operations: [{ kind: "command", display: "ignored" }],
		});
		controller.dispatch({
			kind: "phase-event",
			event: { type: "phase-started", phaseKey: "prepare" },
		});
		controller.dispatch({
			kind: "phase-event",
			event: { type: "phase-started", phaseKey: "inspect" },
		});
		controller.dispatch({
			kind: "cell-changed",
			rowKey: "feature/a",
			column: "build",
			update: { state: "failed" },
		});
		controller.dispatch({
			kind: "cells-in-state-changed",
			column: "build",
			fromState: "done",
			update: { state: "failed" },
		});
		controller.dispatch({
			kind: "all-cells-changed",
			column: "build",
			update: { state: "failed" },
		});
		controller.dispatch({
			kind: "all-other-cells-changed",
			column: "build",
			excludedRowKey: "feature/a",
			update: { state: "failed" },
		});
		controller.dispatch({ kind: "note", text: "ignored" });
		expect(recording.events).toEqual(terminalEvents);
		expect(recording.events.at(-1)).toEqual({
			type: "matrix-cell",
			rowKey: "feature/a",
			columnKey: "build",
			state: "done",
		});
	});

	test("reentrant finish calls share one terminal operation", async () => {
		let reenterFinish = (): Promise<void> => Promise.resolve();
		let reentrantPromise: Promise<void> | undefined;
		let adapterFinishCount = 0;
		const adapter: MatrixProgressAdapter<"build" | "test", MatrixRowSpec> = {
			begin: () => {},
			observe: (change) => {
				if (change.kind === "phase-event" && change.event.type === "phase-done") {
					reentrantPromise ??= reenterFinish();
				}
			},
			beforeFinish: async () => {},
			finish: async () => {
				adapterFinishCount += 1;
			},
			stop: async () => {},
		};
		const controller = createMatrixProgressControllerCore({
			title: "Workflow",
			rows: [{ rowKey: "feature/a", label: "feature/a" }],
			columns: COLUMNS,
			phases: [{ key: "prepare", item: { name: "Prepare", detail: "prepared" } }],
			adapter,
		});
		reenterFinish = () => controller.finish();
		controller.dispatch({
			kind: "phase-event",
			event: { type: "phase-started", phaseKey: "prepare" },
		});

		const finish = controller.finish();

		expect(reentrantPromise).toBe(finish);
		await finish;
		expect(adapterFinishCount).toBe(1);
	});

	test("event-only cell deltas do not require snapshot access", () => {
		const changes: MatrixProgressChange<"build" | "test", MatrixRowSpec>[] = [];
		const controller = createMatrixProgressControllerCore({
			title: "Workflow",
			rows: ROWS.map((row) => ({ ...row, rowKey: row.branch })),
			columns: COLUMNS,
			phases: [],
			adapter: {
				begin: () => {},
				observe: (change, _getSnapshot) => changes.push(change),
				beforeFinish: async () => {},
				finish: async () => {},
				stop: async () => {},
			},
		});

		controller.dispatch({
			kind: "cell-changed",
			rowKey: "feature/a",
			column: "build",
			update: { state: "done" },
		});

		expect(changes.at(-1)).toEqual({
			kind: "cell-changed",
			rowKey: "feature/a",
			column: "build",
			update: { state: "done" },
		});
	});

	test("composed adapters share one memoized snapshot per committed change", () => {
		const snapshots: MatrixProgressSnapshot<"build" | "test", MatrixRowSpec>[] = [];
		function snapshotReadingAdapter(): MatrixProgressAdapter<"build" | "test", MatrixRowSpec> {
			return {
				begin: () => {},
				observe: (_change, getSnapshot) => {
					snapshots.push(getSnapshot());
				},
				beforeFinish: async () => {},
				finish: async () => {},
				stop: async () => {},
			};
		}
		const controller = createMatrixProgressControllerCore({
			title: "Workflow",
			rows: [{ rowKey: "feature/a", label: "feature/a" }],
			columns: COLUMNS,
			phases: [],
			adapter: composeMatrixProgressAdapters([snapshotReadingAdapter(), snapshotReadingAdapter()]),
		});

		controller.dispatch({
			kind: "cell-changed",
			rowKey: "feature/a",
			column: "build",
			update: { state: "done" },
		});
		controller.dispatch({
			kind: "cell-changed",
			rowKey: "feature/a",
			column: "test",
			update: { state: "done" },
		});

		expect(snapshots).toHaveLength(4);
		expect(snapshots[0]).toBe(snapshots[1]);
		expect(snapshots[2]).toBe(snapshots[3]);
		expect(snapshots[0]).not.toBe(snapshots[2]);
		expect(snapshots[0]?.rows[0]?.cells).toEqual({
			build: { state: "done" },
			test: { state: "pending" },
		});
		expect(snapshots[2]?.rows[0]?.cells).toEqual({
			build: { state: "done" },
			test: { state: "done" },
		});
	});

	test("combined terminal and live adapters fan out accepted changes exactly once", () => {
		const capture = streamCapture({ sleep: "pending" });
		const recording = recordingProgress();
		const controller = workflow.createController({
			presentation: {
				kind: "terminal-and-event",
				caps: caps({ isTty: true }),
				deps: capture.deps,
				progress: recording.progress,
			},
			title: "Workflow",
			rows: [],
			begin: "lazy",
		});

		controller.dispatch({ kind: "rows-replaced", rows: ROWS });
		controller.dispatch({
			kind: "phase-event",
			event: { type: "phase-started", phaseKey: "prepare" },
		});
		controller.dispatch({
			kind: "cell-changed",
			rowKey: "feature/a",
			column: "build",
			update: { state: "active", text: "run" },
		});
		controller.dispatch({
			kind: "active-operations-changed",
			operations: [{ kind: "command", display: "just" }],
		});
		const eventsBeforeNote = [...recording.events];
		controller.dispatch({ kind: "note", text: "terminal transcript" });

		const eventTypes = recording.events.map((event) => event.type);
		expect(eventTypes.filter((type) => type === "phases-declared")).toHaveLength(1);
		expect(eventTypes.filter((type) => type === "matrix-declared")).toHaveLength(1);
		expect(eventTypes.filter((type) => type === "matrix-rows")).toHaveLength(1);
		expect(eventTypes.filter((type) => type === "phase-started")).toHaveLength(1);
		expect(eventTypes.filter((type) => type === "matrix-cell")).toHaveLength(1);
		expect(eventTypes.filter((type) => type === "matrix-active-operations")).toHaveLength(1);
		expect(recording.events).toEqual(eventsBeforeNote);
		const frame = latestFrame(capture.redraws);
		expect(frame).toContain("feature/a");
		expect(frame).toContain("run");
		expect(frame).toContain("Running: just");
		expect(frame).toContain("terminal transcript");
	});

	test("stop after begin closes the live region", async () => {
		const { capture, controller } = createController({ isTty: true }, { sleep: "resolve" });
		controller.begin();

		const redrawCount = capture.redraws.length;
		await controller.stop();
		await controller.stop();

		expect(capture.redraws).toHaveLength(redrawCount);
	});
});

describe("matrix event progress controller", () => {
	test("declares initial replacement rows once in declaration order", () => {
		const recording = recordingProgress();
		const controller = workflow.createController({
			presentation: { kind: "event", progress: recording.progress },
			title: "Workflow",
			rows: [],
			begin: "lazy",
		});

		controller.dispatch({ kind: "rows-replaced", rows: ROWS });

		expect(recording.events.map((event) => event.type)).toEqual([
			"phases-declared",
			"matrix-declared",
			"matrix-rows",
		]);
	});

	test("declares metadata once before an early global update and later rows", () => {
		const recording = recordingProgress();
		const controller = workflow.createController({
			presentation: { kind: "event", progress: recording.progress },
			title: "Workflow",
			rows: [],
			begin: "lazy",
		});

		controller.dispatch({
			kind: "phase-event",
			event: { type: "phase-started", phaseKey: "prepare" },
		});
		controller.begin();
		controller.dispatch({ kind: "rows-replaced", rows: ROWS });

		expect(recording.events).toEqual([
			expect.objectContaining({ type: "phases-declared", title: "Workflow" }),
			{
				type: "matrix-declared",
				columns: COLUMNS,
				labelHeader: "Branch",
			},
			{ type: "phase-started", phaseKey: "prepare" },
			{
				type: "matrix-rows",
				rows: [
					{ rowKey: "feature/a", label: "feature/a" },
					{ rowKey: "feature/b", label: "feature/b" },
				],
			},
		]);
	});

	test.each([
		{
			name: "title",
			eventTypes: ["title-changed"],
			act: (controller: ReturnType<typeof workflow.createController>) =>
				controller.dispatch({ kind: "title-changed", title: "Next" }),
		},
		{
			name: "rows",
			eventTypes: ["matrix-rows"],
			act: (controller: ReturnType<typeof workflow.createController>) =>
				controller.dispatch({ kind: "rows-replaced", rows: ROWS }),
		},
		{
			name: "row patch",
			eventTypes: ["matrix-rows"],
			act: (controller: ReturnType<typeof workflow.createController>) =>
				controller.dispatch({
					kind: "row-patched",
					rowKey: "feature/a",
					patch: { label: "patched" },
				}),
		},
		{
			name: "operations",
			eventTypes: ["matrix-active-operations"],
			act: (controller: ReturnType<typeof workflow.createController>) =>
				controller.dispatch({ kind: "active-operations-changed", operations: [] }),
		},
		{
			name: "global",
			eventTypes: ["phase-started"],
			act: (controller: ReturnType<typeof workflow.createController>) =>
				controller.dispatch({
					kind: "phase-event",
					event: { type: "phase-started", phaseKey: "prepare" },
				}),
		},
		{
			name: "substep",
			eventTypes: ["phase-started"],
			act: (controller: ReturnType<typeof workflow.createController>) =>
				controller.dispatch({
					kind: "phase-event",
					event: { type: "phase-started", phaseKey: "inspect" },
				}),
		},
		{
			name: "cell",
			eventTypes: ["matrix-cell"],
			act: (controller: ReturnType<typeof workflow.createController>) =>
				controller.dispatch({
					kind: "cell-changed",
					rowKey: "feature/a",
					column: "build",
					update: { state: "done" },
				}),
		},
		{
			name: "selected cells",
			eventTypes: ["matrix-cell", "matrix-cell"],
			act: (controller: ReturnType<typeof workflow.createController>) =>
				controller.dispatch({
					kind: "cells-in-state-changed",
					column: "build",
					fromState: "pending",
					update: { state: "done" },
				}),
		},
		{
			name: "all cells",
			eventTypes: ["matrix-cell", "matrix-cell"],
			act: (controller: ReturnType<typeof workflow.createController>) =>
				controller.dispatch({
					kind: "all-cells-changed",
					column: "build",
					update: { state: "done" },
				}),
		},
		{
			name: "all other cells",
			eventTypes: ["matrix-cell"],
			act: (controller: ReturnType<typeof workflow.createController>) =>
				controller.dispatch({
					kind: "all-other-cells-changed",
					column: "build",
					excludedRowKey: "feature/a",
					update: { state: "done" },
				}),
		},
		{
			name: "note",
			eventTypes: [],
			act: (controller: ReturnType<typeof workflow.createController>) =>
				controller.dispatch({ kind: "note", text: "local only" }),
		},
	])("notifies the event adapter for $name", ({ eventTypes, act }) => {
		const recording = recordingProgress();
		const controller = workflow.createController({
			presentation: { kind: "event", progress: recording.progress },
			title: "Workflow",
			rows: ROWS,
		});
		recording.events.length = 0;
		act(controller);
		expect(recording.events.map((event) => event.type)).toEqual(eventTypes);
	});

	test("emits substeps, latest full row patches, and state-selective cell deltas", () => {
		const recording = recordingProgress();
		const controller = workflow.createController({
			presentation: { kind: "event", progress: recording.progress },
			title: "Workflow",
			rows: ROWS,
		});
		recording.events.length = 0;

		controller.dispatch({
			kind: "phase-event",
			event: { type: "phase-started", phaseKey: "inspect", label: "reading" },
		});
		controller.dispatch({
			kind: "row-patched",
			rowKey: "feature/a",
			patch: { label: "feature/a (#10)" },
		});
		controller.dispatch({
			kind: "cell-changed",
			rowKey: "feature/a",
			column: "test",
			update: { state: "done", text: "kept" },
		});
		controller.dispatch({
			kind: "cells-in-state-changed",
			column: "test",
			fromState: "pending",
			update: { state: "skipped" },
		});

		expect(recording.events).toEqual([
			{ type: "phase-started", phaseKey: "inspect", label: "reading" },
			{
				type: "matrix-rows",
				rows: [
					{ rowKey: "feature/a", label: "feature/a (#10)" },
					{ rowKey: "feature/b", label: "feature/b" },
				],
			},
			{
				type: "matrix-cell",
				rowKey: "feature/a",
				columnKey: "test",
				state: "done",
				text: "kept",
			},
			{
				type: "matrix-cell",
				rowKey: "feature/b",
				columnKey: "test",
				state: "skipped",
			},
		]);
	});

	test("stop-first is idempotent and suppresses every later mutation", async () => {
		const recording = recordingProgress();
		const controller = workflow.createController({
			presentation: { kind: "event", progress: recording.progress },
			title: "Workflow",
			rows: [],
			begin: "lazy",
		});

		const stop = controller.stop();
		expect(controller.stop()).toBe(stop);
		expect(controller.finish()).toBe(stop);
		await stop;
		controller.begin();
		controller.dispatch({ kind: "title-changed", title: "ignored" });
		controller.dispatch({ kind: "rows-replaced", rows: ROWS });
		controller.dispatch({ kind: "row-patched", rowKey: "feature/a", patch: { label: "ignored" } });
		controller.dispatch({ kind: "active-operations-changed", operations: [] });
		controller.dispatch({
			kind: "phase-event",
			event: { type: "phase-started", phaseKey: "prepare" },
		});
		controller.dispatch({
			kind: "phase-event",
			event: { type: "phase-started", phaseKey: "inspect" },
		});
		controller.dispatch({
			kind: "cell-changed",
			rowKey: "feature/a",
			column: "build",
			update: { state: "done" },
		});
		controller.dispatch({
			kind: "cells-in-state-changed",
			column: "build",
			fromState: "pending",
			update: { state: "done" },
		});
		controller.dispatch({ kind: "all-cells-changed", column: "build", update: { state: "done" } });
		controller.dispatch({
			kind: "all-other-cells-changed",
			column: "build",
			excludedRowKey: "feature/a",
			update: { state: "done" },
		});
		controller.dispatch({ kind: "note", text: "ignored" });

		expect(recording.events).toEqual([]);
	});

	test.each(["done", "failed"] as const)(
		"finish settles active state to %s, clears operations, and stop stays silent",
		async (target) => {
			const recording = recordingProgress();
			const controller = workflow.createController({
				presentation: { kind: "event", progress: recording.progress },
				title: "Workflow",
				rows: ROWS,
			});
			controller.dispatch({
				kind: "phase-event",
				event: { type: "phase-started", phaseKey: "prepare" },
			});
			controller.dispatch({
				kind: "phase-event",
				event: { type: "phase-started", phaseKey: "inspect" },
			});
			controller.dispatch({
				kind: "cell-changed",
				rowKey: "feature/a",
				column: "build",
				update: { state: "active" },
			});
			controller.dispatch({
				kind: "active-operations-changed",
				operations: [{ kind: "command", display: "just" }],
			});
			recording.events.length = 0;

			await controller.finish({ isFailed: target === "failed" });
			await controller.finish({ isFailed: target === "failed" });
			await controller.stop();
			await controller.stop();

			expect(recording.events).toEqual([
				...(target === "done"
					? [
							{ type: "phase-done", phaseKey: "prepare" } as const,
							{ type: "phase-done", phaseKey: "publish" } as const,
						]
					: [
							{
								type: "phase-failed",
								phaseKey: "inspect",
								detail: "inspecting…",
							} as const,
						]),
				{
					type: "matrix-cell",
					rowKey: "feature/a",
					columnKey: "build",
					state: target,
				},
				{ type: "matrix-active-operations", operations: [] },
			]);
		},
	);
});
