import { describe, expect, test, vi } from "vitest";

import {
	RunnerSubagentFleetRegistry,
	type RunnerSubagentUpdate,
} from "@internal/pi-tools/runner-subagents";
import type { CommandContext } from "@nseng-ai/pi/runtime/extension-types";

import {
	EXPLORE_FLEET_COMMAND_NAME,
	ExploreFleetNavigator,
	loadFleetTaskDetail,
	registerExploreFleetCommand,
} from "../../src/explore/fleet-navigator.ts";

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

describe("explore fleet navigator", () => {
	test("loads detail from JSONL through the readTextFile seam", async () => {
		const detail = await loadFleetTaskDetail({
			task: {
				id: "task-1",
				runId: "run-1",
				index: 0,
				title: "Scout one",
				state: "running",
				sessionFile: "/tmp/one.jsonl",
			},
			readTextFile: async () => sessionJsonl(),
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
	});

	test("drives list, detail, live reload, back, and close", async () => {
		const registry = new RunnerSubagentFleetRegistry();
		const run = registry.startRun([{ title: "Second" }, { title: "First" }]);
		const second = run.tasks[0]!;
		const first = run.tasks[1]!;
		registry.markRunning(first.id);
		registry.markProgress(first.id, updateWithSessionFile("/tmp/one.jsonl"));
		registry.markProgress(second.id, updateWithSessionFile("/tmp/two.jsonl"));
		let content = sessionJsonl();
		let renderRequests = 0;
		let doneCalls = 0;
		const view = new ExploreFleetNavigator({
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
		expect(view.render(100).join("\n")).toContain("explore fleet:");
		view.handleInput("q");
		expect(doneCalls).toBe(1);
		expect(renderRequests).toBeGreaterThan(0);
	});

	test("registers command and falls back to notify without UI", async () => {
		const registry = new RunnerSubagentFleetRegistry();
		registry.startRun([{ title: "Scout" }]);
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
		registerExploreFleetCommand({ pi, registry });

		expect(commands.has(EXPLORE_FLEET_COMMAND_NAME)).toBe(true);
		const notifications: string[] = [];
		await commands.get(EXPLORE_FLEET_COMMAND_NAME)!.handler("", noUiCommandContext(notifications));
		expect(notifications.join("\n")).toContain("explore fleet:");
		expect(notifications.join("\n")).toContain("Scout");
	});
});
