import { describe, expect, test } from "vitest";

import {
	buildStackMapModelFromGraph,
	loadStackMapModel,
	parseCmuxTreeTabs,
	type StackMapCommandOptions,
	type StackMapCommandOutput,
} from "../../src/stack-map-model-loader.ts";
import { buildNewWorkspaceArgs, buildSdlccCmuxReportBootstrapCommand, createStackMapCmuxActivationExecutor } from "../../src/stack-map-renderer.ts";
import {
	buildVisibleStackMapRows,
	choicesForCmuxActivationPlan,
	createInitialStackMapState,
	matchCmuxTabsToBranches,
	planStackMapCmuxActivation,
	reduceStackMapState,
	renderStackMapFrame,
	type StackMapCmuxTabTarget,
	type StackMapModel,
} from "../../src/stack-map.ts";

const MODEL: StackMapModel = {
	title: "stack map",
	diagnostics: ["loaded"],
	currentBranch: "feature/current",
	trunk: {
		name: "main",
		graphiteNote: "repo",
		children: [
			{
				name: "feature/current",
				graphiteNote: "current",
				slots: [{ slotName: "slot-04", branch: "feature/current", worktreePath: "/repo/slot-04", status: "assigned" }],
				children: [
					{
						name: "feature/child-with-longer-name",
						graphiteNote: "needs restack",
						slots: [{ slotName: "slot-02", branch: "feature/child-with-longer-name", status: "assigned" }],
					},
				],
			},
		],
	},
};

describe("buildStackMapModelFromGraph", () => {
	test("builds topology from sanctioned graph rows, slots, and needs_restack facts", () => {
		const model = buildStackMapModelFromGraph({
			branches: [
				{ name: "main", parent: undefined, children: ["feature/current", "feature/slot"], needsRestack: false },
				{ name: "feature/current", parent: "main", children: [], needsRestack: false },
				{ name: "feature/slot", parent: "main", children: ["feature/restack"], needsRestack: false },
				{ name: "feature/restack", parent: "feature/slot", children: [], needsRestack: true },
			],
			trunk: "main",
			current: "feature/current",
			edges: [
				{ parent: "main", child: "feature/current" },
				{ parent: "main", child: "feature/slot" },
			],
			slots: [{ branch: "feature/slot", slotName: "slot-04", worktreePath: "/repo/worktrees/slot-04", status: "assigned" }],
			warnings: ["graph warning"],
		});

		expect(model.title).toBe("sdlcc stack map");
		expect(model.diagnostics).toContain("Loaded from `slot gt exec stack-map-branches --format json`.");
		expect(model.diagnostics).toContain("graph warning");
		expect(model.trunk.children?.map((branch) => branch.name)).toEqual(["feature/current", "feature/slot"]);
		expect(model.trunk.children?.[1]?.slots?.[0]).toEqual({ branch: "feature/slot", slotName: "slot-04", worktreePath: "/repo/worktrees/slot-04", status: "assigned" });
		expect(model.trunk.children?.[1]?.children?.[0]?.graphiteNote).toBe("needs restack");
	});
});

describe("loadStackMapModel", () => {
	test("queries sanctioned graph and cmux inventory in parallel", async () => {
		const calls: string[] = [];
		const model = await loadStackMapModel({
			cwd: "/repo",
			runCommand: async (command: string, args: readonly string[], options: StackMapCommandOptions): Promise<StackMapCommandOutput> => {
				calls.push(`${options.cwd}$ ${command} ${args.join(" ")}`);
				if (command === "slot") return successJson({ exit_code: 0, data: stackMapGraphFixture() });
				if (command === "cmux") return successJson(cmuxTreeFixture({ includeExplicitWorktree: true }));
				return { code: 2, stdout: "", stderr: `unexpected command ${command}` };
			},
		});

		expect(calls.sort()).toEqual([
			"/repo$ cmux tree --json --all",
			"/repo$ slot gt exec stack-map-branches --format json",
		]);
		expect(model.trunk.children?.map((branch) => branch.name)).toEqual(["feature/a", "feature/recent"]);
		expect(model.trunk.children?.[0]?.slots?.[0]?.slotName).toBe("slot-04");
		expect(model.trunk.children?.[0]?.cmuxTabs?.[0]?.match).toEqual({ type: "slot-worktree", slotName: "slot-04", worktreePath: "/repo/worktrees/slot-04" });
	});
});

