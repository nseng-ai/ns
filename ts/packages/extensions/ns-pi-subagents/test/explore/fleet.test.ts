import { describe, expect, test } from "vitest";

import { RunnerSubagentFleetRegistry } from "@internal/pi-tools/runner-subagents";
import { formatExploreFleetWidgetLines } from "../../src/explore/fleet.ts";
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
});
