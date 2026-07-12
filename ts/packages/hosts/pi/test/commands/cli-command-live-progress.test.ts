import { describe, expect, test } from "vitest";

import type { NsProgressPhaseEvent } from "@nseng-ai/sdk";

import {
	LiveCommandProgress,
	MatrixWidgetState,
	type LiveProgressWidgetContent,
} from "../../src/commands/cli-command-live-progress.ts";

const LAND_COLUMNS = [
	{ key: "gate", label: "Gate", width: 5 },
	{ key: "merge", label: "Merge", width: 6 },
	{ key: "verify", label: "Verify", width: 6 },
	{ key: "restack", label: "Restack", width: 7 },
];

function declaredWithRows(rowCount = 2): MatrixWidgetState {
	const state = new MatrixWidgetState();
	state.apply({ type: "matrix-declared", columns: LAND_COLUMNS });
	state.apply({
		type: "matrix-rows",
		rows: Array.from({ length: rowCount }, (_, index) => ({
			rowKey: `feature-${index + 1}`,
			label: `feature-${index + 1} (#${index + 1})`,
		})),
	});
	return state;
}

describe("MatrixWidgetState", () => {
	test("renders nothing until matrix-declared", () => {
		const state = new MatrixWidgetState();
		expect(state.isActive).toBe(false);
		expect(state.lines()).toEqual([]);

		state.apply({ type: "matrix-cell", rowKey: "feature-1", columnKey: "gate", state: "done" });
		expect(state.lines()).toEqual([]);
	});

	test("renders header and every row with pending glyphs after rows declared", () => {
		const state = declaredWithRows(3);

		const lines = state.lines();
		expect(lines[0]).toMatch(/^Branch \/ PR\s+Gate\s+Merge\s+Verify\s+Restack\s*$/);
		expect(lines).toHaveLength(4);
		for (const row of lines.slice(1)) {
			expect(row).toMatch(/^feature-\d \(#\d\)\s+(·\s+){3}·\s*$/);
		}
	});

	test("tracks glyph transitions across cell states", () => {
		const state = declaredWithRows(2);
		state.apply({ type: "matrix-cell", rowKey: "feature-1", columnKey: "gate", state: "done" });
		state.apply({ type: "matrix-cell", rowKey: "feature-1", columnKey: "merge", state: "active" });
		state.apply({
			type: "matrix-cell",
			rowKey: "feature-2",
			columnKey: "merge",
			state: "skipped",
		});
		state.apply({
			type: "matrix-cell",
			rowKey: "feature-2",
			columnKey: "verify",
			state: "failed",
		});

		const [, rowOne, rowTwo] = state.lines();
		expect(rowOne).toMatch(/^feature-1 \(#1\)\s+✓\s+▸\s+·\s+·\s*$/);
		expect(rowTwo).toMatch(/^feature-2 \(#2\)\s+·\s+–\s+✗\s+·\s*$/);
	});

	test("renders cell text instead of the glyph only when it fits the column", () => {
		const state = declaredWithRows(1);
		state.apply({
			type: "matrix-cell",
			rowKey: "feature-1",
			columnKey: "merge",
			state: "active",
			text: "retry",
		});
		state.apply({
			type: "matrix-cell",
			rowKey: "feature-1",
			columnKey: "gate",
			state: "active",
			text: "too wide for gate",
		});

		const row = state.lines()[1];
		expect(row).toContain("retry");
		expect(row).not.toContain("too wide for gate");
		expect(row).toMatch(/▸/);
	});

	test("matrix-rows replaces the row set and drops stale cell state", () => {
		const state = declaredWithRows(2);
		state.apply({ type: "matrix-cell", rowKey: "feature-2", columnKey: "gate", state: "done" });

		state.apply({
			type: "matrix-rows",
			rows: [{ rowKey: "feature-3", label: "feature-3 (#3)" }],
		});
		state.apply({
			type: "matrix-rows",
			rows: [
				{ rowKey: "feature-2", label: "feature-2 (#2)" },
				{ rowKey: "feature-3", label: "feature-3 (#3)" },
			],
		});

		const lines = state.lines();
		expect(lines).toHaveLength(3);
		expect(lines[1]).toMatch(/^feature-2 \(#2\)\s+(·\s+){3}·\s*$/);
	});

	test("honors a custom label header and long labels truncate at the label column", () => {
		const state = new MatrixWidgetState();
		state.apply({
			type: "matrix-declared",
			columns: LAND_COLUMNS,
			labelHeader: "PR",
		});
		const longLabel = `feature-with-a-very-long-branch-name-that-overflows (#42)`;
		state.apply({ type: "matrix-rows", rows: [{ rowKey: "long", label: longLabel }] });

		const lines = state.lines();
		expect(lines[0]?.startsWith("PR")).toBe(true);
		expect(lines[1]).toContain("…");
		expect(lines[1]?.startsWith(longLabel.slice(0, 35))).toBe(true);
	});

	test("renders a running-commands line when present", () => {
		const state = declaredWithRows(1);
		state.apply({
			type: "matrix-active-operations",
			operations: [
				{ kind: "command", display: "gh pr merge 1" },
				{ kind: "command", display: "gt restack" },
			],
		});

		expect(state.lines().at(-1)).toBe("Running: gh pr merge 1; gt restack");

		state.apply({ type: "matrix-active-operations", operations: [] });
		expect(state.lines().some((line) => line.startsWith("Running:"))).toBe(false);
	});
});

interface WidgetCall {
	key: string;
	value: LiveProgressWidgetContent | undefined;
}

function renderWidgetContent(content: LiveProgressWidgetContent | undefined): string[] | undefined {
	if (content === undefined) return undefined;
	if (typeof content === "function") return content().render(100);
	return content;
}

function createWidgetHarness() {
	const widgetCalls: WidgetCall[] = [];
	const ctx = {
		hasUI: true,
		ui: {
			setWidget: (key: string, value: LiveProgressWidgetContent | undefined) => {
				widgetCalls.push({ key, value });
			},
		},
	};
	const progress = new LiveCommandProgress(ctx, {
		cliName: "ns",
		commandName: "flow land",
		piCommandName: "ns:flow:land",
		argv: ["flow", "land"],
	});
	return {
		progress,
		widgetCalls,
		latestWidget: () => renderWidgetContent(widgetCalls.at(-1)?.value),
	};
}

const PHASE_EVENTS: readonly NsProgressPhaseEvent[] = [
	{
		type: "phases-declared",
		title: "ns flow land",
		phases: [
			{ key: "preflight", name: "Preflight" },
			{ key: "merge", name: "Merge" },
		],
	},
	{ type: "phase-started", phaseKey: "preflight", label: "checking stack and PRs…" },
];

const MATRIX_EVENTS: readonly NsProgressPhaseEvent[] = [
	{
		type: "matrix-declared",
		columns: LAND_COLUMNS,
	},
	{
		type: "matrix-rows",
		rows: [
			{ rowKey: "feature-a", label: "feature-a (#1)" },
			{ rowKey: "feature-b", label: "feature-b (#2)" },
		],
	},
	{ type: "matrix-cell", rowKey: "feature-a", columnKey: "merge", state: "active" },
];

describe("LiveCommandProgress matrix rendering", () => {
	test("composes phase checklist, matrix block, and latest output line", () => {
		const { progress, latestWidget } = createWidgetHarness();
		try {
			for (const event of [...PHASE_EVENTS, ...MATRIX_EVENTS]) progress.applyPhaseEvent(event);
			progress.appendOutput("stdout", "merging feature-a\n");

			const lines = latestWidget();
			expect(lines?.[0]).toMatch(/^\/ns:flow:land \(.* elapsed\)$/);
			expect(lines?.[1]).toMatch(/^▸ Preflight\s+checking stack and PRs…$/);
			expect(lines?.[2]).toMatch(/^· Merge/);
			expect(lines?.[3]).toBe("");
			expect(lines?.[4]).toMatch(/^Branch \/ PR\s+Gate\s+Merge\s+Verify\s+Restack\s*$/);
			expect(lines?.[5]).toMatch(/^feature-a \(#1\)\s+·\s+▸\s+·\s+·\s*$/);
			expect(lines?.[6]).toMatch(/^feature-b \(#2\)\s+(·\s+){3}·\s*$/);
			expect(lines?.at(-1)).toBe("  stdout: merging feature-a");
		} finally {
			progress.close();
		}
	});

	test("renders header plus matrix when only matrix events arrive", () => {
		const { progress, latestWidget } = createWidgetHarness();
		try {
			for (const event of MATRIX_EVENTS) progress.applyPhaseEvent(event);

			const lines = latestWidget();
			expect(lines?.[0]).toContain("/ns:flow:land");
			expect(lines?.[1]).toBe("");
			expect(lines?.[2]).toMatch(/^Branch \/ PR\s+Gate/);
			expect(lines).toHaveLength(5);
		} finally {
			progress.close();
		}
	});

	test("renders every matrix row through an uncapped component widget", () => {
		const { progress, widgetCalls, latestWidget } = createWidgetHarness();
		try {
			for (const event of PHASE_EVENTS) progress.applyPhaseEvent(event);
			progress.applyPhaseEvent({ type: "matrix-declared", columns: LAND_COLUMNS });
			progress.applyPhaseEvent({
				type: "matrix-rows",
				rows: Array.from({ length: 12 }, (_, index) => ({
					rowKey: `feature-${index + 1}`,
					label: `feature-${index + 1} (#${index + 1})`,
				})),
			});

			expect(typeof widgetCalls.at(-1)?.value).toBe("function");
			const lines = latestWidget();
			expect(lines).toHaveLength(17);
			expect(lines?.some((line) => line.startsWith("feature-12 (#12)"))).toBe(true);
			expect(lines).not.toContain("... (widget truncated)");
		} finally {
			progress.close();
		}
	});

	test("truncates rendered widget lines to the display cap", () => {
		const { progress, latestWidget } = createWidgetHarness();
		try {
			for (const event of MATRIX_EVENTS) progress.applyPhaseEvent(event);
			progress.applyPhaseEvent({
				type: "matrix-active-operations",
				operations: [{ kind: "command", display: "x".repeat(200) }],
			});

			const lines = latestWidget();
			expect(lines?.at(-1)).toHaveLength(100);
			expect(lines?.at(-1)?.endsWith("…")).toBe(true);
		} finally {
			progress.close();
		}
	});

	test("status-only targets accept matrix events without widget output", () => {
		const statuses: Array<string | undefined> = [];
		const progress = new LiveCommandProgress(
			{
				hasUI: true,
				ui: {
					setStatus: (_key: string, value: string | undefined) => {
						statuses.push(value);
					},
				},
			},
			{
				cliName: "ns",
				commandName: "flow land",
				piCommandName: "ns:flow:land",
				argv: ["flow", "land"],
			},
		);
		try {
			for (const event of MATRIX_EVENTS) progress.applyPhaseEvent(event);
			expect(statuses.at(-1)).toContain("/ns:flow:land");
			expect(statuses.some((value) => value?.includes("Branch / PR"))).toBe(false);
		} finally {
			progress.close();
		}
	});
});