describe("parseCmuxTreeTabs", () => {
	test("extracts tab refs and optional explicit cwd evidence", () => {
		const result = parseCmuxTreeTabs(JSON.stringify(cmuxTreeFixture({ includeExplicitWorktree: true })));

		expect(result.type).toBe("success");
		if (result.type !== "success") return;
		expect(result.tabs[0]).toMatchObject({
			windowRef: "window:1",
			workspaceRef: "workspace:45",
			workspaceTitle: "feature/a",
			paneRef: "pane:45",
			surfaceRef: "surface:117",
			tabRef: "tab:117",
			tabTitle: "π - slot-04",
			surfaceType: "terminal",
			tty: "ttys000",
			explicitWorktreePath: "/repo/worktrees/slot-04",
		});
	});
});

describe("matchCmuxTabsToBranches", () => {
	test("rejects title-only cmux evidence as a strong activation target", () => {
		const parsed = parseCmuxTreeTabs(JSON.stringify(cmuxTreeFixture({ includeExplicitWorktree: false })));
		expect(parsed.type).toBe("success");
		if (parsed.type !== "success") return;

		const root = matchCmuxTabsToBranches({
			root: MODEL.trunk,
			slots: [{ slotName: "slot-04", branch: "feature/current", worktreePath: "/repo/slot-04", status: "assigned" }],
			tabs: parsed.tabs,
		});

		expect(root.children?.[0]?.cmuxTabs).toBeUndefined();
	});
});

describe("planStackMapCmuxActivation", () => {
	test("opens new when the selected branch has zero strong tab matches", () => {
		const plan = planStackMapCmuxActivation(MODEL, createInitialStackMapState(MODEL));

		expect(plan).toEqual({ type: "open-new", branch: "feature/current", slot: { slotName: "slot-04", branch: "feature/current", worktreePath: "/repo/slot-04", status: "assigned" } });
	});

	test("focuses one target and chooses among multiple targets", () => {
		const first = cmuxTarget("surface:1");
		const second = cmuxTarget("surface:2");
		const oneTargetModel = modelWithTabs([first]);
		const twoTargetModel = modelWithTabs([first, second]);

		expect(planStackMapCmuxActivation(oneTargetModel, createInitialStackMapState(oneTargetModel))).toEqual({ type: "focus-tab", branch: "feature/current", target: first });
		const choosePlan = planStackMapCmuxActivation(twoTargetModel, createInitialStackMapState(twoTargetModel));
		expect(choosePlan.type).toBe("choose-tab");
		expect(choicesForCmuxActivationPlan(choosePlan)).toHaveLength(3);
		expect(choicesForCmuxActivationPlan(choosePlan).at(-1)).toMatchObject({ type: "open-new", branch: "feature/current" });
	});
});

describe("reduceStackMapState", () => {
	test("moves chooser selection and cancels without quitting rows", () => {
		const first = cmuxTarget("surface:1");
		const second = cmuxTarget("surface:2");
		const choices = choicesForCmuxActivationPlan({ type: "choose-tab", branch: "feature/current", targets: [first, second], includeOpenNew: true });
		const choosing = reduceStackMapState(MODEL, createInitialStackMapState(MODEL), { type: "show-cmux-choice", branch: "feature/current", choices });
		const moved = reduceStackMapState(MODEL, choosing, { type: "move-choice", delta: 1 });
		const cancelled = reduceStackMapState(MODEL, moved, { type: "cancel-choice" });

		expect(moved.mode).toMatchObject({ type: "cmux-choice", selectedIndex: 1 });
		expect(cancelled.mode).toEqual({ type: "rows" });
	});
});

