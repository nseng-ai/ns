import { describe, expect, test } from "vitest";

import { visibleWidth } from "@earendil-works/pi-tui";
import { createManualTimerScheduler } from "@nseng-ai/foundation/time/testing";
import type { NsProgressPhaseEvent } from "@nseng-ai/sdk";

import {
	LiveCommandProgress,
	MatrixWidgetState,
	type LiveProgressWidgetContent,
	type WidgetLine,
} from "../../src/commands/cli-command-live-progress.ts";
import type { WidgetTheme, WidgetThemeColor } from "../../src/runtime/tool-types.ts";

const LAND_COLUMNS = [
	{ key: "gate", label: "Gate", width: 5 },
	{ key: "merge", label: "Merge", width: 6 },
	{ key: "verify", label: "Verify", width: 6 },
	{ key: "restack", label: "Restack", width: 7 },
];

const TICK_0_FRAME = "⠋";
const TICK_1_FRAME = "⠙";
const TICK_2_FRAME = "⠹";

const identityTheme: WidgetTheme = {
	fg: (_color, text) => text,
};

// Real SGR escapes (not text markers) so ANSI-aware width math stays honest.
const SGR_OPEN: Record<WidgetThemeColor, string> = {
	accent: "\u001b[36m",
	success: "\u001b[32m",
	error: "\u001b[31m",
	warning: "\u001b[33m",
	muted: "\u001b[37m",
	dim: "\u001b[2m",
	text: "\u001b[39m",
};
const SGR_CLOSE = "\u001b[0m";

const sgrTheme: WidgetTheme = {
	fg: (color, text) => `${SGR_OPEN[color]}${text}${SGR_CLOSE}`,
	bold: (text) => `\u001b[1m${text}\u001b[22m`,
};

