import { describe, expect, test } from "vitest";

import type { NsProgress, NsProgressPhaseEvent } from "@nseng-ai/sdk";

import { createMatrixProgressForwarder } from "../../src/phase-stream/matrix-progress-forwarder.ts";
import type { MatrixColumnSpec } from "../../src/phase-stream/matrix-progress-core.ts";

type ColumnKey = "gate" | "merge";

const COLUMNS: readonly MatrixColumnSpec<ColumnKey>[] = [
	{ key: "gate", label: "Gate", width: 5 },
	{ key: "merge", label: "Merge", width: 6 },
];

const ROWS = [
	{ rowKey: "feature-a", label: "feature-a (#1)" },
	{ rowKey: "feature-b", label: "feature-b (#2)" },
	{ rowKey: "feature-c", label: "feature-c (#3)" },
];

function recordingProgress(): { events: NsProgressPhaseEvent[]; sink: NsProgress } {
	const events: NsProgressPhaseEvent[] = [];
	return { events, sink: { isLive: true, phase: (event) => events.push(event) } };
}

describe("createMatrixProgressForwarder", () => {
	test("first setRows emits matrix-declared then matrix-rows", () => {
		const progress = recordingProgress();
		const forwarder = createMatrixProgressForwarder({
			progress: progress.sink,
			columns: COLUMNS,
			labelHeader: "Branch / PR",
		});

		forwarder.setRows(ROWS);

		expect(progress.events).toEqual([
			{
				type: "matrix-declared",
				columns: [
					{ key: "gate", label: "Gate", width: 5 },
					{ key: "merge", label: "Merge", width: 6 },
				],
				labelHeader: "Branch / PR",
			},
			{ type: "matrix-rows", rows: ROWS },
		]);
	});

	test("re-declaring rows replaces the row set without repeating matrix-declared", () => {
		const progress = recordingProgress();
		const forwarder = createMatrixProgressForwarder({ progress: progress.sink, columns: COLUMNS });

		forwarder.setRows(ROWS);
		forwarder.setRows(ROWS.slice(0, 1));

		expect(progress.events.filter((event) => event.type === "matrix-declared")).toHaveLength(1);
		expect(progress.events.at(-1)).toEqual({
			type: "matrix-rows",
			rows: [{ rowKey: "feature-a", label: "feature-a (#1)" }],
		});
	});

	test("omits labelHeader from matrix-declared when not configured", () => {
		const progress = recordingProgress();
		const forwarder = createMatrixProgressForwarder({ progress: progress.sink, columns: COLUMNS });

		forwarder.setRows(ROWS);

		expect(progress.events[0]).toEqual({
			type: "matrix-declared",
			columns: [
				{ key: "gate", label: "Gate", width: 5 },
				{ key: "merge", label: "Merge", width: 6 },
			],
		});
	});

	test("setCell emits one matrix-cell and omits absent text", () => {
		const progress = recordingProgress();
		const forwarder = createMatrixProgressForwarder({ progress: progress.sink, columns: COLUMNS });
		forwarder.setRows(ROWS);
		progress.events.length = 0;

		forwarder.setCell("feature-a", "merge", { state: "active" });
		forwarder.setCell("feature-a", "merge", { state: "done", text: "ok" });

		expect(progress.events).toEqual([
			{ type: "matrix-cell", rowKey: "feature-a", columnKey: "merge", state: "active" },
			{ type: "matrix-cell", rowKey: "feature-a", columnKey: "merge", state: "done", text: "ok" },
		]);
	});

	test("setAllCells expands into per-row matrix-cell events over the declared rows", () => {
		const progress = recordingProgress();
		const forwarder = createMatrixProgressForwarder({ progress: progress.sink, columns: COLUMNS });
		forwarder.setRows(ROWS);
		progress.events.length = 0;

		forwarder.setAllCells("gate", { state: "done" });

		expect(progress.events).toEqual([
			{ type: "matrix-cell", rowKey: "feature-a", columnKey: "gate", state: "done" },
			{ type: "matrix-cell", rowKey: "feature-b", columnKey: "gate", state: "done" },
			{ type: "matrix-cell", rowKey: "feature-c", columnKey: "gate", state: "done" },
		]);
	});

	test("setAllOtherCells skips the named row", () => {
		const progress = recordingProgress();
		const forwarder = createMatrixProgressForwarder({ progress: progress.sink, columns: COLUMNS });
		forwarder.setRows(ROWS);
		progress.events.length = 0;

		forwarder.setAllOtherCells("merge", "feature-b", { state: "skipped" });

		expect(progress.events).toEqual([
			{ type: "matrix-cell", rowKey: "feature-a", columnKey: "merge", state: "skipped" },
			{ type: "matrix-cell", rowKey: "feature-c", columnKey: "merge", state: "skipped" },
		]);
	});

	test("bulk updates before any setRows emit nothing", () => {
		const progress = recordingProgress();
		const forwarder = createMatrixProgressForwarder({ progress: progress.sink, columns: COLUMNS });

		forwarder.setAllCells("gate", { state: "done" });
		forwarder.setAllOtherCells("merge", "feature-a", { state: "skipped" });

		expect(progress.events).toEqual([]);
	});

	test("setActiveOperations maps onto matrix-active-operations", () => {
		const progress = recordingProgress();
		const forwarder = createMatrixProgressForwarder({ progress: progress.sink, columns: COLUMNS });

		forwarder.setActiveOperations([{ kind: "command", display: "gh pr merge 1" }]);

		expect(progress.events).toEqual([
			{
				type: "matrix-active-operations",
				operations: [{ kind: "command", display: "gh pr merge 1" }],
			},
		]);
	});
});