describe("createStackMapCmuxActivationExecutor", () => {
	test("focuses a target with cmux surface.focus RPC", async () => {
		const calls: string[] = [];
		const executor = createStackMapCmuxActivationExecutor({
			cwd: "/repo",
			runCommand: async (command, args, options) => {
				calls.push(`${options.cwd}$ ${command} ${args.join(" ")}`);
				return { code: 0, stdout: "{}", stderr: "" };
			},
		});

		await expect(executor.focusTab(cmuxTarget("surface:117"))).resolves.toEqual({ type: "focused" });
		expect(calls).toEqual([
			'/repo$ cmux rpc surface.focus {"surface_id":"surface:117","workspace_id":"workspace:45","window_id":"window:1"}',
		]);
	});

	test("opens a new workspace in an existing slot worktree", async () => {
		const calls: string[] = [];
		const executor = createStackMapCmuxActivationExecutor({
			cwd: "/repo",
			runCommand: async (command, args, options) => {
				calls.push(`${options.cwd}$ ${command} ${args.join(" ")}`);
				return { code: 0, stdout: "{}", stderr: "" };
			},
		});

		await expect(executor.openNew("feature/current", { slotName: "slot-04", branch: "feature/current", worktreePath: "/repo/slot-04", status: "assigned" })).resolves.toMatchObject({ type: "opened" });
		expect(calls).toHaveLength(1);
		expect(calls[0]).toContain("/repo/slot-04$ cmux new-workspace --name feature/current --description sdlcc cmux workspace for feature/current --cwd /repo/slot-04 --command bun '");
		expect(calls[0]).toContain("/src/cli.ts' cmux report || true; exec ${SHELL:-/bin/zsh} -l");
		expect(buildNewWorkspaceArgs({ branchName: "feature/current", worktreePath: "/repo/slot-04", description: "desc" })).toEqual([
			"new-workspace",
			"--name",
			"feature/current",
			"--description",
			"desc",
			"--cwd",
			"/repo/slot-04",
			"--command",
			buildSdlccCmuxReportBootstrapCommand(),
		]);
		expect(buildSdlccCmuxReportBootstrapCommand("/repo/with space/src/cli.ts")).toBe("bun '/repo/with space/src/cli.ts' cmux report || true; exec ${SHELL:-/bin/zsh} -l");
		expect(buildSdlccCmuxReportBootstrapCommand("/repo/with'quote/src/cli.ts")).toBe("bun '/repo/with'\\''quote/src/cli.ts' cmux report || true; exec ${SHELL:-/bin/zsh} -l");
	});
});

describe("buildVisibleStackMapRows", () => {
	test("renders gt-ls-style lanes with exact glyphs, sorted lanes, and trunk join last", () => {
		const model: StackMapModel = {
			title: "stack map",
			diagnostics: [],
			currentBranch: "b-leaf",
			trunk: {
				name: "main",
				children: [
					{ name: "c-parent" },
					{ name: "b-parent", children: [{ name: "b-child", children: [{ name: "b-leaf" }] }] },
					{ name: "a-parent" },
				],
			},
		};

		const rows = buildVisibleStackMapRows(model, createInitialStackMapState(model));

		expect(rows.map((row) => row.branch.name)).toEqual(["a-parent", "b-leaf", "b-child", "b-parent", "c-parent", "main"]);
		expect(rows.map((row) => row.topo)).toEqual(["◯", "│ ◉", "│ ◯", "│ ◯", "│ │ ◯", "◯─┴─┴"]);
		expect(rows.at(-1)?.branch.name).toBe("main");
		expect(rows.at(-1)?.topo).toBe("◯─┴─┴");
		expect(rows.some((row) => row.topo.includes("○"))).toBe(false);
	});

	test("cmux filter includes the whole matching lane and hides unrelated lanes", () => {
		const model: StackMapModel = {
			title: "stack map",
			diagnostics: [],
			currentBranch: "a-parent",
			trunk: {
				name: "main",
				children: [
					{ name: "a-parent" },
					{ name: "b-parent", children: [{ name: "b-child", slots: [{ branch: "b-child", slotName: "slot-02", status: "assigned" }] }] },
				],
			},
		};

		const rows = buildVisibleStackMapRows(model, { ...createInitialStackMapState(model), filter: "cmux" });

		expect(rows.map((row) => row.branch.name)).toEqual(["b-child", "b-parent", "main"]);
		expect(rows.map((row) => row.topo)).toEqual(["◯", "◯", "◯"]);
	});
});

