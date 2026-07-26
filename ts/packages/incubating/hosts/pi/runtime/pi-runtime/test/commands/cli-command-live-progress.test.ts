import { describe, expect, expectTypeOf, test } from "vitest";

import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { createManualTimerScheduler } from "@nseng-ai/foundation/time/testing";
import type { NsProgressPhaseEvent } from "@nseng-ai/sdk";

import {
	LiveCommandProgress,
	MatrixWidgetState,
} from "../../src/commands/cli-command-live-progress.ts";
import {
	buildMatrixProgressWidgetLines,
	type WidgetLine,
} from "../../src/commands/cli-command-live-progress-widget.ts";
import type {
	SetWidgetFunction,
	WidgetComponentFactory,
	WidgetContent,
	WidgetTheme,
	WidgetThemeColor,
} from "../../src/runtime/tool-types.ts";
import { ComponentWidgetFake } from "../support/widget-fakes.ts";

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

function matrixLines(
	state: MatrixWidgetState,
	activeGlyph: string,
	maxLineWidth?: number,
): WidgetLine[] {
	return buildMatrixProgressWidgetLines(state.snapshot(), activeGlyph, maxLineWidth);
}

test("canonical widget setter accepts the exact upstream Pi setter", () => {
	expectTypeOf<ExtensionUIContext["setWidget"]>().toMatchTypeOf<SetWidgetFunction>();
});

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
		expect(state.snapshot().isActive).toBe(false);
		expect(matrixLines(state, TICK_0_FRAME)).toEqual([]);

		state.apply({ type: "matrix-cell", rowKey: "feature-1", columnKey: "gate", state: "done" });
		expect(matrixLines(state, TICK_0_FRAME)).toEqual([]);
	});

	test("renders header and every row with pending glyphs after rows declared", () => {
		const state = declaredWithRows(3);

		const lines = flattenLines(matrixLines(state, TICK_0_FRAME));
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

		const [, rowOne, rowTwo] = flattenLines(matrixLines(state, TICK_0_FRAME));
		expect(rowOne).toMatch(/^feature-1 \(#1\)\s+✓\s+⠋\s+·\s+·\s*$/);
		expect(rowTwo).toMatch(/^feature-2 \(#2\)\s+·\s+–\s+✗\s+·\s*$/);
	});

	test("active cells render the caller-supplied spinner frame", () => {
		const state = declaredWithRows(1);
		state.apply({ type: "matrix-cell", rowKey: "feature-1", columnKey: "gate", state: "active" });

		const tickZeroRow = flattenLines(matrixLines(state, TICK_0_FRAME))[1];
		const tickOneRow = flattenLines(matrixLines(state, TICK_1_FRAME))[1];
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

		const row = flattenLines(matrixLines(state, TICK_0_FRAME))[1];
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

		const lines = flattenLines(matrixLines(state, TICK_0_FRAME));
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

		const lines = flattenLines(matrixLines(state, TICK_0_FRAME));
		expect(lines[0]?.startsWith("PR")).toBe(true);
		expect(lines[1]).toContain("…");
		expect(lines[1]?.startsWith(longLabel.slice(0, 35))).toBe(true);
	});

	test("expands the branch label column to the available Pi width", () => {
		const state = new MatrixWidgetState();
		state.apply({ type: "matrix-declared", columns: LAND_COLUMNS });
		const longLabel = "pi-submit-progress-matrix-parity (#3489)";
		state.apply({ type: "matrix-rows", rows: [{ rowKey: "long", label: longLabel }] });

		const lines = flattenLines(matrixLines(state, TICK_0_FRAME, 120));
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

		expect(flattenLines(matrixLines(state, TICK_0_FRAME)).at(-1)).toBe(
			"Running: gh pr merge 1; gt restack",
		);

		state.apply({ type: "matrix-active-operations", operations: [] });
		expect(
			flattenLines(matrixLines(state, TICK_0_FRAME)).some((line) => line.startsWith("Running:")),
		).toBe(false);
	});

	test("returns defensive snapshots that render independently of later events", () => {
		const state = declaredWithRows(1);
		const before = state.snapshot();

		state.apply({ type: "matrix-cell", rowKey: "feature-1", columnKey: "gate", state: "done" });

		expect(flattenLines(buildMatrixProgressWidgetLines(before, TICK_0_FRAME))[1]).toMatch(
			/^feature-1 \(#1\)\s+(·\s+){3}·\s*$/,
		);
		expect(flattenLines(matrixLines(state, TICK_0_FRAME))[1]).toContain("✓");
	});
});

interface WidgetCall {
	key: string;
	value: WidgetContent | undefined;
}

function createWidgetHarness(theme: WidgetTheme = identityTheme) {
	const widgetCalls: WidgetCall[] = [];
	const manualTimers = createManualTimerScheduler();
	const widgetFake = new ComponentWidgetFake({ theme });
	const ctx = {
		hasUI: true,
		ui: {
			setWidget: (key: string, value: WidgetContent | undefined) => {
				widgetCalls.push({ key, value });
				if (typeof value === "function") {
					widgetFake.setWidget(key, value);
					return;
				}
				widgetFake.setWidget(key, value);
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
	const component = widgetFake.activeComponent("ns-cli-command-output");
	if (component === undefined) {
		throw new Error("expected the constructor to install a component-factory widget");
	}
	return {
		progress,
		widgetCalls,
		widgetFake,
		timers: manualTimers,
		renderRequests: () => widgetFake.renderRequestCount("ns-cli-command-output"),
		render: (width = 100) => component.render(width),
	};
}

function createRenderRequestHarness(requestRender: () => void) {
	const manualTimers = createManualTimerScheduler();
	const diagnostics: unknown[] = [];
	let factory: WidgetComponentFactory | undefined;
	const progress = new LiveCommandProgress(
		{
			hasUI: true,
			ui: {
				setWidget: (_key, content) => {
					if (typeof content === "function") factory = content;
				},
			},
		},
		{
			cliName: "ns",
			commandName: "flow land",
			piCommandName: "ns:flow:land",
			argv: ["flow", "land"],
			timers: manualTimers.timers,
			onUnexpectedRenderRequestError: (error) => {
				diagnostics.push(error);
			},
		},
	);
	if (factory === undefined) throw new Error("expected a component factory");
	const component = factory({ requestRender }, identityTheme);
	return { component, diagnostics, factory, progress, timers: manualTimers };
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
		const { progress, widgetCalls, widgetFake, render, renderRequests } = createWidgetHarness();
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
			expect(widgetFake.factoryInstallCount("ns-cli-command-output")).toBe(1);
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

	test("replacement disposal detaches rendering while collector snapshots keep updating", () => {
		const { progress, renderRequests, timers, widgetFake } = createWidgetHarness();
		progress.appendOutput("stdout", "before disposal\n");
		const requestsBeforeDisposal = renderRequests();

		widgetFake.setWidget("ns-cli-command-output", ["replacement"]);
		expect(timers.pendingTimerCount()).toBe(0);
		progress.appendOutput("stdout", "after disposal\n");

		expect(renderRequests()).toBe(requestsBeforeDisposal);
		expect(progress.displaySnapshot().recentOutputLines.at(-1)).toEqual({
			stream: "stdout",
			text: "after disposal",
		});
		progress.close();
		progress.close();
		expect(timers.pendingTimerCount()).toBe(0);
	});

	test("unexpected render-request failures trace once, retain the callback, and later retry", () => {
		let shouldThrow = true;
		let attempts = 0;
		const { diagnostics, factory, progress, timers } = createRenderRequestHarness(() => {
			attempts += 1;
			if (shouldThrow) throw new Error("render transport failed");
		});

		progress.setPhase("first update");
		progress.appendOutput("stdout", "still running\n");
		expect(attempts).toBe(2);
		expect(diagnostics).toHaveLength(1);
		expect(timers.pendingTimerCount()).toBe(1);

		shouldThrow = false;
		progress.setPhase("retry succeeds");
		expect(attempts).toBe(3);
		expect(diagnostics).toHaveLength(1);

		const replacement = factory(
			{
				requestRender: () => {
					throw new Error("new callback failed");
				},
			},
			identityTheme,
		);
		progress.setPhase("new callback resets diagnostics");
		expect(diagnostics).toHaveLength(2);
		replacement.dispose?.();
		progress.close();
		expect(timers.pendingTimerCount()).toBe(0);
	});

	test("recognized stale-context request failures detach the callback and stop ticking", () => {
		let attempts = 0;
		const { progress, timers } = createRenderRequestHarness(() => {
			attempts += 1;
			throw new Error(
				"This extension ctx is stale after session replacement or reload. Do not use a captured ctx.",
			);
		});

		progress.setPhase("stale update");
		expect(attempts).toBe(1);
		expect(timers.pendingTimerCount()).toBe(0);
		progress.appendOutput("stdout", "collector continues\n");
		timers.advanceMs(1_000);
		expect(attempts).toBe(1);
		expect(progress.displaySnapshot().recentOutputLines.at(-1)?.text).toBe("collector continues");
		progress.close();
	});

	test("an older component disposal cannot clear a newer active callback", () => {
		let firstRequests = 0;
		let secondRequests = 0;
		const {
			component: firstComponent,
			factory,
			progress,
			timers,
		} = createRenderRequestHarness(() => {
			firstRequests += 1;
		});
		const secondComponent = factory(
			{
				requestRender: () => {
					secondRequests += 1;
				},
			},
			identityTheme,
		);

		firstComponent.dispose?.();
		progress.setPhase("new callback remains active");
		expect(firstRequests).toBe(0);
		expect(secondRequests).toBe(1);
		expect(timers.pendingTimerCount()).toBe(1);
		secondComponent.dispose?.();
		expect(timers.pendingTimerCount()).toBe(0);
		progress.close();
	});

	test("measures unchanged 120 ms cadence in active, idle, and settled states", () => {
		const measureRequests = (prepare: (progress: LiveCommandProgress) => void): number => {
			const harness = createWidgetHarness();
			prepare(harness.progress);
			const before = harness.renderRequests();
			harness.timers.advanceMs(360);
			const count = harness.renderRequests() - before;
			harness.progress.close();
			return count;
		};

		expect(measureRequests(() => {})).toBe(3);
		expect(
			measureRequests((progress) => {
				for (const event of PHASE_EVENTS) progress.applyPhaseEvent(event);
			}),
		).toBe(3);
		expect(
			measureRequests((progress) => {
				progress.applyPhaseEvent(PHASE_EVENTS[0]!);
				progress.applyPhaseEvent({ type: "phase-started", phaseKey: "preflight" });
				progress.applyPhaseEvent({ type: "phase-done", phaseKey: "preflight" });
			}),
		).toBe(3);
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
				expect(value ?? "").not.toContain("\u001b");
			}
		} finally {
			progress.close();
		}
	});

	test("no-UI target owns no timer while continuing to collect output", () => {
		const timers = createManualTimerScheduler();
		const progress = new LiveCommandProgress(
			{ hasUI: false, ui: {} },
			{
				cliName: "ns",
				commandName: "flow land",
				piCommandName: "ns:flow:land",
				argv: ["flow", "land"],
				timers: timers.timers,
			},
		);
		progress.appendOutput("stderr", "headless output\n");

		expect(timers.pendingTimerCount()).toBe(0);
		expect(progress.displaySnapshot().recentOutputLines).toEqual([
			{ stream: "stderr", text: "headless output" },
		]);
		progress.close();
	});
});
