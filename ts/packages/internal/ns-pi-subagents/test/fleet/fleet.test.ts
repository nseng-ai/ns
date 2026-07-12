import { describe, expect, test } from "vitest";

import type {
	ExtensionAPI,
	SessionShutdownEvent,
	SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import { createManualClock } from "@nseng-ai/foundation/time/testing";
import type { ToolContext } from "@nseng-ai/pi/runtime/tool-types";

import { getOrCreateSubagentFleetRegistry } from "../../src/fleet/provider.ts";
import { SUBAGENT_FLEET_RECENT_TASK_CAP, SubagentFleetRegistry } from "../../src/fleet/registry.ts";
import {
	SUBAGENT_FLEET_STATUS_KEY,
	SUBAGENT_FLEET_WIDGET_KEY,
	formatSubagentFleetStatusText,
	formatSubagentFleetTaskLines,
	formatSubagentFleetWidgetLines,
	syncSubagentFleetDisplay,
	taskIcon,
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
): SubagentFleetRegistry {
	return getOrCreateSubagentFleetRegistry({
		owner,
		onSessionStart: (handler) => lifecycle.onSessionStart(handler),
		onSessionShutdown: (handler) => lifecycle.onSessionShutdown(handler),
	});
}

describe("subagent fleet manager", () => {
	test("preserves registry identity by event bus owner with one active binding", () => {
		const owner = eventBusOwner();
		const firstLifecycle = new FakeFleetLifecycle();
		const ignoredLifecycle = new FakeFleetLifecycle();
		const first = managedRegistry(owner, firstLifecycle);
		const second = managedRegistry(owner, ignoredLifecycle);

		expect(second).toBe(first);
		expect(firstLifecycle.sessionStartHandlers).toHaveLength(1);
		expect(firstLifecycle.sessionShutdownHandlers).toHaveLength(1);
		expect(ignoredLifecycle.sessionStartHandlers).toHaveLength(0);
		expect(ignoredLifecycle.sessionShutdownHandlers).toHaveLength(0);
	});

	test("creates distinct registries and bindings for different event bus owners", () => {
		const firstLifecycle = new FakeFleetLifecycle();
		const secondLifecycle = new FakeFleetLifecycle();
		const first = managedRegistry(eventBusOwner(), firstLifecycle);
		const second = managedRegistry(eventBusOwner(), secondLifecycle);

		expect(second).not.toBe(first);
		expect(firstLifecycle.sessionStartHandlers).toHaveLength(1);
		expect(secondLifecycle.sessionStartHandlers).toHaveLength(1);
	});

	test("preserves the managed registry on reload", () => {
		const lifecycle = new FakeFleetLifecycle();
		const registry = managedRegistry(eventBusOwner(), lifecycle);
		const onSessionStart = lifecycle.sessionStartHandlers[0];
		if (onSessionStart === undefined) throw new Error("missing session start binding");

		registry.startRun([{ title: "keep" }]);
		onSessionStart({ type: "session_start", reason: "reload" });
		expect(registry.snapshot()).toHaveLength(1);
	});

	test("clears exactly once for each replacement session reason", () => {
		for (const reason of ["startup", "new", "resume", "fork"] as const) {
			const lifecycle = new FakeFleetLifecycle();
			const registry = managedRegistry(eventBusOwner(), lifecycle);
			const onSessionStart = lifecycle.sessionStartHandlers[0];
			if (onSessionStart === undefined) throw new Error("missing session start binding");
			registry.startRun([{ title: reason }]);
			let changeCount = 0;
			registry.subscribe(() => {
				changeCount += 1;
			});

			onSessionStart({ type: "session_start", reason });

			expect(registry.snapshot()).toEqual([]);
			expect(changeCount).toBe(1);
		}
	});

	test("uses the canonical recent-task cap for managed registries", () => {
		const registry = managedRegistry(eventBusOwner(), new FakeFleetLifecycle());
		for (let index = 0; index < SUBAGENT_FLEET_RECENT_TASK_CAP + 3; index += 1) {
			const run = registry.startRun([{ title: `task ${index}` }]);
			const taskId = run.tasks[0]?.id;
			if (taskId === undefined) throw new Error("missing task id");
			registry.markDone(taskId, makeFinalTextResult(`task ${index}`));
		}

		expect(registry.snapshot().flatMap((run) => run.tasks)).toHaveLength(
			SUBAGENT_FLEET_RECENT_TASK_CAP,
		);
	});

	test("keeps retained wrappers inert across repeated shutdown and reacquisition", () => {
		const owner = eventBusOwner();
		const lifecycle = new FakeFleetLifecycle();
		const registry = managedRegistry(owner, lifecycle);
		for (let cycle = 0; cycle < 3; cycle += 1) {
			const onShutdown = lifecycle.sessionShutdownHandlers[cycle];
			if (onShutdown === undefined) throw new Error("missing session shutdown binding");
			onShutdown({ type: "session_shutdown", reason: "quit" });
			expect(managedRegistry(owner, lifecycle)).toBe(registry);

			for (const staleShutdown of lifecycle.sessionShutdownHandlers.slice(0, cycle + 1)) {
				staleShutdown({ type: "session_shutdown", reason: "quit" });
			}
			expect(managedRegistry(owner, lifecycle)).toBe(registry);
			expect(lifecycle.sessionShutdownHandlers).toHaveLength(cycle + 2);
		}
		expect(lifecycle.sessionStartHandlers).toHaveLength(4);
		expect(lifecycle.sessionShutdownHandlers).toHaveLength(4);

		registry.startRun([{ title: "clear once" }]);
		let changeCount = 0;
		registry.subscribe(() => {
			changeCount += 1;
		});
		for (const onSessionStart of lifecycle.sessionStartHandlers) {
			onSessionStart({ type: "session_start", reason: "startup" });
		}
		expect(registry.snapshot()).toEqual([]);
		expect(changeCount).toBe(1);
		expect(managedRegistry(owner, lifecycle)).toBe(registry);
		expect(lifecycle.sessionStartHandlers).toHaveLength(4);

		registry.startRun([{ title: "keep after stale starts" }]);
		const countBeforeStaleStarts = changeCount;
		for (const staleSessionStart of lifecycle.sessionStartHandlers.slice(0, -1)) {
			staleSessionStart({ type: "session_start", reason: "fork" });
		}
		expect(registry.snapshot()).toHaveLength(1);
		expect(changeCount).toBe(countBeforeStaleStarts);
	});
});

describe("subagent fleet registry timing", () => {
	test("captures lifecycle start time and terminal elapsed time", () => {
		const manualClock = createManualClock(1_000);
		const registry = new SubagentFleetRegistry({ clock: manualClock.clock });
		const run = registry.startRun([{ title: "Timed" }]);
		const taskId = run.tasks[0]?.id;
		if (taskId === undefined) throw new Error("missing task id");

		registry.markRunning(taskId);
		manualClock.advanceMs(500);
		registry.markDone(taskId, { ...makeFinalTextResult("done"), elapsedMs: 125 });

		expect(registry.snapshot()[0]?.tasks[0]).toMatchObject({
			state: "done",
			startedAtMs: 1_000,
			finalElapsedMs: 125,
		});
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

	test("uses success icons for both terminal-capture and final-text completion", () => {
		const completedTask = {
			id: "completed",
			runId: "run",
			index: 0,
			title: "Completed",
			state: "done",
			finalStatus: "completed",
		} as const;
		expect(taskIcon(completedTask)).toBe("✓");
		expect(taskIcon({ ...completedTask, finalStatus: "final-text" })).toBe("✓");
		expect(taskIcon({ ...completedTask, finalStatus: "error" })).toBe("✗");
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