describe("renderStackMapFrame", () => {
	test("keeps branch rows aligned while rendering diagnostics separately", () => {
		const frame = renderStackMapFrame(MODEL, createInitialStackMapState(MODEL));
		const lines = frame.split("\n");
		const tableLines = lines.filter((line) => line.includes(" │ ") && !line.includes("─┼─"));
		const header = tableLines[0];
		const trunkLine = lines.find((line) => /^\s*◯\s+main/.test(line));

		expect(frame).toContain("Diagnostics:\n- loaded");
		expect(header).toContain("TOPO");
		expect(header).toContain("  BRANCH");
		expect(header).not.toContain("TOPO │ BRANCH");
		expect(frame).toContain("c cmux");
		expect(frame).not.toContain("? hide/show");
		expect(trunkLine ?? "").toMatch(/^\s*◯\s+main/);
		expect(trunkLine).toContain(" │ repo");
		expect(frame).not.toContain("◯─┘");
		expect(frame).not.toContain("◯ │ main");
		expect(frame).not.toContain("│ main");
		expect(tableLines.length).toBe(4);
		expect(tableLines.map(tableSeparatorIndexes)).toEqual(tableLines.map(() => tableSeparatorIndexes(header ?? "")));
	});
});

function stackMapGraphFixture(): unknown {
	return {
		branches: [
			{ name: "main", parent: null, children: ["feature/a", "feature/recent"], needs_restack: false },
			{ name: "feature/a", parent: "main", children: [], needs_restack: false },
			{ name: "feature/recent", parent: "main", children: [], needs_restack: false },
		],
		trunk: "main",
		current: "feature/a",
		edges: [
			{ parent: "main", child: "feature/a" },
			{ parent: "main", child: "feature/recent" },
		],
		slots: [{ slot_name: "slot-04", branch: "feature/a", worktree_path: "/repo/worktrees/slot-04", status: "assigned" }],
		warnings: [],
	};
}

function modelWithTabs(tabs: readonly StackMapCmuxTabTarget[]): StackMapModel {
	return {
		...MODEL,
		trunk: {
			...MODEL.trunk,
			children: MODEL.trunk.children?.map((branch) => branch.name === "feature/current" ? { ...branch, cmuxTabs: tabs } : branch),
		},
	};
}

function cmuxTarget(surfaceRef: string): StackMapCmuxTabTarget {
	return {
		windowRef: "window:1",
		workspaceRef: "workspace:45",
		workspaceTitle: "feature/current",
		paneRef: "pane:45",
		surfaceRef,
		tabRef: surfaceRef.replace("surface", "tab"),
		tabTitle: "π - slot-04",
		surfaceType: "terminal",
		isActive: false,
		isHere: false,
		isSelected: false,
		match: { type: "explicit-branch", branch: "feature/current" },
	};
}

function cmuxTreeFixture(options: { readonly includeExplicitWorktree: boolean }): unknown {
	const worktreeEntry = options.includeExplicitWorktree ? { cwd: "/repo/worktrees/slot-04" } : {};
	return {
		windows: [
			{
				ref: "window:1",
				workspaces: [
					{
						ref: "workspace:45",
						title: "feature/a",
						description: "title-only diagnostic text is not branch evidence",
						panes: [
							{
								ref: "pane:45",
								surfaces: [
									{
										ref: "surface:117",
										tab_ref: "tab:117",
										title: "π - slot-04",
										type: "terminal",
										tty: "ttys000",
										active: false,
										here: false,
										selected: true,
										...worktreeEntry,
									},
								],
							},
						],
					},
				],
			},
		],
	};
}

function tableSeparatorIndexes(line: string): readonly number[] {
	return [...line.matchAll(/ │ /g)].map((match) => match.index);
}

function successJson(value: unknown): StackMapCommandOutput {
	return { code: 0, stdout: JSON.stringify(value), stderr: "" };
}
