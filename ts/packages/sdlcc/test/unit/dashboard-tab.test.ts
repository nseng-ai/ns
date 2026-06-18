import { describe, expect, test } from "vitest";

import { dashboardTabModule } from "../../src/dashboard-tab.ts";
import type { DashboardModel, DashboardState, DashboardSurface, DashboardWorkspace } from "../../src/dashboard.ts";
import type { CommandOptions, CommandOutput } from "../../src/command-runner.ts";
import type { TabModuleDeps } from "../../src/tabs/tab-module.ts";

interface CommandCall {
	readonly command: string;
	readonly args: readonly string[];
	readonly options: CommandOptions;
}

const SURFACE: DashboardSurface = {
	ref: "surface:117",
	title: "π - slot-04",
	type: "terminal",
	active: false,
	focused: false,
	here: true,
	selected: false,
	selectedInPane: false,
	branch: "feature/a",
	worktreePath: "/repo/slot-04",
	workspaceRef: "workspace:45",
	windowRef: "window:1",
	paneRef: "pane:45",
};

function modelWithWorkspace(workspace: DashboardWorkspace): DashboardModel {
	return {
		title: "sdlcc dashboard",
		selectedWindowRef: "window:1",
		diagnostics: [],
		windows: [{ ref: "window:1", index: 0, active: true, current: true, visible: true, selectedWorkspaceRef: workspace.ref, workspaces: [workspace] }],
	};
}

function workspaceWithSurfaces(surfaces: readonly DashboardSurface[]): DashboardWorkspace {
	return {
		ref: "workspace:45",
		title: "feature/a",
		index: 0,
		active: true,
		selected: true,
		pinned: false,
		panes: [{ ref: "pane:45", active: true, focused: true, selectedSurfaceRef: surfaces[0]?.ref, surfaces }],
		surfaces,
		statusBuckets: ["here"],
		branchEvidence: ["feature/a"],
		diagnostics: [],
	};
}

function depsWith(runCommand: TabModuleDeps["runCommand"]): TabModuleDeps {
	return { cwd: "/repo", env: {}, runCommand };
}

describe("dashboardTabModule.interpretKey", () => {
	const state: DashboardState = { selectedWorkspaceRef: "workspace:45", mode: { type: "rows" } };

	test("maps dashboard navigation keys", () => {
		expect(dashboardTabModule.interpretKey(state, { name: "down" })).toEqual({ type: "action", action: { type: "move-selection", delta: 1 } });
		expect(dashboardTabModule.interpretKey(state, { sequence: "j" })).toEqual({ type: "action", action: { type: "move-selection", delta: 1 } });
		expect(dashboardTabModule.interpretKey(state, { name: "up" })).toEqual({ type: "action", action: { type: "move-selection", delta: -1 } });
		expect(dashboardTabModule.interpretKey(state, { sequence: "k" })).toEqual({ type: "action", action: { type: "move-selection", delta: -1 } });
	});

	test("maps activation, refresh, and quit", () => {
		expect(dashboardTabModule.interpretKey(state, { name: "enter" })).toEqual({ type: "effect", effect: { type: "activate-cmux" } });
		expect(dashboardTabModule.interpretKey(state, { sequence: "r" })).toEqual({ type: "refresh" });
		expect(dashboardTabModule.interpretKey(state, { sequence: "q" })).toEqual({ type: "quit" });
		expect(dashboardTabModule.interpretKey(state, { name: "escape" })).toEqual({ type: "quit" });
	});
});

describe("dashboardTabModule.runEffect", () => {
	test("focuses the planned cmux surface through injected command execution", async () => {
		const calls: CommandCall[] = [];
		const runCommand = async (command: string, args: readonly string[], options: CommandOptions = {}): Promise<CommandOutput> => {
			calls.push({ command, args: [...args], options });
			return { code: 0, stdout: "", stderr: "", killed: false };
		};
		const model = modelWithWorkspace(workspaceWithSurfaces([SURFACE]));
		const state = dashboardTabModule.createInitialState(model);

		const next = await dashboardTabModule.runEffect?.(model, state, { type: "activate-cmux" }, depsWith(runCommand));

		expect(next?.statusMessage).toBe("Focused cmux surface.");
		expect(calls).toEqual([
			{
				command: "cmux",
				args: ["rpc", "surface.focus", JSON.stringify({ surface_id: "surface:117", workspace_id: "workspace:45", window_id: "window:1" })],
				options: { cwd: "/repo", timeout: 10_000 },
			},
		]);
	});

	test("reports ambiguous multi-surface activation without inventing a chooser flow", async () => {
		const second: DashboardSurface = { ...SURFACE, ref: "surface:118", title: "other", here: false };
		const model = modelWithWorkspace(workspaceWithSurfaces([{ ...SURFACE, here: false }, second]));
		const state = dashboardTabModule.createInitialState(model);

		const next = await dashboardTabModule.runEffect?.(model, state, { type: "activate-cmux" }, depsWith(async () => ({ code: 0, stdout: "", stderr: "", killed: false })));

		expect(next?.statusMessage).toBe("Multiple surfaces in this workspace; selected/focused surface was ambiguous (2 choices).");
	});
});

describe("dashboardTabModule refresh state", () => {
	test("preserves selected workspace across refresh when it still exists", () => {
		const model = modelWithWorkspace(workspaceWithSurfaces([SURFACE]));
		const state: DashboardState = { selectedWorkspaceRef: "workspace:45", mode: { type: "rows" }, statusMessage: "hello" };

		const next = dashboardTabModule.refreshState?.(model, state, model);

		expect(next?.selectedWorkspaceRef).toBe("workspace:45");
		expect(next?.statusMessage).toBe("hello");
		expect(next?.lastRefreshAt).toEqual(expect.any(Number));
	});
});
