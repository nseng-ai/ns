import { describe, expect, test } from "vitest";

import type { ToolContext } from "@nseng-ai/pi/runtime/tool-types";

import { getOrCreateSubagentFleetRegistry } from "../../src/fleet/provider.ts";
import { SubagentFleetRegistry } from "../../src/fleet/registry.ts";
import {
	SUBAGENT_FLEET_STATUS_KEY,
	SUBAGENT_FLEET_WIDGET_KEY,
	formatSubagentFleetStatusText,
	formatSubagentFleetTaskLines,
	formatSubagentFleetWidgetLines,
	syncSubagentFleetDisplay,
} from "../../src/fleet/display.ts";
import { trackSingleSubagentFleetRun, trackSubagentFleetRun } from "../../src/fleet/tracking.ts";
import {
	makeErrorResult,
	makeFinalTextResult,
	settleMicrotasks,
} from "../helpers/explore-testing.ts";
import type { GitHeadSnapshot } from "../../src/fleet/git-head.ts";

describe("subagent fleet display for explorer", () => {
	test("reuses one registry for the same Pi host", () => {
		const pi = {};
		const first = getOrCreateSubagentFleetRegistry(pi, { recentTaskCap: 1 });
		const second = getOrCreateSubagentFleetRegistry(pi, { recentTaskCap: 20 });
		expect(second).toBe(first);
	});

	test("renders one active widget line and clears once the fleet is idle", () => {
		const registry = new SubagentFleetRegistry();
		const run = registry.startRun([{ title: "Scout files" }, { title: "Scout tests" }]);
		const first = run.tasks[0]?.id;
		const second = run.tasks[1]?.id;
		if (first === undefined || second === undefined) throw new Error("missing task ids");

		registry.markRunning(first);
		expect(formatSubagentFleetWidgetLines(registry.snapshot())).toEqual([
			"subagent fleet: 1 running, 1 queued · F2/alt+e · /ns:agents:fleet",
		]);

		registry.markDone(first, { ...makeFinalTextResult("done"), sessionFile: "/tmp/one.jsonl" });
		registry.markDone(second, { ...makeErrorResult("failed"), sessionFile: "/tmp/two.jsonl" });
		expect(formatSubagentFleetWidgetLines(registry.snapshot())).toEqual([]);
	});

	test("formats the no-UI task dump with per-task status and session files", () => {
		const registry = new SubagentFleetRegistry();
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
		const registry = new SubagentFleetRegistry({ recentTaskCap: 1 });
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

	test("summarizes active fleet state in the footer status with the shortcut hint", () => {
		const registry = new SubagentFleetRegistry();
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
		expect(formatSubagentFleetStatusText(registry.snapshot())).toBeUndefined();
	});

	test("tracking records HEAD baseline and final HEAD without blocking completion", async () => {
		const registry = new SubagentFleetRegistry();
		const ctx: ToolContext = {
			cwd: "/repo",
			hasUI: false,
			mode: "json",
			ui: { notify: () => {}, setStatus: () => {} },
		};
		const heads: GitHeadSnapshot[] = [
			{ status: "available", oid: "run-start" },
			{ status: "available", oid: "task-start" },
			{ status: "available", oid: "task-done" },
		];
		const tracking = trackSubagentFleetRun({
			registry,
			ctx,
			tasks: [{ title: "Committer" }],
			parentSessionFile: undefined,
			cwd: "/repo",
			readGitHead: async () => {
				const head = heads.shift();
				if (head === undefined) return { status: "unavailable", reason: "unexpected read" };
				return head;
			},
		});

		tracking.markRunning(0);
		tracking.markDone(0, makeFinalTextResult("done"));
		await settleMicrotasks();

		const task = registry.snapshot()[0]?.tasks[0];
		expect(task?.headBaseline).toEqual({ status: "available", oid: "task-start" });
		expect(task?.finalHead).toEqual({ status: "available", oid: "task-done" });
	});

	test("tracking dispose marks unfinished tasks terminal", () => {
		const registry = new SubagentFleetRegistry();
		const ctx: ToolContext = {
			cwd: "/repo",
			hasUI: true,
			mode: "tui",
			ui: {
				notify: () => {},
				setWidget: () => {},
				setStatus: () => {},
			},
		};
		const tracking = trackSubagentFleetRun({
			registry,
			ctx,
			tasks: [{ title: "Started" }, { title: "Queued" }],
			parentSessionFile: undefined,
		});

		tracking.markRunning(0);
		tracking.dispose();
		tracking.dispose();

		const tasks = registry.snapshot().flatMap((run) => run.tasks);
		expect(tasks.map((task) => [task.title, task.state, task.finalStatus])).toEqual([
			["Started", "done", "error"],
			["Queued", "done", "error"],
		]);
	});

	test("single-subagent tracking binds lifecycle updates to the only fleet task", async () => {
		const registry = new SubagentFleetRegistry();
		const ctx: ToolContext = {
			cwd: "/repo",
			hasUI: true,
			mode: "tui",
			ui: {
				notify: () => {},
				setWidget: () => {},
				setStatus: () => {},
			},
		};
		const heads: GitHeadSnapshot[] = [
			{ status: "available", oid: "single-run-start" },
			{ status: "available", oid: "single-task-start" },
			{ status: "available", oid: "single-task-done" },
		];
		const readCwds: string[] = [];
		const tracking = trackSingleSubagentFleetRun({
			registry,
			ctx,
			title: "One runner",
			prompt: "Run once",
			parentSessionFile: "/tmp/parent.jsonl",
			cwd: "/repo",
			readGitHead: async ({ cwd }) => {
				readCwds.push(cwd);
				const head = heads.shift();
				if (head === undefined) return { status: "unavailable", reason: "unexpected read" };
				return head;
			},
		});

		tracking.onStart();
		tracking.onProgress({
			progress: {
				state: "running",
				toolCount: 1,
				turnCount: 2,
				elapsedMs: 10,
				sessionFile: "/tmp/child-progress.jsonl",
			},
			activity: {
				assistantPreview: "editing",
			},
		});
		tracking.onDone({ ...makeFinalTextResult("done"), sessionFile: "/tmp/child-final.jsonl" });
		tracking.dispose();
		await settleMicrotasks();

		const [run] = registry.snapshot();
		expect(run?.parentSessionFile).toBe("/tmp/parent.jsonl");
		expect(readCwds).toEqual(["/repo", "/repo", "/repo"]);
		expect(run?.tasks).toMatchObject([
			{
				title: "One runner",
				prompt: "Run once",
				state: "done",
				latestActivity: "editing",
				finalStatus: "final-text",
				sessionFile: "/tmp/child-final.jsonl",
				headBaseline: { status: "available", oid: "single-task-start" },
				finalHead: { status: "available", oid: "single-task-done" },
			},
		]);
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

		const registry = new SubagentFleetRegistry();
		syncSubagentFleetDisplay(ctx, registry.snapshot());
		expect(widgetCalls.at(-1)).toEqual({ key: SUBAGENT_FLEET_WIDGET_KEY, content: undefined });
		expect(statusCalls.at(-1)).toEqual({ key: SUBAGENT_FLEET_STATUS_KEY, value: undefined });

		const run = registry.startRun([{ title: "Scout files" }]);
		const only = run.tasks[0]?.id;
		if (only === undefined) throw new Error("missing task id");
		registry.markRunning(only);
		syncSubagentFleetDisplay(ctx, registry.snapshot());
		expect(widgetCalls.at(-1)?.content).toEqual([
			"subagent fleet: 1 running · F2/alt+e · /ns:agents:fleet",
		]);
		expect(statusCalls.at(-1)?.value).toBe("subagent fleet: 1 running · F2/alt+e");

		registry.markDone(only, makeFinalTextResult("done"));
		syncSubagentFleetDisplay(ctx, registry.snapshot());
		expect(widgetCalls.at(-1)).toEqual({ key: SUBAGENT_FLEET_WIDGET_KEY, content: undefined });
		expect(statusCalls.at(-1)).toEqual({ key: SUBAGENT_FLEET_STATUS_KEY, value: undefined });
	});
});