function flattenLines(lines: readonly WidgetLine[]): string[] {
	return lines.map((line) => line.map((segment) => segment.text).join(""));
}

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
		expect(state.lines(TICK_0_FRAME)).toEqual([]);

		state.apply({ type: "matrix-cell", rowKey: "feature-1", columnKey: "gate", state: "done" });
		expect(state.lines(TICK_0_FRAME)).toEqual([]);
	});

	test("renders header and every row with pending glyphs after rows declared", () => {
		const state = declaredWithRows(3);

		const lines = flattenLines(state.lines(TICK_0_FRAME));
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

		const [, rowOne, rowTwo] = flattenLines(state.lines(TICK_0_FRAME));
		expect(rowOne).toMatch(/^feature-1 \(#1\)\s+✓\s+⠋\s+·\s+·\s*$/);
		expect(rowTwo).toMatch(/^feature-2 \(#2\)\s+·\s+–\s+✗\s+·\s*$/);
	});

	test("active cells render the caller-supplied spinner frame", () => {
		const state = declaredWithRows(1);
		state.apply({ type: "matrix-cell", rowKey: "feature-1", columnKey: "gate", state: "active" });

		const tickZeroRow = flattenLines(state.lines(TICK_0_FRAME))[1];
		const tickOneRow = flattenLines(state.lines(TICK_1_FRAME))[1];
		expect(tickZeroRow).toContain(TICK_0_FRAME);
		expect(tickOneRow).toContain(TICK_1_FRAME);
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

		const row = flattenLines(state.lines(TICK_0_FRAME))[1];
		expect(row).toContain("retry");
		expect(row).not.toContain("too wide for gate");
		expect(row).toContain(TICK_0_FRAME);
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

		const lines = flattenLines(state.lines(TICK_0_FRAME));
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

		const lines = flattenLines(state.lines(TICK_0_FRAME));
		expect(lines[0]?.startsWith("PR")).toBe(true);
		expect(lines[1]).toContain("…");
		expect(lines[1]?.startsWith(longLabel.slice(0, 35))).toBe(true);
	});

	test("expands the branch label column to the available Pi width", () => {
		const state = new MatrixWidgetState();
		state.apply({ type: "matrix-declared", columns: LAND_COLUMNS });
		const longLabel = "pi-submit-progress-matrix-parity (#3489)";
		state.apply({ type: "matrix-rows", rows: [{ rowKey: "long", label: longLabel }] });

		const lines = flattenLines(state.lines(TICK_0_FRAME, 120));
		expect(lines[1]).toContain(longLabel);
		expect(lines[1]).not.toContain("…");
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

		expect(flattenLines(state.lines(TICK_0_FRAME)).at(-1)).toBe(
			"Running: gh pr merge 1; gt restack",
		);

		state.apply({ type: "matrix-active-operations", operations: [] });
		expect(
			flattenLines(state.lines(TICK_0_FRAME)).some((line) => line.startsWith("Running:")),
		).toBe(false);
	});
});

interface WidgetCall {
	key: string;
	value: LiveProgressWidgetContent | undefined;
}

function createWidgetHarness(theme: WidgetTheme = identityTheme) {
	const widgetCalls: WidgetCall[] = [];
	const manualTimers = createManualTimerScheduler();
	let renderRequests = 0;
	const fakeTui = {
		requestRender: (): void => {
			renderRequests += 1;
		},
	};
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
		timers: manualTimers.timers,
	});
	const factory = widgetCalls[0]?.value;
	if (typeof factory !== "function") {
		throw new Error("expected the constructor to install a component-factory widget");
	}
	const component = factory(fakeTui, theme);
	return {
		progress,
		widgetCalls,
		timers: manualTimers,
		renderRequests: () => renderRequests,
		render: (width = 100) => component.render(width),
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
		const { progress, render } = createWidgetHarness();
		try {
			for (const event of [...PHASE_EVENTS, ...MATRIX_EVENTS]) progress.applyPhaseEvent(event);
			progress.appendOutput("stdout", "merging feature-a\n");

			const lines = render();
			expect(lines[0]).toMatch(/^\/ns:flow:land \(.* elapsed\)$/);
			expect(lines[1]).toMatch(/^⠋ Preflight\s+checking stack and PRs…$/);
			expect(lines[2]).toMatch(/^· Merge/);
			expect(lines[3]).toBe("");
			expect(lines[4]).toMatch(/^Branch \/ PR\s+Gate\s+Merge\s+Verify\s+Restack\s*$/);
			expect(lines[5]).toMatch(/^feature-a \(#1\)\s+·\s+⠋\s+·\s+·\s*$/);
			expect(lines[6]).toMatch(/^feature-b \(#2\)\s+(·\s+){3}·\s*$/);
			expect(lines.at(-1)).toBe("  stdout: merging feature-a");
		} finally {
			progress.close();
		}
	});

	test("renders header plus matrix when only matrix events arrive", () => {
		const { progress, render } = createWidgetHarness();
		try {
			for (const event of MATRIX_EVENTS) progress.applyPhaseEvent(event);

			const lines = render();
			expect(lines[0]).toContain("/ns:flow:land");
			expect(lines[1]).toBe("");
			expect(lines[2]).toMatch(/^Branch \/ PR\s+Gate/);
			expect(lines).toHaveLength(5);
		} finally {
			progress.close();
		}
	});

	test("installs the widget once and reflects streamed events through requestRender", () => {
		const { progress, widgetCalls, render, renderRequests } = createWidgetHarness();
		try {
			const requestsBeforeEvents = renderRequests();
			for (const event of PHASE_EVENTS) progress.applyPhaseEvent(event);
			progress.applyPhaseEvent({
				type: "matrix-declared",
				columns: LAND_COLUMNS,
			});
			progress.applyPhaseEvent({
				type: "matrix-rows",
				rows: Array.from({ length: 12 }, (_, index) => ({
					rowKey: `feature-${index + 1}`,
					label: `feature-${index + 1} (#${index + 1})`,
				})),
			});

			expect(widgetCalls).toHaveLength(1);
			expect(renderRequests()).toBeGreaterThan(requestsBeforeEvents);
			const lines = render();
			expect(lines).toHaveLength(17);
			expect(lines.some((line) => line.startsWith("feature-12 (#12)"))).toBe(true);
			expect(lines).not.toContain("... (widget truncated)");
		} finally {
			progress.close();
		}
	});

	test("uses the full available Pi width for matrix branch labels", () => {
		const { progress, render } = createWidgetHarness();
		try {
			progress.applyPhaseEvent({ type: "matrix-declared", columns: LAND_COLUMNS });
			const longLabel = "pi-submit-progress-matrix-parity (#3489)";
			progress.applyPhaseEvent({
				type: "matrix-rows",
				rows: [{ rowKey: "feature", label: longLabel }],
			});

			const lines = render(160);
			expect(lines[3]).toContain(longLabel);
			expect(lines[3]).not.toContain("…");
		} finally {
			progress.close();
		}
	});

	test("truncates rendered widget lines to the available width", () => {
		const { progress, render } = createWidgetHarness();
		try {
			for (const event of MATRIX_EVENTS) progress.applyPhaseEvent(event);
			progress.applyPhaseEvent({
				type: "matrix-active-operations",
				operations: [{ kind: "command", display: "x".repeat(200) }],
			});

			const lines = render();
			expect(visibleWidth(lines.at(-1) ?? "")).toBe(100);
			expect(lines.at(-1)).toContain("…");
		} finally {
			progress.close();
		}
	});

	test("spinner frames advance on the tick interval and stop after close", () => {
		const { progress, render, timers } = createWidgetHarness();
		for (const event of PHASE_EVENTS) progress.applyPhaseEvent(event);

		expect(render()[1]).toMatch(/^⠋ Preflight/);
		timers.advanceMs(120);
		expect(render()[1]).toMatch(/^⠙ Preflight/);
		timers.advanceMs(120);
		expect(render()[1]).toMatch(/^⠹ Preflight/);
		expect(TICK_1_FRAME).not.toBe(TICK_2_FRAME);

		progress.close();
		expect(timers.pendingTimerCount()).toBe(0);
		expect(render()).toEqual([]);
	});

	test("render truncates every line to the render width with an ellipsis", () => {
		const { progress, render } = createWidgetHarness();
		try {
			for (const event of MATRIX_EVENTS) progress.applyPhaseEvent(event);
			progress.applyPhaseEvent({
				type: "matrix-active-operations",
				operations: [{ kind: "command", display: "x".repeat(200) }],
			});

			const narrow = render(40);
			for (const line of narrow) {
				expect(visibleWidth(line)).toBeLessThanOrEqual(40);
			}
			// truncateToWidth appends a trailing SGR reset after the ellipsis.
			expect(narrow.at(-1)).toContain("…");
			expect(visibleWidth(narrow.at(-1) ?? "")).toBe(40);

			// The old hardcoded 100-char clamp is gone: wide renders keep wide lines.
			const wide = render(140);
			expect(visibleWidth(wide.at(-1) ?? "")).toBe(140);
		} finally {
			progress.close();
		}
	});

	test("styled lines still truncate to the render width under real SGR escapes", () => {
		const { progress, render } = createWidgetHarness(sgrTheme);
		try {
			for (const event of MATRIX_EVENTS) progress.applyPhaseEvent(event);
			progress.applyPhaseEvent({
				type: "matrix-active-operations",
				operations: [{ kind: "command", display: "x".repeat(200) }],
			});

			for (const line of render(40)) {
				expect(visibleWidth(line)).toBeLessThanOrEqual(40);
			}
		} finally {
			progress.close();
		}
	});

	test("paints states with theme colors", () => {
		const { progress, render } = createWidgetHarness(sgrTheme);
		try {
			for (const event of [...PHASE_EVENTS, ...MATRIX_EVENTS]) progress.applyPhaseEvent(event);
			progress.applyPhaseEvent({ type: "phase-started", phaseKey: "merge" });
			progress.applyPhaseEvent({ type: "phase-done", phaseKey: "preflight" });
			progress.applyPhaseEvent({
				type: "phase-failed",
				phaseKey: "merge",
				detail: "merge conflict",
			});
			progress.applyPhaseEvent({
				type: "matrix-cell",
				rowKey: "feature-b",
				columnKey: "verify",
				state: "failed",
			});

			const lines = render();
			expect(lines[0]).toContain(`${SGR_OPEN.accent}/ns:flow:land${SGR_CLOSE}`);
			expect(lines[1]).toContain(`${SGR_OPEN.success}✓${SGR_CLOSE}`);
			expect(lines[2]).toContain(`${SGR_OPEN.error}✗${SGR_CLOSE}`);
			expect(lines.some((line) => line.includes(`${SGR_OPEN.accent}`))).toBe(true);
			const failedCellRow = lines.find((line) => line.includes("feature-b"));
			expect(failedCellRow).toContain(SGR_OPEN.error);
		} finally {
			progress.close();
		}
	});

	test("active matrix cells paint the spinner frame with the accent color", () => {
		const { progress, render } = createWidgetHarness(sgrTheme);
		try {
			for (const event of MATRIX_EVENTS) progress.applyPhaseEvent(event);

			const activeRow = render().find((line) => line.includes("feature-a"));
			expect(activeRow).toContain(SGR_OPEN.accent);
			expect(activeRow).toContain(TICK_0_FRAME);
		} finally {
			progress.close();
		}
	});

	test("status-only targets accept matrix events and stay plain text", () => {
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
			for (const value of statuses) {
				expect(value).not.toBe("");
				expect(value ?? "").not.toContain("");
			}
		} finally {
			progress.close();
		}
	});
});
