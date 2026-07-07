import { describe, expect, test, vi } from "vitest";

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

async function settleMicrotasks(count = 5): Promise<void> {
	for (let index = 0; index < count; index += 1) await Promise.resolve();
}

const CSI_UP = "\u001b[1;1A";
const CSI_DOWN = "\u001b[1;1B";

describe("subagent fleet navigator", () => {
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
								cost: { input: 0.01, output: 0.02, cacheRead: 0.005, cacheWrite: 0, total: 0.035 },
							},
						},
					},
				]),
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
		expect(detail.usage.totals.input).toBe(1200);
		expect(detail.usage.totals.output).toBe(300);
		expect(detail.usage.totals.cost.total).toBeCloseTo(0.035);
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
			readTextFile: async () => sessionJsonl(),
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
			readTextFile: async () => content,
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
			readTextFile: async () => content,
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
		await vi.waitFor(() => expect(view.render(100).join("\n")).toContain("▶ bash: just test"));

		view.handleInput("b");
		expect(view.render(100).join("\n")).toContain("subagent fleet:");
		view.handleInput("q");
		expect(doneCalls).toBe(1);
		expect(renderRequests).toBeGreaterThan(0);
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
			readTextFile: async () => sessionJsonl(),
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
			readTextFile: async () => sessionJsonl(),
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
