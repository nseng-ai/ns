import { describe, expect, test } from "vitest";

import type {
	ExtensionAPI,
	SessionShutdownEvent,
	SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
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
import {
	dispatchTrackedSingleSubagentFleetRun,
	trackSingleSubagentFleetRun,
	trackSubagentFleetRun,
} from "../../src/fleet/tracking.ts";
import { createFunctionSubagentRuntime } from "../../src/runtime/seam.ts";
import {
	makeErrorResult,
	makeFinalTextResult,
	settleMicrotasks,
	toolContext,
} from "../helpers/fleet-testing.ts";
import type { GitHeadSnapshot } from "../../src/fleet/git-head.ts";

class FakeFleetLifecycle {
	readonly sessionStartHandlers: Array<(event: SessionStartEvent) => void> = [];
	readonly sessionShutdownHandlers: Array<(event: SessionShutdownEvent) => void> = [];

	onSessionStart(handler: (event: SessionStartEvent) => void): void {
		this.sessionStartHandlers.push(handler);
	}

	onSessionShutdown(handler: (event: SessionShutdownEvent) => void): void {
		this.sessionShutdownHandlers.push(handler);
	}
}

function eventBusOwner(): ExtensionAPI["events"] {
	return {
		emit() {},
		on() {
			return () => {};
		},
	};
}

function managedRegistry(
	owner: ExtensionAPI["events"],
	lifecycle: FakeFleetLifecycle,
	recentTaskCap?: number,
): SubagentFleetRegistry {
	return getOrCreateSubagentFleetRegistry({
		owner,
		onSessionStart: (handler) => lifecycle.onSessionStart(handler),
		onSessionShutdown: (handler) => lifecycle.onSessionShutdown(handler),
		...(recentTaskCap === undefined ? {} : { recentTaskCap }),
	});
}

describe("subagent fleet manager", () => {
	test("keys by event bus owner, binds once, and keeps the first options", () => {
		const owner = eventBusOwner();
		const firstLifecycle = new FakeFleetLifecycle();
		const ignoredLifecycle = new FakeFleetLifecycle();
		const first = managedRegistry(owner, firstLifecycle, 1);
		const second = managedRegistry(owner, ignoredLifecycle, 20);

		expect(second).toBe(first);
		expect(firstLifecycle.sessionStartHandlers).toHaveLength(1);
		expect(firstLifecycle.sessionShutdownHandlers).toHaveLength(1);
		expect(ignoredLifecycle.sessionStartHandlers).toHaveLength(0);
		expect(ignoredLifecycle.sessionShutdownHandlers).toHaveLength(0);

		for (const title of ["old", "new"]) {
			const run = first.startRun([{ title }]);
			const taskId = run.tasks[0]?.id;
			if (taskId === undefined) throw new Error("missing task id");
			first.markDone(taskId, makeFinalTextResult(title));
		}
		expect(
			first
				.snapshot()
				.flatMap((run) => run.tasks)
				.map((task) => task.title),
		).toEqual(["new"]);
	});

	test("creates distinct registries for different event bus owners", () => {
		const first = managedRegistry(eventBusOwner(), new FakeFleetLifecycle());
		const second = managedRegistry(eventBusOwner(), new FakeFleetLifecycle());

		expect(second).not.toBe(first);
	});

	test("clears replacement sessions but preserves reload", () => {
		const lifecycle = new FakeFleetLifecycle();
		const registry = managedRegistry(eventBusOwner(), lifecycle);
		const onSessionStart = lifecycle.sessionStartHandlers[0];
		if (onSessionStart === undefined) throw new Error("missing session start binding");

		registry.startRun([{ title: "keep" }]);
		onSessionStart({ type: "session_start", reason: "reload" });
		expect(registry.snapshot()).toHaveLength(1);

		let changeCount = 0;
		registry.subscribe(() => {
			changeCount += 1;
		});
		for (const reason of ["startup", "new", "resume", "fork"] as const) {
			registry.startRun([{ title: reason }]);
			const countBeforeReset = changeCount;
			onSessionStart({ type: "session_start", reason });
			expect(registry.snapshot()).toEqual([]);
			expect(changeCount).toBe(countBeforeReset + 1);
		}
	});

	test("shutdown releases the binding and the next acquisition rebinds the same registry", () => {
		const owner = eventBusOwner();
		const firstLifecycle = new FakeFleetLifecycle();
		const registry = managedRegistry(owner, firstLifecycle);
		const onShutdown = firstLifecycle.sessionShutdownHandlers[0];
		if (onShutdown === undefined) throw new Error("missing session shutdown binding");

		onShutdown({ type: "session_shutdown", reason: "quit" });
		const nextLifecycle = new FakeFleetLifecycle();
		const reacquired = managedRegistry(owner, nextLifecycle);

		expect(reacquired).toBe(registry);
		expect(nextLifecycle.sessionStartHandlers).toHaveLength(1);
		expect(nextLifecycle.sessionShutdownHandlers).toHaveLength(1);
	});
});

describe("subagent fleet display for explorer", () => {
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

	test("dispatches one tracked run through start, progress, and done while returning the raw result", async () => {
		const registry = new SubagentFleetRegistry();
		const ctx = toolContext();
		const result = { ...makeFinalTextResult("raw result"), sessionFile: "/tmp/final.jsonl" };
		const observations: string[] = [];
		const runtime = createFunctionSubagentRuntime(async (input) => {
			expect(input.options.title).toBe("Tracked title");
			expect(input.options.prompt).toBe("Tracked prompt");
			expect(registry.snapshot()[0]?.tasks[0]).toMatchObject({
				title: "Tracked title",
				prompt: "Tracked prompt",
				state: "running",
			});
			input.options.onProgress?.({
				progress: {
					state: "running",
					toolCount: 1,
					turnCount: 1,
					elapsedMs: 3,
					sessionFile: "/tmp/progress.jsonl",
				},
				activity: { assistantPreview: "observable progress" },
			});
			return result;
		});

		const returned = await dispatchTrackedSingleSubagentFleetRun({
			pi: {},
			ctx,
			runtime,
			registry,
			fleetContext: ctx,
			parentSessionFile: "/tmp/parent.jsonl",
			options: {
				title: "Tracked title",
				prompt: "Tracked prompt",
				returnMode: "final-text",
				onProgress: () => {
					observations.push(registry.snapshot()[0]?.tasks[0]?.latestActivity ?? "missing");
				},
			},
		});

		expect(returned).toBe(result);
		expect(observations).toEqual(["observable progress"]);
		expect(registry.snapshot()[0]).toMatchObject({
			parentSessionFile: "/tmp/parent.jsonl",
			tasks: [
				{
					title: "Tracked title",
					prompt: "Tracked prompt",
					state: "done",
					latestActivity: "observable progress",
					finalStatus: "final-text",
					sessionFile: "/tmp/final.jsonl",
				},
			],
		});
	});

	test("terminalizes the placeholder and disposes tracking when dispatch throws", async () => {
		const registry = new SubagentFleetRegistry();
		const statusCalls: Array<string | undefined> = [];
		const ctx: ToolContext = {
			cwd: "/repo",
			hasUI: true,
			mode: "tui",
			ui: {
				notify: () => {},
				setWidget: () => {},
				setStatus: (_key, value) => statusCalls.push(value),
			},
		};
		const runtime = createFunctionSubagentRuntime(async () => {
			throw new Error("dispatch exploded");
		});

		await expect(
			dispatchTrackedSingleSubagentFleetRun({
				pi: {},
				ctx,
				runtime,
				registry,
				fleetContext: ctx,
				parentSessionFile: undefined,
				options: {
					title: "Throwing runner",
					prompt: "Throw now",
					returnMode: "final-text",
				},
			}),
		).rejects.toThrow("dispatch exploded");
		expect(registry.snapshot()[0]?.tasks).toMatchObject([
			{
				title: "Throwing runner",
				prompt: "Throw now",
				state: "done",
				finalStatus: "error",
			},
		]);

		const callsAfterDisposal = statusCalls.length;
		registry.startRun([{ title: "unobserved after disposal" }]);
		expect(statusCalls).toHaveLength(callsAfterDisposal);
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
