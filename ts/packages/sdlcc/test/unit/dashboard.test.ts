import { describe, expect, test } from "vitest";

import { createDashboardModelFromCmuxTree } from "../../src/dashboard-model.ts";
import { createInitialDashboardState, planDashboardActivation, reduceDashboardState, renderDashboardFrame } from "../../src/dashboard.ts";
import type { StackMapModel } from "../../src/stack-map.ts";

const stackMapModel: StackMapModel = {
	title: "sdlcc stack map",
	diagnostics: [],
	currentBranch: "main",
	trunk: { name: "main" },
};

const cmux = {
	windows: [
		{
			ref: "window:1",
			index: 0,
			current: true,
			active: true,
			visible: true,
			workspaces: [
				{ ref: "workspace:1", title: "one", index: 0, active: true, selected: true, pinned: false, panes: [{ ref: "pane:1", active: true, focused: true, selected_surface_ref: "surface:1", surfaces: [{ ref: "surface:1", title: "shell", type: "terminal", active: true, focused: true, here: true, selected: true, selected_in_pane: true }] }] },
				{ ref: "workspace:2", title: "two", index: 1, active: false, selected: false, pinned: false, panes: [{ ref: "pane:2", active: false, focused: false, surfaces: [{ ref: "surface:2", title: "notes", type: "terminal", active: false, focused: false, here: false, selected: false, selected_in_pane: false, branch: "feature/x" }, { ref: "surface:3", title: "browser", type: "browser", active: false, focused: false, here: false, selected: false, selected_in_pane: false }] }] },
			],
		},
	],
};

describe("dashboard", () => {
	test("renders current-window workspaces and conservative buckets", () => {
		const model = createDashboardModelFromCmuxTree(cmux, stackMapModel);
		expect(model.windows).toHaveLength(1);
		expect(model.windows[0]!.workspaces).toHaveLength(2);
		expect(model.windows[0]!.workspaces[0]!.statusBuckets).toContain("here");
		expect(model.windows[0]!.workspaces[1]!.statusBuckets).toContain("multi-surface");
		expect(model.windows[0]!.workspaces[1]!.statusBuckets).toContain("unmatched-branch");
		const frameText = renderDashboardFrame(model, createInitialDashboardState(model)).chunks.map((chunk) => chunk.text).join("");
		expect(frameText).toContain("Keys:");
	});

	test("keeps selection by workspace ref across refresh", () => {
		const model = createDashboardModelFromCmuxTree(cmux, stackMapModel);
		const next = createDashboardModelFromCmuxTree({ windows: [{ ...cmux.windows[0]!, workspaces: [cmux.windows[0]!.workspaces[1]!] }] }, stackMapModel);
		const state = reduceDashboardState(model, createInitialDashboardState(model), { type: "move-selection", delta: 1 });
		expect(state.selectedWorkspaceRef).toBe("workspace:2");
		expect(reduceDashboardState(model, state, { type: "refresh", model: next }).selectedWorkspaceRef).toBe("workspace:2");
	});

	test("plans safe direct focus when a single surface is known", () => {
		const model = createDashboardModelFromCmuxTree(cmux, stackMapModel);
		const state = createInitialDashboardState(model);
		expect(planDashboardActivation(model, state).type).toBe("focus-surface");
	});
});
