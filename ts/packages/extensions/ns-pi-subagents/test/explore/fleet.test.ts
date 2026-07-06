import { describe, expect, test } from "vitest";

import type { ToolContext } from "@nseng-ai/pi/runtime/tool-types";

import { RunnerSubagentFleetRegistry } from "@internal/pi-tools/runner-subagents";
import {
	EXPLORE_FLEET_STATUS_KEY,
	EXPLORE_FLEET_WIDGET_KEY,
	formatExploreFleetStatusText,
	formatExploreFleetWidgetLines,
	syncExploreFleetDisplay,
} from "../../src/explore/fleet.ts";
import { makeErrorResult, makeFinalTextResult } from "../../src/explore/testing.ts";

describe("runner subagent fleet registry for explore", () => {
	test("tracks queued, running, done, session files, and widget rows", () => {
		const registry = new RunnerSubagentFleetRegistry();
		const run = registry.startRun([{ title: "Scout files" }, { title: "Scout tests" }]);
		const first = run.tasks[0]?.id;
		const second = run.tasks[1]?.id;
		if (first === undefined || second === undefined) throw new Error("missing task ids");

		registry.markRunning(first);
		registry.markProgress(first, {
			progress: {
				state: "running",
				toolCount: 1,
				turnCount: 1,
				elapsedMs: 10,
				sessionFile: "/tmp/one.jsonl",
			},
			activity: { assistantPreview: "Reading files." },
		});
		registry.markDone(first, { ...makeFinalTextResult("done"), sessionFile: "/tmp/one.jsonl" });
		registry.markDone(second, { ...makeErrorResult("failed"), sessionFile: "/tmp/two.jsonl" });

		const lines = formatExploreFleetWidgetLines(registry.snapshot());
		expect(lines.join("\n")).toContain("explore fleet: 0 running, 2 recent");
		expect(lines[0]).toContain("/ns:explore:fleet to inspect");
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

	test("summarizes fleet state in the footer status with the navigator command", () => {
		const registry = new RunnerSubagentFleetRegistry();
		expect(formatExploreFleetStatusText(registry.snapshot())).toBeUndefined();

		const run = registry.startRun([{ title: "Scout files" }, { title: "Scout tests" }]);
		const first = run.tasks[0]?.id;
		const second = run.tasks[1]?.id;
		if (first === undefined || second === undefined) throw new Error("missing task ids");

		registry.markRunning(first);
		expect(formatExploreFleetStatusText(registry.snapshot())).toBe(
			"explore fleet: 1 running, 1 queued · /ns:explore:fleet",
		);

		registry.markRunning(second);
		registry.markDone(first, makeFinalTextResult("done"));
		expect(formatExploreFleetStatusText(registry.snapshot())).toBe(
			"explore fleet: 1 running · /ns:explore:fleet",
		);

		registry.markDone(second, makeErrorResult("failed"));
		expect(formatExploreFleetStatusText(registry.snapshot())).toBe(
			"explore fleet: 1 done, 1 failed · /ns:explore:fleet",
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
		syncExploreFleetDisplay(ctx, registry.snapshot());
		expect(widgetCalls.at(-1)).toEqual({ key: EXPLORE_FLEET_WIDGET_KEY, content: undefined });
		expect(statusCalls.at(-1)).toEqual({ key: EXPLORE_FLEET_STATUS_KEY, value: undefined });

		const run = registry.startRun([{ title: "Scout files" }]);
		const only = run.tasks[0]?.id;
		if (only === undefined) throw new Error("missing task id");
		registry.markRunning(only);
		syncExploreFleetDisplay(ctx, registry.snapshot());
		expect(widgetCalls.at(-1)?.content?.[0]).toContain("/ns:explore:fleet to inspect");
		expect(statusCalls.at(-1)?.value).toBe("explore fleet: 1 running · /ns:explore:fleet");
	});
});
