import { describe, expect, test, vi } from "vitest";

import { createManualClock, createManualTimerScheduler } from "@nseng-ai/foundation/time/testing";
import type { RunnerSubagentUpdate } from "@internal/ns-pi-subagents/runner-subagents";
import { SubagentFleetRegistry } from "../../src/fleet/registry.ts";
import type { CommandContext } from "@nseng-ai/pi/runtime/extension-types";

import {
	SUBAGENT_FLEET_COMMAND_NAME,
	SUBAGENT_FLEET_SHORTCUTS,
	SubagentFleetNavigator,
	loadFleetTaskDetail,
	registerSubagentFleetCommand,
	registerSubagentFleetShortcut,
	type SubagentFleetNavigatorContext,
} from "../../src/fleet/navigator.ts";
import {
	loadFleetEntryDetail,
	postRunDiagnostic,
	sessionContentSignature,
	type FleetDetailContext,
	type FleetEntrySessionParseCache,
} from "../../src/fleet/detail.ts";
import { renderTimelineEntryLines } from "../../src/fleet/detail-render.ts";
import type { ReadTextFile } from "../../src/fleet/read-text-dependencies.ts";
import { settleMicrotasks } from "../helpers/fleet-testing.ts";

function jsonl(events: readonly unknown[]): string {
	return events.map((event) => JSON.stringify(event)).join("\n");
}

function assistantMessage(text: string): unknown {
	return { role: "assistant", content: [{ type: "text", text }] };
}

function sessionJsonl(extraEvents: readonly unknown[] = []): string {
	return jsonl([
		{ type: "session", file: "/tmp/one.jsonl" },
		{ type: "model_change", provider: "openai-codex", modelId: "gpt-5.4" },
		{ type: "turn_start" },
		{
			type: "tool_execution_start",
			toolName: "read",
			toolCallId: "tool-1",
			args: { path: "a.ts" },
		},
		{
			type: "tool_execution_end",
			toolName: "read",
			toolCallId: "tool-1",
			result: { content: [{ type: "text", text: "contents" }] },
		},
		{ type: "message_end", message: assistantMessage("Found details") },
		...extraEvents,
	]);
}

function updateWithSessionFile(sessionFile: string): RunnerSubagentUpdate {
	return {
		progress: {
			state: "running",
			toolCount: 0,
			turnCount: 0,
			elapsedMs: 0,
			sessionFile,
		},
		activity: {},
	};
}

function testDetailContext(
	input: {
		readTextFile?: ReadTextFile;
	} = {},
): FleetDetailContext {
	return {
		readTextFile: input.readTextFile ?? (() => Promise.resolve(sessionJsonl())),
	};
}

function noUiCommandContext(notifications: string[]): CommandContext {
	return {
		cwd: "/repo",
		hasUI: false,
		mode: "json",
		ui: {
			notify(message: string) {
				notifications.push(message);
			},
			setStatus() {},
		},
		waitForIdle: async () => {},
	} as CommandContext;
}

const CSI_UP = "\u001b[1;1A";
const CSI_DOWN = "\u001b[1;1B";

