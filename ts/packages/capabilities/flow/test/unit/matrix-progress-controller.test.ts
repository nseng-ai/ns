import { describe, expect, test } from "vitest";

import type { Caps } from "@nseng-ai/clinkr";
import type { NsProgress, NsProgressPhaseEvent } from "@nseng-ai/sdk";
import { stripAnsi } from "@nseng-ai/clinkr/testing";

import {
	defineMatrixWorkflow,
	type MatrixGlobalRowSpec,
} from "../../src/phase-stream/matrix-progress-core.ts";
import { applyPrLinksToRows } from "../../src/submit/submit-matrix-progress.ts";
import type { SubmitPrLink } from "../../src/submit/gt-output.ts";
import { streamCapture } from "./stream-test-helpers.ts";

const COLUMNS = [
	{ key: "build", label: "Build", width: 5 },
	{ key: "test", label: "Test", width: 4 },
] as const;
const GLOBAL_ROWS: readonly MatrixGlobalRowSpec<"prepare">[] = [
	{
		key: "prepare",
		label: "Prepare",
		detail: "prepared",
		activeLabel: "preparing…",
		substeps: [
			{
				key: "inspect",
				label: "Inspect",
				detail: "inspected",
				activeLabel: "inspecting…",
			},
		],
	},
];
const workflow = defineMatrixWorkflow({
	columns: COLUMNS,
	globalRows: GLOBAL_ROWS,
	phases: [],
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
		controller.setGlobal("prepare", { state: "active" });

		expect(capture.redraws.length).toBeGreaterThan(0);
		expect(latestFrame(capture.redraws)).toContain("Prepare");
	});

	test("setGlobal and setCell rerender through the captured workflow", () => {
		const { capture, controller } = createController();
		controller.begin();
		const initialRedraws = capture.redraws.length;

		controller.setGlobal("prepare", { state: "done", text: "ready" });
		controller.setCell("feature/a", "build", { state: "done", text: "ok" });

		expect(capture.redraws.length).toBeGreaterThan(initialRedraws);
		const frame = latestFrame(capture.redraws);
		expect(frame).toContain("ready");
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
	test("declares metadata once before an early global update and later rows", () => {
		const recording = recordingProgress();
		const controller = workflow.createEventController({
			progress: recording.progress,
			title: "Workflow",
			rows: [],
			begin: "lazy",
		});

		controller.setGlobal("prepare", { state: "active" });
		controller.begin();
		controller.setRows(ROWS);

		expect(recording.events).toEqual([
			{ type: "phases-declared", title: "Workflow", phases: [] },
			{
				type: "matrix-declared",
				columns: COLUMNS,
				labelHeader: "Branch",
				globalRows: GLOBAL_ROWS,
			},
			{ type: "matrix-global", globalKey: "prepare", state: "active" },
			{
				type: "matrix-rows",
				rows: [
					{ rowKey: "feature/a", label: "feature/a" },
					{ rowKey: "feature/b", label: "feature/b" },
				],
			},
		]);
	});

	test("emits substeps, latest full row patches, and state-selective cell deltas", () => {
		const recording = recordingProgress();
		const controller = workflow.createEventController({
			progress: recording.progress,
			title: "Workflow",
			rows: ROWS,
		});
		recording.events.length = 0;

		controller.setGlobalSubstep("prepare", "inspect", { state: "active", text: "reading" });
		controller.patchRow("feature/a", { label: "feature/a (#10)" });
		controller.setCell("feature/a", "test", { state: "done", text: "kept" });
		controller.setCellsInState("test", "pending", { state: "skipped" });

		expect(recording.events).toEqual([
			{
				type: "matrix-global-substep",
				globalKey: "prepare",
				substepKey: "inspect",
				state: "active",
				text: "reading",
			},
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

	test("note is a no-op and stop is idempotent without beginning", async () => {
		const recording = recordingProgress();
		const controller = workflow.createEventController({
			progress: recording.progress,
			title: "Workflow",
			rows: [],
			begin: "lazy",
		});

		controller.note("not transported");
		await controller.stop();
		await controller.stop();

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
			controller.setGlobal("prepare", { state: "active" });
			controller.setGlobalSubstep("prepare", "inspect", { state: "active" });
			controller.setCell("feature/a", "build", { state: "active" });
			controller.setActiveOperations([{ kind: "command", display: "just" }]);
			recording.events.length = 0;

			await controller.finish({ isFailed: target === "failed" });
			await controller.finish({ isFailed: target === "failed" });
			await controller.stop();
			await controller.stop();

			expect(recording.events).toEqual([
				{ type: "matrix-global", globalKey: "prepare", state: target },
				{
					type: "matrix-global-substep",
					globalKey: "prepare",
					substepKey: "inspect",
					state: target,
				},
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
