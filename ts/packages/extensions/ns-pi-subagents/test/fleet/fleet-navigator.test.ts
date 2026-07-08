import { describe, expect, test, vi } from "vitest";

import { createManualClock, createManualTimerScheduler } from "@nseng-ai/foundation/time/testing";
import type { RunnerSubagentUpdate } from "@nseng-ai/ns-pi-subagents/runner-subagents";
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
import type { ReadWorktreeState, WorktreeStateSnapshot } from "../../src/fleet/worktree-state.ts";
import { settleMicrotasks } from "../helpers/explore-testing.ts";

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
		readWorktreeState?: ReadWorktreeState;
	} = {},
): FleetDetailContext {
	return {
		cwd: "/repo",
		readTextFile: input.readTextFile ?? (() => Promise.resolve(sessionJsonl())),
		readWorktreeState:
			input.readWorktreeState ??
			(() => Promise.resolve({ status: "unavailable", reason: "not read" })),
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
	test("renders tool timeline rows without raw JSON argument blobs", () => {
		expect(
			renderTimelineEntryLines({
				kind: "tool",
				toolName: "read",
				state: "ok",
				inputPreview: '{"path":"ts/packages/kernel/src/cli/index.ts","limit":100}',
				resultPreview: '#!/usr/bin/env node import { z } from "zod";',
			}),
		).toEqual([
			"✓ read · path: ts/packages/kernel/src/cli/index.ts · limit: 100",
			'  ↳ #!/usr/bin/env node import { z } from "zod";',
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
			},
		]);
		expect(detail.timeline.currentAction).toEqual({ kind: "idle" });
	});

	test("renders usage trend with peak prompt fallback in detail header", async () => {
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
		expect(detail).toContain("tokens: 1.4k in · 28 out · 200 cached · $0.000");
		expect(detail).toContain("trend: latest +400 in/+8 out · peak prompt 1.2k");
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

	test("scrolls detail with CSI arrows while preserving vim keys", async () => {
		const registry = new SubagentFleetRegistry();
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
			detailContext: testDetailContext({
				readWorktreeState: async () => ({
					status: "available",
					files: [{ path: "src/fleet/navigator.ts", status: "M", additions: 12, deletions: 3 }],
				}),
			}),
			done: () => {},
		});

		view.handleInput("\r");
		await settleMicrotasks();
		const detail = view.render(120).join("\n");
		expect(detail).toContain("post-run summary:");
		expect(detail).toContain("status: final-text");
		expect(detail).toContain("commit: HEAD changed abcdef1 → fedcba6");
		expect(detail).toContain("shared worktree: 1 changed files");
		expect(detail).toContain("M src/fleet/navigator.ts +12/-3");
		expect(detail).toContain("✓ read");
		expect(detail).not.toContain("current action:");
		expect(detail).not.toContain("worktree state:");
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

	test("renders shared worktree state on task details", async () => {
		const registry = new SubagentFleetRegistry();
		const run = registry.startRun([{ title: "Dirty" }]);
		const task = run.tasks[0];
		if (task === undefined) throw new Error("missing task fixture");
		registry.markRunning(task.id);
		registry.markProgress(task.id, updateWithSessionFile("/tmp/dirty.jsonl"));
		const view = new SubagentFleetNavigator({
			tui: { requestRender: () => {} },
			registry,
			detailContext: testDetailContext({
				readWorktreeState: async () => ({
					status: "available",
					files: [
						{ path: "src/fleet/navigator.ts", status: "M", additions: 12, deletions: 3 },
						{ path: "notes.md", status: "??" },
					],
				}),
			}),
			done: () => {},
		});

		view.handleInput("\r");
		await settleMicrotasks();
		const detail = view.render(120).join("\n");
		expect(detail).toContain("worktree state: 2 changed files");
		expect(detail).toContain("M src/fleet/navigator.ts +12/-3");
		expect(detail).toContain("?? notes.md");
		expect(detail).toContain("✓ read");
	});

	test("auto-refreshes running task worktree state with existing detail polling", async () => {
		const registry = new SubagentFleetRegistry();
		const run = registry.startRun([{ title: "Live dirty" }]);
		const task = run.tasks[0];
		if (task === undefined) throw new Error("missing task fixture");
		registry.markRunning(task.id);
		registry.markProgress(task.id, updateWithSessionFile("/tmp/live-dirty.jsonl"));
		let worktreeState: WorktreeStateSnapshot = {
			status: "available",
			files: [{ path: "a.ts", status: "M", additions: 1, deletions: 0 }],
		};
		let worktreeReadCount = 0;
		const manualTimers = createManualTimerScheduler();
		const view = new SubagentFleetNavigator({
			tui: { requestRender: () => {} },
			registry,
			detailContext: testDetailContext({
				readWorktreeState: async () => {
					worktreeReadCount += 1;
					return worktreeState;
				},
			}),
			done: () => {},
			timers: manualTimers.timers,
			detailRefreshIntervalMs: 1_000,
		});

		view.handleInput("\r");
		await settleMicrotasks();
		expect(worktreeReadCount).toBe(1);
		expect(view.render(120).join("\n")).toContain("M a.ts +1/-0");

		worktreeState = {
			status: "available",
			files: [{ path: "b.ts", status: "A", additions: 4, deletions: 0 }],
		};
		manualTimers.advanceMs(1_000);
		await settleMicrotasks();
		expect(worktreeReadCount).toBe(2);
		expect(view.render(120).join("\n")).toContain("A b.ts +4/-0");
	});

	test("reuses cached session parses while recomposing fresh task and worktree state", async () => {
		const registry = new SubagentFleetRegistry();
		const run = registry.startRun([{ title: "Cached done" }]);
		const task = run.tasks[0];
		if (task === undefined) throw new Error("missing task fixture");
		registry.markRunning(task.id);
		registry.markProgress(task.id, updateWithSessionFile("/tmp/cached.jsonl"));
		let sessionReadCount = 0;
		let worktreeState: WorktreeStateSnapshot = {
			status: "available",
			files: [{ path: "before.ts", status: "M", additions: 1, deletions: 0 }],
		};
		let worktreeReadCount = 0;
		const content = sessionJsonl();
		const view = new SubagentFleetNavigator({
			tui: { requestRender: () => {} },
			registry,
			detailContext: testDetailContext({
				readTextFile: async () => {
					sessionReadCount += 1;
					return content;
				},
				readWorktreeState: async () => {
					worktreeReadCount += 1;
					return worktreeState;
				},
			}),
			done: () => {},
		});

		view.handleInput("\r");
		await settleMicrotasks();
		expect(sessionReadCount).toBe(1);
		expect(worktreeReadCount).toBe(1);
		expect(view.render(120).join("\n")).toContain("stopped · running");
		expect(view.render(120).join("\n")).toContain("M before.ts +1/-0");

		worktreeState = {
			status: "available",
			files: [{ path: "after.ts", status: "A", additions: 3, deletions: 0 }],
		};
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
		expect(worktreeReadCount).toBe(2);
		expect(detail).toContain("stopped · final-text");
		expect(detail).toContain("post-run summary:");
		expect(detail).toContain("commit: unavailable (missing baseline HEAD)");
		expect(detail).toContain("A after.ts +3/-0");
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

	test("renders rejected worktree reads without hiding timeline", async () => {
		const registry = new SubagentFleetRegistry();
		const run = registry.startRun([{ title: "Failure" }]);
		const task = run.tasks[0];
		if (task === undefined) throw new Error("missing task fixture");
		registry.markRunning(task.id);
		registry.markProgress(task.id, updateWithSessionFile("/tmp/failure.jsonl"));
		const view = new SubagentFleetNavigator({
			tui: { requestRender: () => {} },
			registry,
			detailContext: testDetailContext({
				readWorktreeState: async () => {
					throw new Error("not a git repo");
				},
			}),
			done: () => {},
		});

		view.handleInput("\r");
		await settleMicrotasks();
		const detail = view.render(120).join("\n");
		expect(detail).toContain("worktree state: unavailable (not a git repo)");
		expect(detail).toContain("✓ read");
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
		expect(view.render(100).join("\n")).toContain("current action: ▶ bash · just test");
		expect(view.render(100).join("\n")).toContain("heartbeat: quiet 0s");

		manualClock.advanceMs(2_000);
		manualTimers.advanceMs(1_000);
		await settleMicrotasks();
		expect(readCount).toBe(2);
		expect(view.render(100).join("\n")).toContain("heartbeat: quiet 2s");

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
		expect(view.render(100).join("\n")).toContain("heartbeat: quiet 0s");
		expect(view.render(100).join("\n")).toContain("↳ still running");

		view.handleInput("b");
		expect(manualTimers.pendingTimerCount()).toBe(0);
		manualTimers.advanceMs(5_000);
		await settleMicrotasks();
		expect(readCount).toBe(3);
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
		expect(list).not.toContain("No explore subagents have run");
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
		expect(detail).not.toContain("worktree state");
		expect(detail).toContain("openai-codex/gpt-5.4");
	});
});