describe("subagent fleet navigator", () => {
	test("renders successful tool rows as a single line without raw JSON argument blobs", () => {
		expect(
			renderTimelineEntryLines({
				kind: "tool",
				toolName: "read",
				state: "ok",
				inputPreview: '{"path":"ts/packages/kernel/src/cli/index.ts","limit":100}',
				resultPreview: '#!/usr/bin/env node import { z } from "zod";',
			}),
		).toEqual(["✓ read · path: ts/packages/kernel/src/cli/index.ts · limit: 100"]);
	});

	test("renders path-display tool rows with relative and abbreviated paths", () => {
		const entry = {
			kind: "tool",
			toolName: "read",
			state: "ok",
			invocation: { kind: "fields", fields: { path: "/repo/src/index.ts" } },
		} as const;
		expect(renderTimelineEntryLines(entry, { sessionCwd: "/repo", homeDir: "/Users/dev" })).toEqual(
			["✓ read src/index.ts"],
		);
		expect(renderTimelineEntryLines(entry, { sessionCwd: "/elsewhere", homeDir: "/repo" })).toEqual(
			["✓ read ~/src/index.ts"],
		);
		expect(renderTimelineEntryLines(entry, {})).toEqual(["✓ read /repo/src/index.ts"]);
		expect(
			renderTimelineEntryLines({
				...entry,
				invocation: { kind: "fields", fields: { path: "docs/notes.md" } },
			}),
		).toEqual(["✓ read docs/notes.md"]);
	});

	test("renders command-display tool rows without a tool label", () => {
		expect(
			renderTimelineEntryLines({
				kind: "tool",
				toolName: "bash",
				state: "ok",
				invocation: { kind: "text", text: "just ts-check" },
			}),
		).toEqual(["✓ just ts-check"]);
	});

	test.each([
		{
			toolName: "functions.read",
			invocation: { kind: "fields", fields: { path: "src/a.ts" } },
			expected: "✓ functions.read src/a.ts",
		},
		{
			toolName: "functions.write",
			invocation: { kind: "fields", fields: { path: "src/a.ts" } },
			expected: "✓ functions.write src/a.ts",
		},
		{
			toolName: "functions.edit",
			invocation: { kind: "fields", fields: { path: "src/a.ts" } },
			expected: "✓ functions.edit src/a.ts",
		},
		{
			toolName: "functions.bash",
			invocation: { kind: "text", text: "just test" },
			expected: "✓ just test",
		},
	] as const)("renders the exact $toolName alias policy", ({ toolName, invocation, expected }) => {
		expect(renderTimelineEntryLines({ kind: "tool", toolName, state: "ok", invocation })).toEqual([
			expected,
		]);
	});

	test("does not specialize unknown aliases or malformed projections", () => {
		expect(
			renderTimelineEntryLines({
				kind: "tool",
				toolName: "vendor.read",
				state: "ok",
				inputPreview: '{"path":"src/a.ts"}',
				invocation: { kind: "fields", fields: { path: "src/a.ts" } },
			}),
		).toEqual(["✓ vendor.read · path: src/a.ts"]);
		expect(
			renderTimelineEntryLines({
				kind: "tool",
				toolName: "read",
				state: "ok",
				inputPreview: '{"command":"just test"}',
				invocation: { kind: "fields", fields: { command: "just test" } },
			}),
		).toEqual(["✓ read · command: just test"]);
	});

	test("keeps the error result line and indents it under the icon column", () => {
		expect(
			renderTimelineEntryLines(
				{
					kind: "tool",
					toolName: "bash",
					state: "error",
					timestampMs: Date.parse("2026-07-11T09:12:09.000Z"),
					resultPreview: "error: TS2345",
					invocation: { kind: "text", text: "just ts-check" },
				},
				{ timeZone: "UTC" },
			),
		).toEqual(["09:12:09 ✗ just ts-check", "           ↳ error: TS2345"]);
	});

	test("stamps timeline rows with pinned-time HH:MM:SS prefixes", () => {
		expect(
			renderTimelineEntryLines(
				{
					kind: "assistant",
					text: "Fixed the type error; rerunning validation.",
					timestampMs: Date.parse("2026-07-11T09:12:31.000Z"),
				},
				{ timeZone: "UTC" },
			),
		).toEqual(["09:12:31 ● assistant: Fixed the type error; rerunning validation."]);
	});

	test("renders nested tool preview records through the same compact formatter", () => {
		expect(
			renderTimelineEntryLines({
				kind: "tool",
				toolName: "dispatch_runner_subagent",
				state: "ok",
				inputPreview:
					'{"title":"Scout","options":{"model":"fast","metadata":{"branch":"main"}},"files":["a.ts","b.ts"]}',
			}),
		).toEqual([
			"✓ dispatch_runner_subagent · title: Scout · options: { model: fast · metadata: {…} } · files: a.ts, b.ts",
		]);
	});

	test("loads detail with usage totals from JSONL through the readTextFile seam", async () => {
		const detail = await loadFleetTaskDetail({
			task: {
				id: "task-1",
				runId: "run-1",
				index: 0,
				title: "Scout one",
				state: "running",
				sessionFile: "/tmp/one.jsonl",
			},
			context: testDetailContext({
				readTextFile: async () =>
					sessionJsonl([
						{
							type: "message",
							message: {
								role: "assistant",
								usage: {
									input: 1200,
									output: 300,
									cacheRead: 41_000,
									cacheWrite: 0,
									totalTokens: 42_500,
									contextWindow: 200_000,
									cost: {
										input: 0.01,
										output: 0.02,
										cacheRead: 0.005,
										cacheWrite: 0,
										total: 0.035,
									},
								},
							},
						},
						{
							type: "message",
							message: {
								role: "assistant",
								usage: {
									input: 400,
									output: 8,
									cacheRead: 0,
									cacheWrite: 0,
									totalTokens: 408,
									cost: { input: 0.002, output: 0.004, cacheRead: 0, cacheWrite: 0, total: 0.006 },
								},
							},
						},
					]),
			}),
		});

		expect(detail.modelText).toBe("openai-codex/gpt-5.4");
		expect(detail.turnCount).toBe(1);
		expect(detail.toolCount).toBe(1);
		expect(detail.timeline.entries).toContainEqual({ kind: "assistant", text: "Found details" });
		expect(detail.timeline.entries).toContainEqual({
			kind: "tool",
			toolName: "read",
			state: "ok",
			inputPreview: '{"path":"a.ts"}',
			resultPreview: "contents",
			invocation: { kind: "fields", fields: { path: "a.ts" } },
		});
		if (detail.usage?.status !== "available") throw new Error("expected available usage");
		expect(detail.usage.totals.input).toBe(1600);
		expect(detail.usage.totals.output).toBe(308);
		expect(detail.usage.totals.cost.total).toBeCloseTo(0.041);
		expect(detail.usage.trend).toEqual({
			latestTurn: {
				input: 400,
				output: 8,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 408,
				cost: { input: 0.002, output: 0.004, cacheRead: 0, cacheWrite: 0, total: 0.006 },
			},
			peakPromptTokens: 42_200,
			peakTotalTokens: 42_500,
			contextWindow: 200_000,
		});
	});

	test("loads detail activity from top-level message-only JSONL", async () => {
		const detail = await loadFleetTaskDetail({
			task: {
				id: "task-1",
				runId: "run-1",
				index: 0,
				title: "Scout one",
				state: "running",
				sessionFile: "/tmp/message-only.jsonl",
			},
			context: testDetailContext({
				readTextFile: async () =>
					jsonl([
						{ type: "session", file: "/tmp/message-only.jsonl" },
						{
							type: "message",
							message: {
								role: "assistant",
								content: [
									{ type: "text", text: "Reading files" },
									{ type: "toolCall", id: "tool-1", name: "read", input: { path: "README.md" } },
								],
							},
						},
						{
							type: "message",
							message: {
								role: "toolResult",
								toolCallId: "tool-1",
								content: [{ type: "text", text: "file contents" }],
							},
						},
					]),
			}),
		});

		expect(detail.turnCount).toBe(1);
		expect(detail.toolCount).toBe(1);
		expect(detail.timeline.entries).toEqual([
			{ kind: "assistant", text: "Reading files" },
			{
				kind: "tool",
				toolName: "read",
				state: "ok",
				inputPreview: '{"path":"README.md"}',
				resultPreview: "file contents",
				invocation: { kind: "fields", fields: { path: "README.md" } },
			},
		]);
		expect(detail.timeline.currentAction).toEqual({ kind: "idle" });
	});

	test("renders peak prompt tokens on the header usage line without a trend line", async () => {
		const registry = new SubagentFleetRegistry();
		const run = registry.startRun([{ title: "Usage trend" }]);
		const task = run.tasks[0];
		if (task === undefined) throw new Error("missing task fixture");
		registry.markRunning(task.id);
		registry.markProgress(task.id, updateWithSessionFile("/tmp/usage-trend.jsonl"));
		const view = new SubagentFleetNavigator({
			tui: { requestRender: () => {} },
			registry,
			detailContext: testDetailContext({
				readTextFile: async () =>
					sessionJsonl([
						{
							type: "message",
							message: {
								role: "assistant",
								usage: { input: 1000, output: 20, cacheRead: 200, totalTokens: 1220 },
							},
						},
						{
							type: "message",
							message: {
								role: "assistant",
								usage: { input: 400, output: 8, cacheRead: 0, totalTokens: 408 },
							},
						},
					]),
			}),
			done: () => {},
		});

		view.handleInput("\r");
		await settleMicrotasks();
		const detail = view.render(140).join("\n");
		expect(detail).toContain("tokens: 1.4k in · 28 out · 200 cached · $0.000 · peak 1.2k");
		expect(detail).not.toContain("trend:");
	});

	test("moves the list selection with CSI arrows while preserving vim keys", () => {
		const registry = new SubagentFleetRegistry();
		const run = registry.startRun([{ title: "Second" }, { title: "First" }]);
		const second = run.tasks[0];
		const first = run.tasks[1];
		if (second === undefined || first === undefined) throw new Error("missing task fixtures");
		registry.markRunning(first.id);
		registry.markProgress(second.id, updateWithSessionFile("/tmp/two.jsonl"));
		const view = new SubagentFleetNavigator({
			tui: { requestRender: () => {} },
			registry,
			detailContext: testDetailContext(),
			done: () => {},
		});

		expect(view.render(100).join("\n")).toContain("▸ ▶ First");
		view.handleInput(CSI_DOWN);
		expect(view.render(100).join("\n")).toContain("▸ · Second");
		view.handleInput(CSI_UP);
		expect(view.render(100).join("\n")).toContain("▸ ▶ First");
		view.handleInput("j");
		expect(view.render(100).join("\n")).toContain("▸ · Second");
		view.handleInput("k");
		expect(view.render(100).join("\n")).toContain("▸ ▶ First");
	});

	test("toggles a per-entry header and latest-session-message preview with spacebar", async () => {
		const manualClock = createManualClock(10_000);
		const registry = new SubagentFleetRegistry({ clock: manualClock.clock });
		const run = registry.startRun([{ title: "Second" }, { title: "First" }]);
		const second = run.tasks[0]!;
		const first = run.tasks[1]!;
		registry.markRunning(first.id);
		registry.markProgress(first.id, updateWithSessionFile("/tmp/one.jsonl"));
		manualClock.advanceMs(65_000);
		const view = new SubagentFleetNavigator({
			tui: { requestRender: () => {} },
			registry,
			detailContext: testDetailContext(),
			done: () => {},
			clock: manualClock.clock,
			homeDir: "/home/dev",
		});

		expect(view.render(120).join("\n")).not.toContain("session:");

		view.handleInput(" ");
		await settleMicrotasks();
		const expanded = view.render(120).join("\n");
		expect(expanded).toContain(
			"stopped · running · openai-codex/gpt-5.4 · 1 turns / 1 tools · 1m 05s",
		);
		expect(expanded).toContain("session: /tmp/one.jsonl");
		expect(expanded).toContain("latest: ● assistant: Found details");

		// The other entry stays collapsed until toggled independently.
		view.handleInput("j");
		view.handleInput(" ");
		await settleMicrotasks();
		const bothExpanded = view.render(120).join("\n");
		expect(bothExpanded).toContain("latest: ● assistant: Found details");
		expect(bothExpanded).toContain("no session file yet");

		// Space toggles each entry back off without touching the other.
		view.handleInput(" ");
		expect(
			view
				.render(120)
				.join("\n")
				.match(/latest: /g),
		).toHaveLength(1);
		view.handleInput("k");
		view.handleInput(" ");
		expect(view.render(120).join("\n")).not.toContain("latest:");

		// Expansion state is per-task, so registry updates do not expand another task.
		view.handleInput(" ");
		registry.markDone(second.id, {
			status: "final-text",
			finalText: "done",
			elapsedMs: 42_000,
			progress: { state: "stopped", toolCount: 1, turnCount: 1, elapsedMs: 42_000 },
			sessionFile: "/tmp/two.jsonl",
		});
		await settleMicrotasks();
		const afterDone = view.render(120).join("\n");
		expect(afterDone).toContain("latest: ● assistant: Found details");
		expect(afterDone.match(/session: /g)).toHaveLength(1);
	});

	test("windows expanded previews as whole entry blocks and counts omitted entries", async () => {
		const registry = new SubagentFleetRegistry();
		const run = registry.startRun([
			{ title: "Selected" },
			{ title: "Queued 1" },
			{ title: "Queued 2" },
			{ title: "Queued 3" },
			{ title: "Queued 4" },
			{ title: "Queued 5" },
		]);
		const selected = run.tasks[0]!;
		registry.markRunning(selected.id);
		registry.markProgress(selected.id, updateWithSessionFile("/tmp/selected.jsonl"));
		const view = new SubagentFleetNavigator({
			tui: { requestRender: () => {}, terminal: { rows: 16 } },
			registry,
			detailContext: testDetailContext(),
			done: () => {},
		});

		view.handleInput(" ");
		await settleMicrotasks();
		const rendered = view.render(120).join("\n");
		expect(rendered).toContain("▸ ▶ Selected");
		expect(rendered).toContain("latest: ● assistant: Found details");
		expect(rendered).toContain("… 5 more");
		expect(rendered).not.toContain("… 9 more");
	});

	test("scrolls detail with CSI arrows while preserving vim keys", async () => {
		const manualClock = createManualClock(0);
		const registry = new SubagentFleetRegistry({ clock: manualClock.clock });
		const run = registry.startRun([{ title: "Scrollable", prompt: "short prompt" }]);
		const task = run.tasks[0];
		if (task === undefined) throw new Error("missing task fixture");
		registry.markRunning(task.id);
		registry.markProgress(task.id, updateWithSessionFile("/tmp/scrollable.jsonl"));
		const content = sessionJsonl(
			Array.from({ length: 20 }, (_, index) => ({
				type: "message_end",
				message: assistantMessage(`detail line ${index}`),
			})),
		);
		const view = new SubagentFleetNavigator({
			tui: { requestRender: () => {}, terminal: { rows: 9 } },
			registry,
			detailContext: testDetailContext({ readTextFile: async () => content }),
			done: () => {},
			clock: manualClock.clock,
		});

		view.handleInput("\r");
		await settleMicrotasks();
		const bottom = view.render(100).join("\n");
		view.handleInput(CSI_UP);
		const afterCsiUp = view.render(100).join("\n");
		expect(afterCsiUp).not.toBe(bottom);
		view.handleInput(CSI_DOWN);
		expect(view.render(100).join("\n")).toBe(bottom);
		view.handleInput("k");
		const afterVimUp = view.render(100).join("\n");
		expect(afterVimUp).not.toBe(bottom);
		view.handleInput("j");
		expect(view.render(100).join("\n")).toBe(bottom);
	});

	test("footer follow indicator tracks wrapped lines below the viewport", async () => {
		const registry = new SubagentFleetRegistry();
		const run = registry.startRun([{ title: "Tall" }]);
		const task = run.tasks[0];
		if (task === undefined) throw new Error("missing task fixture");
		registry.markRunning(task.id);
		registry.markProgress(task.id, updateWithSessionFile("/tmp/tall.jsonl"));
		const tallContent = (lineCount: number) =>
			sessionJsonl(
				Array.from({ length: lineCount }, (_, index) => ({
					type: "message_end",
					message: assistantMessage(`detail line ${index}`),
				})),
			);
		let content = tallContent(20);
		const view = new SubagentFleetNavigator({
			tui: { requestRender: () => {}, terminal: { rows: 9 } },
			registry,
			detailContext: testDetailContext({ readTextFile: async () => content }),
			done: () => {},
		});

		view.handleInput("\r");
		await settleMicrotasks();
		expect(view.render(100).join("\n")).toContain("f follow ●");

		view.handleInput("k");
		expect(view.render(100).join("\n")).toContain("↓ 1 below · f follow");

		view.handleInput("j");
		expect(view.render(100).join("\n")).toContain("f follow ●");

		view.handleInput("k");
		view.render(100);
		content = tallContent(23);
		view.handleInput("r");
		await settleMicrotasks();
		expect(view.render(100).join("\n")).toContain("↓ 4 below · f follow");
	});

	test("drives list, detail, prompt toggle, live reload, back, and close", async () => {
		const registry = new SubagentFleetRegistry();
		const run = registry.startRun([
			{ title: "Second" },
			{ title: "First", prompt: "Map the investigator command.\nList call sites." },
		]);
		const second = run.tasks[0]!;
		const first = run.tasks[1]!;
		registry.markRunning(first.id);
		registry.markProgress(first.id, updateWithSessionFile("/tmp/one.jsonl"));
		registry.markProgress(second.id, updateWithSessionFile("/tmp/two.jsonl"));
		let content = sessionJsonl();
		let renderRequests = 0;
		let doneCalls = 0;
		const view = new SubagentFleetNavigator({
			tui: {
				requestRender: () => {
					renderRequests += 1;
				},
			},
			registry,
			detailContext: testDetailContext({ readTextFile: async () => content }),
			done: () => {
				doneCalls += 1;
			},
		});

		const list = view.render(100).join("\n");
		expect(list).toContain("▸ ▶ First");
		expect(list).toContain("  · Second");

		view.handleInput("j");
		expect(view.render(100).join("\n")).toContain("▸ · Second");
		view.handleInput("k");
		view.handleInput("\r");
		await settleMicrotasks();
		expect(view.render(100).join("\n")).toContain("openai-codex/gpt-5.4");
		expect(view.render(100).join("\n")).toContain("✓ read");
		expect(view.render(100).join("\n")).toContain("prompt: Map the investigator command.");
		expect(view.render(100).join("\n")).not.toContain("List call sites.");
		view.handleInput("p");
		expect(view.render(100).join("\n")).toContain("List call sites.");
		view.handleInput("p");

		content = sessionJsonl([
			{ type: "tool_execution_start", toolName: "bash", toolCallId: "tool-2", args: "just test" },
		]);
		registry.markProgress(first.id, {
			progress: {
				state: "running",
				toolCount: 1,
				turnCount: 1,
				elapsedMs: 10,
				sessionFile: "/tmp/one.jsonl",
			},
			activity: { currentToolInputPreview: "just test" },
		});
		await vi.waitFor(() => expect(view.render(100).join("\n")).toContain("▶ bash · just test"));

		view.handleInput("b");
		expect(view.render(100).join("\n")).toContain("subagent fleet:");
		view.handleInput("q");
		expect(doneCalls).toBe(1);
		expect(renderRequests).toBeGreaterThan(0);
	});

	test("renders post-run summary for completed task details", async () => {
		const registry = new SubagentFleetRegistry();
		const run = registry.startRun([{ title: "Done" }]);
		const task = run.tasks[0];
		if (task === undefined) throw new Error("missing task fixture");
		registry.markTaskHeadBaseline(task.id, { status: "available", oid: "abcdef123456" });
		registry.markDone(task.id, {
			status: "final-text",
			finalText: "done",
			elapsedMs: 5,
			progress: { state: "stopped", toolCount: 1, turnCount: 1, elapsedMs: 5 },
			sessionFile: "/tmp/done.jsonl",
		});
		registry.markTaskFinalHead(task.id, { status: "available", oid: "fedcba654321" });
		const view = new SubagentFleetNavigator({
			tui: { requestRender: () => {} },
			registry,
			detailContext: testDetailContext(),
			done: () => {},
		});

		view.handleInput("\r");
		await settleMicrotasks();
		const detail = view.render(120).join("\n");
		expect(detail).toContain("final-text · commit: HEAD changed abcdef1 → fedcba6");
		expect(detail).toContain("── run finished · final-text ──");
		expect(detail.indexOf("✓ read")).toBeGreaterThan(-1);
		expect(detail.indexOf("── run finished · final-text ──")).toBeGreaterThan(
			detail.indexOf("✓ read"),
		);
		expect(detail).not.toContain("post-run summary:");
		expect(detail).not.toContain("current action:");
	});

	test("renders unavailable post-run commit status gracefully", async () => {
		const detail = await loadFleetTaskDetail({
			task: {
				id: "task-1",
				runId: "run-1",
				index: 0,
				title: "No head",
				state: "done",
				finalStatus: "error",
				sessionFile: "/tmp/no-head.jsonl",
			},
			context: testDetailContext({ readTextFile: async () => sessionJsonl() }),
		});

		expect(detail.postRunSummary?.commit).toEqual({
			status: "unavailable",
			reason: "missing baseline HEAD",
		});
		expect(detail.postRunSummary?.lastDiagnostic).toBe("unavailable; final status error");
	});

	test("reports unavailable diagnostics for non-success typed final statuses", () => {
		expect(
			postRunDiagnostic(
				{
					progress: { state: "stopped", toolCount: 0, turnCount: 0, elapsedMs: 0 },
					activity: {},
					terminalAttempted: false,
					hasTerminalSucceeded: false,
				},
				"blocked",
			),
		).toBe("unavailable; final status blocked");
	});

	test("reuses cached session parses while recomposing fresh task state", async () => {
		const registry = new SubagentFleetRegistry();
		const run = registry.startRun([{ title: "Cached done" }]);
		const task = run.tasks[0];
		if (task === undefined) throw new Error("missing task fixture");
		registry.markRunning(task.id);
		registry.markProgress(task.id, updateWithSessionFile("/tmp/cached.jsonl"));
		let sessionReadCount = 0;
		const content = sessionJsonl();
		const view = new SubagentFleetNavigator({
			tui: { requestRender: () => {} },
			registry,
			detailContext: testDetailContext({
				readTextFile: async () => {
					sessionReadCount += 1;
					return content;
				},
			}),
			done: () => {},
		});

		view.handleInput("\r");
		await settleMicrotasks();
		expect(sessionReadCount).toBe(1);
		expect(view.render(120).join("\n")).toContain("stopped · running");

		registry.markDone(task.id, {
			status: "final-text",
			finalText: "done",
			elapsedMs: 5,
			progress: { state: "stopped", toolCount: 1, turnCount: 1, elapsedMs: 5 },
			sessionFile: "/tmp/cached.jsonl",
		});
		await settleMicrotasks();

		const detail = view.render(120).join("\n");
		expect(sessionReadCount).toBe(2);
		expect(detail).toContain("stopped · final-text");
		expect(detail).toContain("final-text · commit: unavailable (missing baseline HEAD)");
		expect(detail).toContain("── run finished · final-text ──");
		expect(detail).toContain("✓ read");
	});

	test("loadFleetEntryDetail skips parsing when previous session signature matches", async () => {
		const content = sessionJsonl();
		const previous: FleetEntrySessionParseCache = {
			signature: sessionContentSignature(content),
			snapshot: {
				progress: { state: "running", toolCount: 7, turnCount: 3, elapsedMs: 42 },
				activity: {},
				terminalAttempted: false,
				hasTerminalSucceeded: false,
			},
			timeline: {
				entries: [{ kind: "assistant", text: "cached timeline" }],
				droppedEntryCount: 0,
				currentAction: { kind: "thinking" },
			},
			usage: {
				status: "unavailable",
				source: "child-session-file",
				sessionFile: "/tmp/cached.jsonl",
				reason: "no-assistant-usage",
				diagnostic: "cached usage",
			},
		};

		const loaded = await loadFleetEntryDetail({
			entry: {
				kind: "task",
				task: {
					id: "task-1",
					runId: "run-1",
					index: 0,
					title: "Cached",
					state: "running",
					sessionFile: "/tmp/cached.jsonl",
				},
			},
			context: testDetailContext({ readTextFile: async () => content }),
			previous,
		});

		expect(loaded.sessionParseCache).toBe(previous);
		expect(loaded.detail.toolCount).toBe(7);
		expect(loaded.detail.turnCount).toBe(3);
		expect(loaded.detail.timeline.entries).toEqual([
			{ kind: "assistant", text: "cached timeline" },
		]);
		expect(loaded.detail.usage).toMatchObject({ diagnostic: "cached usage" });
	});

	test("manual reload recovers after a synchronous first detail read failure", async () => {
		const registry = new SubagentFleetRegistry();
		const run = registry.startRun([{ title: "Flaky" }]);
		const task = run.tasks[0];
		if (task === undefined) throw new Error("missing task fixture");
		registry.markRunning(task.id);
		registry.markProgress(task.id, updateWithSessionFile("/tmp/flaky.jsonl"));
		let readCount = 0;
		const view = new SubagentFleetNavigator({
			tui: { requestRender: () => {} },
			registry,
			detailContext: testDetailContext({
				readTextFile: () => {
					readCount += 1;
					if (readCount === 1) throw new Error("first read failed");
					return Promise.resolve(sessionJsonl());
				},
			}),
			done: () => {},
		});

		view.handleInput("\r");
		await settleMicrotasks();
		expect(view.render(120).join("\n")).toContain("Could not read session file: first read failed");

		view.handleInput("r");
		await settleMicrotasks();
		const detail = view.render(120).join("\n");
		expect(readCount).toBe(2);
		expect(detail).toContain("openai-codex/gpt-5.4");
		expect(detail).toContain("✓ read");
		expect(detail).not.toContain("first read failed");
	});

	test("auto-refreshes running task detail and tracks observed quiet time", async () => {
		const registry = new SubagentFleetRegistry();
		const run = registry.startRun([{ title: "Live" }]);
		const task = run.tasks[0];
		if (task === undefined) throw new Error("missing task fixture");
		registry.markRunning(task.id);
		registry.markProgress(task.id, updateWithSessionFile("/tmp/live.jsonl"));
		let content = sessionJsonl([
			{ type: "tool_execution_start", toolName: "bash", toolCallId: "tool-1", args: "just test" },
		]);
		let readCount = 0;
		const manualClock = createManualClock(0);
		const manualTimers = createManualTimerScheduler();
		const view = new SubagentFleetNavigator({
			tui: { requestRender: () => {} },
			registry,
			detailContext: testDetailContext({
				readTextFile: async () => {
					readCount += 1;
					return content;
				},
			}),
			done: () => {},
			clock: manualClock.clock,
			timers: manualTimers.timers,
			detailRefreshIntervalMs: 1_000,
		});

		view.handleInput("\r");
		await settleMicrotasks();
		expect(readCount).toBe(1);
		expect(manualTimers.pendingTimerCount()).toBe(1);
		expect(view.render(100).join("\n")).toContain("▶ bash · just test · quiet 0s");

		manualClock.advanceMs(2_000);
		manualTimers.advanceMs(1_000);
		await settleMicrotasks();
		expect(readCount).toBe(2);
		expect(view.render(100).join("\n")).toContain("· quiet 2s");

		content = sessionJsonl([
			{ type: "tool_execution_start", toolName: "bash", toolCallId: "tool-1", args: "just test" },
			{
				type: "tool_execution_update",
				toolName: "bash",
				toolCallId: "tool-1",
				partialResult: "still running",
			},
		]);
		manualClock.advanceMs(500);
		manualTimers.advanceMs(1_000);
		await settleMicrotasks();
		expect(readCount).toBe(3);
		expect(view.render(100).join("\n")).toContain("· quiet 0s");
		expect(view.render(100).join("\n")).toContain("↳ still running");

		view.handleInput("b");
		expect(manualTimers.pendingTimerCount()).toBe(0);
		manualTimers.advanceMs(5_000);
		await settleMicrotasks();
		expect(readCount).toBe(3);
	});

	test("auto-refreshes the latest message while a running entry stays expanded", async () => {
		const registry = new SubagentFleetRegistry();
		const run = registry.startRun([{ title: "Live preview" }]);
		const task = run.tasks[0]!;
		registry.markRunning(task.id);
		registry.markProgress(task.id, updateWithSessionFile("/tmp/live-preview.jsonl"));
		let content = sessionJsonl();
		const manualTimers = createManualTimerScheduler();
		const view = new SubagentFleetNavigator({
			tui: { requestRender: () => {} },
			registry,
			detailContext: testDetailContext({ readTextFile: async () => content }),
			done: () => {},
			timers: manualTimers.timers,
			detailRefreshIntervalMs: 1_000,
		});

		view.handleInput(" ");
		await settleMicrotasks();
		expect(view.render(120).join("\n")).toContain("latest: ● assistant: Found details");
		expect(manualTimers.pendingTimerCount()).toBe(1);

		content = sessionJsonl([{ type: "message_end", message: assistantMessage("Still working") }]);
		manualTimers.advanceMs(1_000);
		await settleMicrotasks();
		expect(view.render(120).join("\n")).toContain("latest: ● assistant: Still working");

		view.handleInput(" ");
		expect(manualTimers.pendingTimerCount()).toBe(0);
	});

	test("renders running duration from the lifecycle transition and advances with the clock", async () => {
		const manualClock = createManualClock(Date.parse("2026-07-11T09:12:20.000Z"));
		const registry = new SubagentFleetRegistry({ clock: manualClock.clock });
		const run = registry.startRun([{ title: "Timed" }]);
		const task = run.tasks[0];
		if (task === undefined) throw new Error("missing task fixture");
		registry.markRunning(task.id);
		registry.markProgress(task.id, updateWithSessionFile("/tmp/timed.jsonl"));
		manualClock.advanceMs(7_000);
		const manualTimers = createManualTimerScheduler();
		const view = new SubagentFleetNavigator({
			tui: { requestRender: () => {} },
			registry,
			detailContext: testDetailContext({
				readTextFile: async () =>
					sessionJsonl([
						{
							type: "message_end",
							timestamp: "2026-07-11T09:00:00.000Z",
							message: assistantMessage("begin"),
						},
					]),
			}),
			done: () => {},
			clock: manualClock.clock,
			timers: manualTimers.timers,
			detailRefreshIntervalMs: 1_000,
		});

		view.handleInput("\r");
		await settleMicrotasks();
		expect(view.render(120).join("\n")).toContain("· 7s");

		manualClock.advanceMs(5_000);
		expect(view.render(120).join("\n")).toContain("· 12s");
	});

	test("uses terminal elapsed time and leaves incomplete lifecycle states unknown", async () => {
		const doneTask = {
			id: "task-1",
			runId: "run-1",
			index: 0,
			title: "Done",
			state: "done",
			finalStatus: "final-text",
			finalElapsedMs: 5_000,
			sessionFile: "/tmp/done.jsonl",
		} as const;
		const completedDetail = await loadFleetTaskDetail({
			task: doneTask,
			context: testDetailContext({
				readTextFile: async () =>
					sessionJsonl([
						{
							type: "message_end",
							timestamp: "2026-07-11T09:00:00.000Z",
							message: assistantMessage("begin"),
						},
						{
							type: "message_end",
							timestamp: "2026-07-11T09:12:27.000Z",
							message: assistantMessage("end"),
						},
					]),
			}),
		});
		expect(completedDetail.duration).toEqual({ kind: "completed", elapsedMs: 5_000 });

		for (const task of [
			{
				id: "queued",
				runId: "run-1",
				index: 0,
				title: "Queued",
				state: "queued" as const,
				sessionFile: "/tmp/done.jsonl",
			},
			{
				id: "running",
				runId: "run-1",
				index: 0,
				title: "Running",
				state: "running" as const,
				sessionFile: "/tmp/done.jsonl",
			},
			{
				id: "done",
				runId: "run-1",
				index: 0,
				title: "Done",
				state: "done" as const,
				sessionFile: "/tmp/done.jsonl",
			},
		]) {
			const detail = await loadFleetTaskDetail({ task, context: testDetailContext() });
			expect(detail.duration).toEqual({ kind: "unknown" });
		}

		const parent = await loadFleetEntryDetail({
			entry: {
				kind: "parent",
				id: "parent-session",
				title: "Parent",
				sessionFile: "/tmp/parent.jsonl",
			},
			context: testDetailContext({
				readTextFile: async () =>
					sessionJsonl([
						{
							type: "message_end",
							timestamp: "2026-07-11T09:12:27.000Z",
							message: assistantMessage("late parent event"),
						},
					]),
			}),
		});
		expect(parent.detail.duration).toEqual({ kind: "unknown" });
	});

	test("does not poll parent or completed task detail screens", async () => {
		const registry = new SubagentFleetRegistry();
		const run = registry.startRun([{ title: "Done" }], { parentSessionFile: "/tmp/parent.jsonl" });
		const task = run.tasks[0];
		if (task === undefined) throw new Error("missing task fixture");
		registry.markDone(task.id, {
			status: "final-text",
			finalText: "done",
			elapsedMs: 5,
			progress: { state: "stopped", toolCount: 1, turnCount: 1, elapsedMs: 5 },
			sessionFile: "/tmp/done.jsonl",
		});
		const manualTimers = createManualTimerScheduler();
		const view = new SubagentFleetNavigator({
			tui: { requestRender: () => {} },
			registry,
			detailContext: testDetailContext(),
			done: () => {},
			timers: manualTimers.timers,
		});

		view.handleInput("k");
		view.handleInput("\r");
		await settleMicrotasks();
		expect(view.render(100).join("\n")).toContain("Parent Pi session");
		expect(manualTimers.pendingTimerCount()).toBe(0);

		view.handleInput("b");
		view.handleInput("j");
		view.handleInput("\r");
		await settleMicrotasks();
		expect(view.render(100).join("\n")).toContain("Done");
		expect(manualTimers.pendingTimerCount()).toBe(0);
	});

	test("registers command and falls back to notify without UI", async () => {
		const registry = new SubagentFleetRegistry();
		const run = registry.startRun([{ title: "Scout" }]);
		const task = run.tasks[0];
		if (task === undefined) throw new Error("missing task");
		registry.markDone(task.id, {
			status: "final-text",
			finalText: "done",
			elapsedMs: 5,
			progress: { state: "stopped", toolCount: 1, turnCount: 1, elapsedMs: 5 },
			sessionFile: "/tmp/scout.jsonl",
		});
		const commands = new Map<
			string,
			{ handler(args: string, ctx: CommandContext): Promise<void> | void }
		>();
		const pi = {
			registerCommand(
				name: string,
				command: { handler(args: string, ctx: CommandContext): Promise<void> | void },
			) {
				commands.set(name, command);
			},
		};
		registerSubagentFleetCommand({
			pi,
			registry,
			dependencies: { readTextFile: async () => sessionJsonl() },
		});

		const command = commands.get(SUBAGENT_FLEET_COMMAND_NAME);
		if (command === undefined) throw new Error("Expected subagent fleet command.");
		const notifications: string[] = [];
		await command.handler("", noUiCommandContext(notifications));
		expect(notifications.join("\n")).toContain("subagent fleet:");
		expect(notifications.join("\n")).toContain("Scout");
		expect(notifications.join("\n")).toContain("openai-codex/gpt-5.4");
		expect(notifications.join("\n")).toContain("turns=1, tools=1, state=stopped");
	});

	test("registers every fleet shortcut and opens the navigator through them", async () => {
		const registry = new SubagentFleetRegistry();
		const shortcuts = new Map<
			string,
			{
				description?: string;
				handler(ctx: SubagentFleetNavigatorContext): Promise<void> | void;
			}
		>();
		const pi = {
			registerShortcut(
				shortcut: string,
				options: {
					description?: string;
					handler(ctx: SubagentFleetNavigatorContext): Promise<void> | void;
				},
			) {
				shortcuts.set(shortcut, options);
			},
		};
		registerSubagentFleetShortcut({ pi, registry });

		expect([...shortcuts.keys()]).toEqual([...SUBAGENT_FLEET_SHORTCUTS]);
		const notifications: string[] = [];
		await shortcuts.get("f2")!.handler(noUiCommandContext(notifications));
		expect(notifications.join("\n")).toContain("No subagents have run in this Pi session yet.");
	});

	test("shows the parent Pi session even before any subagent run", async () => {
		const registry = new SubagentFleetRegistry();
		const view = new SubagentFleetNavigator({
			tui: { requestRender: () => {} },
			registry,
			detailContext: testDetailContext(),
			done: () => {},
			parentSessionFile: "/tmp/parent.jsonl",
		});

		const list = view.render(100).join("\n");
		expect(list).not.toContain("No subagents have run");
		expect(list).toContain("▸ ◉ Parent Pi session");

		view.handleInput("\r");
		await settleMicrotasks();
		expect(view.render(100).join("\n")).toContain("openai-codex/gpt-5.4");
	});

	test("pins the parent Pi session as a navigable entry", async () => {
		const registry = new SubagentFleetRegistry();
		const run = registry.startRun([{ title: "Scout" }], {
			parentSessionFile: "/tmp/parent.jsonl",
		});
		const child = run.tasks[0]?.id;
		if (child === undefined) throw new Error("missing task id");
		registry.markRunning(child);
		registry.markProgress(child, updateWithSessionFile("/tmp/child.jsonl"));

		const view = new SubagentFleetNavigator({
			tui: { requestRender: () => {} },
			registry,
			detailContext: testDetailContext(),
			done: () => {},
		});

		const list = view.render(100).join("\n");
		expect(list).toContain("  ◉ Parent Pi session");
		expect(list).toContain("▸ ▶ Scout");

		view.handleInput("k");
		expect(view.render(100).join("\n")).toContain("▸ ◉ Parent Pi session");
		view.handleInput("\r");
		await settleMicrotasks();
		const detail = view.render(100).join("\n");
		expect(detail).toContain("Parent Pi session");
		expect(detail).toContain("stopped · stopped");
		expect(detail).not.toContain("running · running");
		expect(detail).toContain("openai-codex/gpt-5.4");
	});
});
