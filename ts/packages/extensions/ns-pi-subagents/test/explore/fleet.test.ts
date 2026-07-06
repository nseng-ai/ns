import { describe, expect, test } from "vitest";

import type { ToolContext } from "@nseng-ai/pi/runtime/tool-types";

import { RunnerSubagentFleetRegistry } from "@nseng-ai/ns-pi-subagents/runner-subagents";
import {
	SUBAGENT_FLEET_STATUS_KEY,
	SUBAGENT_FLEET_WIDGET_KEY,
	formatSubagentFleetStatusText,
	formatSubagentFleetTaskLines,
	formatSubagentFleetWidgetLines,
	syncSubagentFleetDisplay,
} from "../../src/fleet/display.ts";
import { makeErrorResult, makeFinalTextResult } from "../../src/explore/testing.ts";

describe("runner subagent fleet display for explore", () => {
	test("renders one active widget line and clears once the fleet is idle", () => {
		const registry = new RunnerSubagentFleetRegistry();
		const run = registry.startRun([{ title: "Scout files" }, { title: "Scout tests" }]);
		const first = run.tasks[0]?.id;
		const second = run.tasks[1]?.id;
		if (first === undefined || second === undefined) throw new Error("missing task ids");

		registry.markRunning(first);
		expect(formatSubagentFleetWidgetLines(registry.snapshot())).toEqual([
			"subagent fleet: 1 running, 1 queued · F2/alt+e · /ns:subagents:fleet",
		]);

		registry.markDone(first, { ...makeFinalTextResult("done"), sessionFile: "/tmp/one.jsonl" });
		registry.markDone(second, { ...makeErrorResult("failed"), sessionFile: "/tmp/two.jsonl" });
		expect(formatSubagentFleetWidgetLines(registry.snapshot())).toEqual([]);
	});

	test("formats the no-UI task dump with per-task status and session files", () => {
		const registry = new RunnerSubagentFleetRegistry();
		const run = registry.startRun([{ title: "Scout files" }, { title: "Scout tests" }]);
		const first = run.tasks[0]?.id;
		const second = run.tasks[1]?.id;
		if (first === undefined || second === undefined) throw new Error("missing task ids");

		registry.markDone(first, { ...makeFinalTextResult("done"), sessionFile: "/tmp/one.jsonl" });
		registry.markDone(second, { ...makeErrorResult("failed"), sessionFile: "/tmp/two.jsonl" });

		const lines = formatSubagentFleetTaskLines(registry.snapshot());
		expect(lines[0]).toBe("subagent fleet: 1 done, 1 failed");
		expect(lines.join("\n")).toContain("✓ Scout files — final-text — /tmp/one.jsonl");
		expect(lines.join("\n")).toContain("✗ Scout tests — error — /tmp/two.jsonl");
		expect(registry.tasksWithSessionFiles().map((task) => task.sessionFile)).toEqual([
			"/tmp/one.jsonl",
			"/tmp/two.jsonl",
		]);
	});

	test("evicts completed tasks without dropping running tasks", () => {
		const registry = new RunnerSubagentFleetRegistry({ recentTaskCap: 1 });
		const run = registry.startRun([{ title: "Old" }, { title: "New" }, { title: "Running" }]);
		const oldTask = run.tasks[0]?.id;
		const newTask = run.tasks[1]?.id;
		const runningTask = run.tasks[2]?.id;
		if (oldTask === undefined || newTask === undefined || runningTask === undefined) {
			throw new Error("missing task ids");
		}

		registry.markDone(oldTask, makeFinalTextResult("old"));
		registry.markRunning(runningTask);
		registry.markDone(newTask, makeFinalTextResult("new"));

		const titles = registry
			.snapshot()
			.flatMap((fleetRun) => fleetRun.tasks.map((task) => task.title));
		expect(titles).toEqual(["New", "Running"]);
	});

	test("summarizes fleet state in the footer status with the shortcut hint", () => {
		const registry = new RunnerSubagentFleetRegistry();
		expect(formatSubagentFleetStatusText(registry.snapshot())).toBeUndefined();

		const run = registry.startRun([{ title: "Scout files" }, { title: "Scout tests" }]);
		const first = run.tasks[0]?.id;
		const second = run.tasks[1]?.id;
		if (first === undefined || second === undefined) throw new Error("missing task ids");

		registry.markRunning(first);
		expect(formatSubagentFleetStatusText(registry.snapshot())).toBe(
			"subagent fleet: 1 running, 1 queued · F2/alt+e",
		);

		registry.markRunning(second);
		registry.markDone(first, makeFinalTextResult("done"));
		expect(formatSubagentFleetStatusText(registry.snapshot())).toBe(
			"subagent fleet: 1 running · F2/alt+e",
		);

		registry.markDone(second, makeErrorResult("failed"));
		expect(formatSubagentFleetStatusText(registry.snapshot())).toBe(
			"subagent fleet: 1 done, 1 failed · F2/alt+e",
		);
	});

	test("syncs widget lines and footer status through the tool context", () => {
		const widgetCalls: { key: string; content: string[] | undefined }[] = [];
		const statusCalls: { key: string; value: string | undefined }[] = [];
		const ctx: ToolContext = {
			cwd: "/repo",
			hasUI: true,
			mode: "tui",
			ui: {
				notify: () => {},
				setWidget: (key, content) => widgetCalls.push({ key, content }),
				setStatus: (key, value) => statusCalls.push({ key, value }),
			},
		};

		const registry = new RunnerSubagentFleetRegistry();
		syncSubagentFleetDisplay(ctx, registry.snapshot());
		expect(widgetCalls.at(-1)).toEqual({ key: SUBAGENT_FLEET_WIDGET_KEY, content: undefined });
		expect(statusCalls.at(-1)).toEqual({ key: SUBAGENT_FLEET_STATUS_KEY, value: undefined });

		const run = registry.startRun([{ title: "Scout files" }]);
		const only = run.tasks[0]?.id;
		if (only === undefined) throw new Error("missing task id");
		registry.markRunning(only);
		syncSubagentFleetDisplay(ctx, registry.snapshot());
		expect(widgetCalls.at(-1)?.content).toEqual([
			"subagent fleet: 1 running · F2/alt+e · /ns:subagents:fleet",
		]);
		expect(statusCalls.at(-1)?.value).toBe("subagent fleet: 1 running · F2/alt+e");

		registry.markDone(only, makeFinalTextResult("done"));
		syncSubagentFleetDisplay(ctx, registry.snapshot());
		expect(widgetCalls.at(-1)).toEqual({ key: SUBAGENT_FLEET_WIDGET_KEY, content: undefined });
		expect(statusCalls.at(-1)?.value).toBe("subagent fleet: 1 done · F2/alt+e");
	});
});
