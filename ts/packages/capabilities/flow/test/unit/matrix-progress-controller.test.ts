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
import { createMatrixEventAdapter } from "../../src/phase-stream/matrix-progress-event-adapter.ts";
import {
	snapshotMatrixProgress,
	type MatrixRowSpec,
} from "../../src/phase-stream/matrix-progress-state.ts";
import { applyPrLinksToRows } from "../../src/submit/submit-matrix-progress.ts";
import type { SubmitPrLink } from "../../src/submit/gt-output.ts";
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
		caps: caps(parts),
		deps: capture.deps,
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
		controller.phase({ type: "phase-started", phaseKey: "prepare" });

		expect(capture.redraws.length).toBeGreaterThan(0);
		expect(latestFrame(capture.redraws)).toContain("Prepare");
	});

	test.each([
		{
			name: "title",
			starts: false,
			act: (controller: ReturnType<typeof createController>["controller"]) =>
				controller.setTitle("Next"),
		},
		{
			name: "row patch",
			starts: false,
			act: (controller: ReturnType<typeof createController>["controller"]) =>
				controller.patchRow("feature/a", { label: "patched" }),
		},
		{
			name: "active operations",
			starts: false,
			act: (controller: ReturnType<typeof createController>["controller"]) =>
				controller.setActiveOperations([{ kind: "command", display: "just" }]),
		},
		{
			name: "state-selective bulk",
			starts: false,
			act: (controller: ReturnType<typeof createController>["controller"]) =>
				controller.setCellsInState("build", "pending", { state: "done" }),
		},
		{
			name: "note",
			starts: false,
			act: (controller: ReturnType<typeof createController>["controller"]) =>
				controller.note("quiet"),
		},
		{
			name: "rows replacement",
			starts: true,
			act: (controller: ReturnType<typeof createController>["controller"]) =>
				controller.setRows([]),
		},
		{
			name: "phase event",
			starts: true,
			act: (controller: ReturnType<typeof createController>["controller"]) =>
				controller.phase({ type: "phase-done", phaseKey: "prepare" }),
		},
		{
			name: "single cell",
			starts: true,
			act: (controller: ReturnType<typeof createController>["controller"]) =>
				controller.setCell("feature/a", "build", { state: "active" }),
		},
		{
			name: "all cells",
			starts: true,
			act: (controller: ReturnType<typeof createController>["controller"]) =>
				controller.setAllCells("build", { state: "done" }),
		},
		{
			name: "all other cells",
			starts: true,
			act: (controller: ReturnType<typeof createController>["controller"]) =>
				controller.setAllOtherCells("build", "feature/a", { state: "done" }),
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

		controller.phase({ type: "phase-done", phaseKey: "prepare", detail: "ready" });
		controller.setCell("feature/a", "build", { state: "done", text: "ok" });

		expect(capture.redraws.length).toBeGreaterThan(initialRedraws);
		const frame = latestFrame(capture.redraws);
		expect(frame).toContain("prepared");
		expect(frame).toContain("ok");
	});

	test("setCellsInState updates only cells in the selected state", () => {
		const { capture, controller } = createController();
		controller.begin();
		controller.setCell("feature/a", "test", { state: "done", text: "kept" });

		controller.setCellsInState("test", "pending", { state: "skipped", text: "skip" });

		const frame = latestFrame(capture.redraws);
		expect(frame).toContain("kept");
		expect(frame).toContain("skip");
	});

	test("patchRow changes selected row fields", () => {
		const { capture, controller } = createController();
		controller.begin();

		controller.patchRow("feature/a", { label: "feature/a (#10)" });

		const frame = latestFrame(capture.redraws);
		expect(frame).toContain("feature/a (#10)");
		expect(frame).toContain("feature/b");
	});

	test.each([
		{ isFailed: false, symbol: "✓" },
		{ isFailed: true, symbol: "✗" },
	])("finish settles active cells when isFailed=$isFailed", async ({ isFailed, symbol }) => {
		const { capture, controller } = createController({ isTty: true }, { sleep: "resolve" });
		controller.setCell("feature/a", "build", { state: "active" });

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
				caps: caps({ isTty: true }),
				deps: capture.deps,
				progress: recording.progress,
				title: "Workflow",
				rows: ROWS,
			});
			controller.phase({ type: "phase-started", phaseKey: "prepare" });
			controller.phase({ type: "phase-started", phaseKey: "inspect" });
			controller.setCell("feature/a", "build", { state: "active" });
			controller.setActiveOperations([{ kind: "command", display: "just" }]);
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
		tty.controller.note("visible note");
		expect(latestFrame(tty.capture.redraws)).toContain("visible note");

		const nonTty = createController({ isTty: false });
		nonTty.controller.begin();
		const outputCount = nonTty.capture.redraws.length + nonTty.capture.writes.length;
		nonTty.controller.note("hidden note");
		expect(nonTty.capture.redraws.length + nonTty.capture.writes.length).toBe(outputCount);
	});

	test("terminal operations win once and suppress every later mutation", async () => {
		const recording = recordingProgress();
		const controller = workflow.createEventController({
			progress: recording.progress,
			title: "Workflow",
			rows: ROWS,
		});
		controller.setCell("feature/a", "build", { state: "active" });
		const finish = controller.finish();
		expect(controller.finish({ isFailed: true })).toBe(finish);
		expect(controller.stop()).toBe(finish);
		await finish;
		const terminalEvents = [...recording.events];

		controller.setTitle("ignored");
		controller.setRows([]);
		controller.patchRow("feature/a", { label: "ignored" });
		controller.setActiveOperations([{ kind: "command", display: "ignored" }]);
		controller.phase({ type: "phase-started", phaseKey: "prepare" });
		controller.phase({ type: "phase-started", phaseKey: "inspect" });
		controller.setCell("feature/a", "build", { state: "failed" });
		controller.setCellsInState("build", "done", { state: "failed" });
		controller.setAllCells("build", { state: "failed" });
		controller.setAllOtherCells("build", "feature/a", { state: "failed" });
		controller.note("ignored");
		expect(recording.events).toEqual(terminalEvents);
		expect(recording.events.at(-1)).toEqual({
			type: "matrix-cell",
			rowKey: "feature/a",
			columnKey: "build",
			state: "done",
		});
	});

	test("event-only cell deltas do not materialize full snapshots", () => {
		const recording = recordingProgress();
		let snapshotCount = 0;
		const controller = createMatrixProgressControllerCore({
			title: "Workflow",
			rows: ROWS.map((row) => ({ ...row, rowKey: row.branch })),
			columns: COLUMNS,
			phases: [],
			createSnapshot: (state, phases) => {
				snapshotCount += 1;
				return snapshotMatrixProgress(state, phases);
			},
			createAdapter: ({ getLifecycle }) =>
				createMatrixEventAdapter({
					progress: recording.progress,
					columns: COLUMNS,
					phases: [],
					getLifecycle,
				}),
		});
		snapshotCount = 0;

		controller.setCell("feature/a", "build", { state: "done" });

		expect(snapshotCount).toBe(0);
		expect(recording.events.at(-1)).toEqual({
			type: "matrix-cell",
			rowKey: "feature/a",
			columnKey: "build",
			state: "done",
		});
	});

	test("composed adapters share one memoized snapshot per committed change", () => {
		let snapshotCount = 0;
		function snapshotReadingAdapter(): MatrixProgressAdapter<"build" | "test", MatrixRowSpec> {
			return {
				begin: () => {},
				observe: (_change, getSnapshot) => {
					getSnapshot();
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
			createSnapshot: (state, phases) => {
				snapshotCount += 1;
				return snapshotMatrixProgress(state, phases);
			},
			createAdapter: () =>
				composeMatrixProgressAdapters([snapshotReadingAdapter(), snapshotReadingAdapter()]),
		});
		snapshotCount = 0;

		controller.setCell("feature/a", "build", { state: "done" });

		expect(snapshotCount).toBe(1);
	});

	test("combined terminal and live adapters fan out accepted changes exactly once", () => {
		const capture = streamCapture({ sleep: "pending" });
		const recording = recordingProgress();
		const controller = workflow.createController({
			caps: caps({ isTty: true }),
			deps: capture.deps,
			progress: recording.progress,
			title: "Workflow",
			rows: [],
			begin: "lazy",
		});

		controller.setRows(ROWS);
		controller.phase({ type: "phase-started", phaseKey: "prepare" });
		controller.setCell("feature/a", "build", { state: "active", text: "run" });
		controller.setActiveOperations([{ kind: "command", display: "just" }]);
		const eventsBeforeNote = [...recording.events];
		controller.note("terminal transcript");

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
		const controller = workflow.createEventController({
			progress: recording.progress,
			title: "Workflow",
			rows: [],
			begin: "lazy",
		});

		controller.setRows(ROWS);

		expect(recording.events.map((event) => event.type)).toEqual([
			"phases-declared",
			"matrix-declared",
			"matrix-rows",
		]);
	});

	test("declares metadata once before an early global update and later rows", () => {
		const recording = recordingProgress();
		const controller = workflow.createEventController({
			progress: recording.progress,
			title: "Workflow",
			rows: [],
			begin: "lazy",
		});

		controller.phase({ type: "phase-started", phaseKey: "prepare" });
		controller.begin();
		controller.setRows(ROWS);

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
			act: (controller: ReturnType<typeof workflow.createEventController>) =>
				controller.setTitle("Next"),
		},
		{
			name: "rows",
			eventTypes: ["matrix-rows"],
			act: (controller: ReturnType<typeof workflow.createEventController>) =>
				controller.setRows(ROWS),
		},
		{
			name: "row patch",
			eventTypes: ["matrix-rows"],
			act: (controller: ReturnType<typeof workflow.createEventController>) =>
				controller.patchRow("feature/a", { label: "patched" }),
		},
		{
			name: "operations",
			eventTypes: ["matrix-active-operations"],
			act: (controller: ReturnType<typeof workflow.createEventController>) =>
				controller.setActiveOperations([]),
		},
		{
			name: "global",
			eventTypes: ["phase-started"],
			act: (controller: ReturnType<typeof workflow.createEventController>) =>
				controller.phase({ type: "phase-started", phaseKey: "prepare" }),
		},
		{
			name: "substep",
			eventTypes: ["phase-started"],
			act: (controller: ReturnType<typeof workflow.createEventController>) =>
				controller.phase({ type: "phase-started", phaseKey: "inspect" }),
		},
		{
			name: "cell",
			eventTypes: ["matrix-cell"],
			act: (controller: ReturnType<typeof workflow.createEventController>) =>
				controller.setCell("feature/a", "build", { state: "done" }),
		},
		{
			name: "selected cells",
			eventTypes: ["matrix-cell", "matrix-cell"],
			act: (controller: ReturnType<typeof workflow.createEventController>) =>
				controller.setCellsInState("build", "pending", { state: "done" }),
		},
		{
			name: "all cells",
			eventTypes: ["matrix-cell", "matrix-cell"],
			act: (controller: ReturnType<typeof workflow.createEventController>) =>
				controller.setAllCells("build", { state: "done" }),
		},
		{
			name: "all other cells",
			eventTypes: ["matrix-cell"],
			act: (controller: ReturnType<typeof workflow.createEventController>) =>
				controller.setAllOtherCells("build", "feature/a", { state: "done" }),
		},
		{
			name: "note",
			eventTypes: [],
			act: (controller: ReturnType<typeof workflow.createEventController>) =>
				controller.note("local only"),
		},
	])("notifies the event adapter for $name", ({ eventTypes, act }) => {
		const recording = recordingProgress();
		const controller = workflow.createEventController({
			progress: recording.progress,
			title: "Workflow",
			rows: ROWS,
		});
		recording.events.length = 0;
		act(controller);
		expect(recording.events.map((event) => event.type)).toEqual(eventTypes);
	});

	test("emits substeps, latest full row patches, and state-selective cell deltas", () => {
		const recording = recordingProgress();
		const controller = workflow.createEventController({
			progress: recording.progress,
			title: "Workflow",
			rows: ROWS,
		});
		recording.events.length = 0;

		controller.phase({ type: "phase-started", phaseKey: "inspect", label: "reading" });
		controller.patchRow("feature/a", { label: "feature/a (#10)" });
		controller.setCell("feature/a", "test", { state: "done", text: "kept" });
		controller.setCellsInState("test", "pending", { state: "skipped" });

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
		const controller = workflow.createEventController({
			progress: recording.progress,
			title: "Workflow",
			rows: [],
			begin: "lazy",
		});

		const stop = controller.stop();
		expect(controller.stop()).toBe(stop);
		expect(controller.finish()).toBe(stop);
		await stop;
		controller.begin();
		controller.setTitle("ignored");
		controller.setRows(ROWS);
		controller.patchRow("feature/a", { label: "ignored" });
		controller.setActiveOperations([]);
		controller.phase({ type: "phase-started", phaseKey: "prepare" });
		controller.phase({ type: "phase-started", phaseKey: "inspect" });
		controller.setCell("feature/a", "build", { state: "done" });
		controller.setCellsInState("build", "pending", { state: "done" });
		controller.setAllCells("build", { state: "done" });
		controller.setAllOtherCells("build", "feature/a", { state: "done" });
		controller.note("ignored");

		expect(recording.events).toEqual([]);
	});

	test.each(["done", "failed"] as const)(
		"finish settles active state to %s, clears operations, and stop stays silent",
		async (target) => {
			const recording = recordingProgress();
			const controller = workflow.createEventController({
				progress: recording.progress,
				title: "Workflow",
				rows: ROWS,
			});
			controller.phase({ type: "phase-started", phaseKey: "prepare" });
			controller.phase({ type: "phase-started", phaseKey: "inspect" });
			controller.setCell("feature/a", "build", { state: "active" });
			controller.setActiveOperations([{ kind: "command", display: "just" }]);
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

describe("applyPrLinksToRows", () => {
	const existingPr: SubmitPrLink = {
		label: "#10",
		url: "https://github.com/acme/repo/pull/10",
	};
	const newPr: SubmitPrLink = {
		label: "#11",
		url: "https://github.com/acme/repo/pull/11",
	};
	const rows = [
		{ branch: "feature/a", label: "feature/a (#10)", kind: "existing" as const, pr: existingPr },
		{ branch: "feature/b", label: "feature/b", kind: "new" as const },
	];

	test("returns label deltas for links not already represented", () => {
		expect(applyPrLinksToRows(rows, [existingPr, newPr])).toEqual([
			{ branch: "feature/b", pr: newPr, label: "feature/b (#11)" },
		]);
		expect(rows[1]).toEqual({ branch: "feature/b", label: "feature/b", kind: "new" });
	});

	test("preserves the all-or-nothing rule when link counts do not match", () => {
		expect(applyPrLinksToRows(rows, [])).toEqual([]);
		expect(applyPrLinksToRows(rows, [newPr, { label: "#12", url: "https://x/pull/12" }])).toEqual(
			[],
		);
	});
});
