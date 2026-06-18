import { describe, expect, test } from "vitest";

import {
	buildStackMapModelFromGraph,
	loadStackMapModel,
	parseCmuxTreeTabs,
	type CommandOptions,
	type CommandOutput,
} from "../../src/stack-map-model-loader.ts";
import { buildNewWorkspaceArgs, buildSdlccCmuxReportBootstrapCommand, createStackMapCmuxActivationExecutor } from "../../src/stack-map-effects.ts";
import { printableCharacterFromInput } from "../../src/tabs/key-input.ts";
import { interpretStackMapKey } from "../../src/stack-map-tab.ts";
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
			runCommand: async (command: string, args: readonly string[], options: CommandOptions = {}): Promise<CommandOutput> => {
				calls.push(`${options.cwd}$ ${command} ${args.join(" ")}`);
				if (command === "slot") return successJson({ exit_code: 0, data: stackMapGraphFixture() });
				if (command === "cmux") return successJson(cmuxTreeFixture({ includeExplicitWorktree: true }));
				return { code: 2, stdout: "", stderr: `unexpected command ${command}`, killed: false };
			},
		});

		expect(calls.sort()).toEqual([
			"/repo$ cmux tree --json --all",
			"/repo$ slot gt exec stack-map-branches --format json",
		]);
		expect(model.trunk.children?.map((branch) => branch.name)).toEqual(["feature/a", "feature/recent"]);
		expect(model.trunk.children?.[0]?.slots?.[0]?.slotName).toBe("slot-04");
		expect(model.trunk.children?.[0]?.children?.[0]?.graphiteNote).toBe("needs restack");
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

	test("does not activate a selected branch hidden by current filters", () => {
		const plan = planStackMapCmuxActivation(MODEL, { ...createInitialStackMapState(MODEL), query: "does-not-match" });

		expect(plan).toEqual({ type: "unavailable", reason: "No selected branch is visible under the current scope/query." });
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

	test("query actions repair selection when possible and keep empty selections inert", () => {
		const start = reduceStackMapState(MODEL, createInitialStackMapState(MODEL), { type: "start-query" });
		const childQuery = reduceStackMapState(MODEL, start, { type: "append-query", value: "main" });
		const emptyQuery = reduceStackMapState(MODEL, childQuery, { type: "append-query", value: "-missing" });
		const accepted = reduceStackMapState(MODEL, emptyQuery, { type: "accept-query" });
		const cleared = reduceStackMapState(MODEL, accepted, { type: "clear-query" });

		expect(start.mode).toEqual({ type: "query" });
		expect(childQuery.selectedBranch).toBe("main");
		expect(buildVisibleStackMapRows(MODEL, emptyQuery)).toHaveLength(0);
		expect(emptyQuery.selectedBranch).toBe("main");
		expect(accepted.mode).toEqual({ type: "rows" });
		expect(cleared.query).toBe("");
		expect(cleared.mode).toEqual({ type: "rows" });
	});
});

describe("createStackMapCmuxActivationExecutor", () => {
	test("focuses a target with cmux surface.focus RPC", async () => {
		const calls: string[] = [];
		const executor = createStackMapCmuxActivationExecutor({
			cwd: "/repo",
			runCommand: async (command, args, options = {}) => {
				calls.push(`${options.cwd}$ ${command} ${args.join(" ")}`);
				return { code: 0, stdout: "{}", stderr: "", killed: false };
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
			runCommand: async (command, args, options = {}) => {
				calls.push(`${options.cwd}$ ${command} ${args.join(" ")}`);
				return { code: 0, stdout: "{}", stderr: "", killed: false };
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

	test("cmux scope includes live cmux-tab lanes and excludes slot-only branches", () => {
		const model: StackMapModel = {
			title: "stack map",
			diagnostics: [],
			currentBranch: "a-parent",
			trunk: {
				name: "main",
				children: [
					{ name: "a-parent" },
					{ name: "b-parent", children: [{ name: "b-child", slots: [{ branch: "b-child", slotName: "slot-02", status: "assigned" }] }] },
					{ name: "c-parent", children: [{ name: "c-child", cmuxTabs: [cmuxTarget("surface:3")] }] },
				],
			},
		};

		const rows = buildVisibleStackMapRows(model, { ...createInitialStackMapState(model), scope: "cmux" });

		expect(rows.map((row) => row.branch.name)).toEqual(["c-child", "c-parent", "main"]);
		expect(rows.map((row) => row.topo)).toEqual(["◯", "◯", "◯"]);
	});

	test("branch-name query preserves ancestors and trunk but hides unrelated siblings", () => {
		const model: StackMapModel = {
			title: "stack map",
			diagnostics: [],
			currentBranch: "a-parent",
			trunk: {
				name: "main",
				children: [
					{ name: "a-parent", children: [{ name: "needle-child" }, { name: "other-child" }] },
					{ name: "z-parent", children: [{ name: "z-child" }] },
				],
			},
		};

		const rows = buildVisibleStackMapRows(model, { ...createInitialStackMapState(model), query: " NEEDLE " });

		expect(rows.map((row) => row.branch.name)).toEqual(["needle-child", "a-parent", "main"]);
	});

	test("scope and query compose before topology context is added", () => {
		const matchingTab = cmuxTarget("surface:4");
		const model: StackMapModel = {
			title: "stack map",
			diagnostics: [],
			currentBranch: "feature/current",
			trunk: {
				name: "main",
				children: [
					{ name: "feature/query-hit-without-tab" },
					{ name: "feature/query-hit-with-tab", cmuxTabs: [matchingTab] },
					{ name: "feature/tab-without-query", cmuxTabs: [cmuxTarget("surface:5")] },
				],
			},
		};

		const rows = buildVisibleStackMapRows(model, { ...createInitialStackMapState(model), scope: "cmux", query: "hit-with-tab" });

		expect(rows.map((row) => row.branch.name)).toEqual(["feature/query-hit-with-tab", "main"]);
	});
});

describe("interpretStackMapKey", () => {
	test("maps row-mode keys to semantic intents", () => {
		const state = createInitialStackMapState(MODEL);

		expect(interpretStackMapKey(state, { name: "/", sequence: "/" })).toEqual({ type: "action", action: { type: "start-query" } });
		expect(interpretStackMapKey(state, { sequence: "/" })).toEqual({ type: "action", action: { type: "start-query" } });
		expect(interpretStackMapKey(state, { name: "o", sequence: "o" })).toEqual({ type: "action", action: { type: "toggle-scope" } });
		expect(interpretStackMapKey(state, { name: "c", sequence: "c" })).toEqual({ type: "effect", effect: { type: "activate-cmux" } });
		expect(interpretStackMapKey(state, { name: "q", sequence: "q" })).toEqual({ type: "quit" });
	});

	test("query mode consumes printable shortcuts as text", () => {
		const state = { ...createInitialStackMapState(MODEL), mode: { type: "query" as const }, query: "fea" };

		expect(interpretStackMapKey(state, { name: "q", sequence: "q" })).toEqual({ type: "action", action: { type: "append-query", value: "q" } });
		expect(interpretStackMapKey(state, { name: "backspace", sequence: "\x7F" })).toEqual({ type: "action", action: { type: "delete-query-char" } });
		expect(interpretStackMapKey(state, { name: "enter", sequence: "\r" })).toEqual({ type: "action", action: { type: "accept-query" } });
		expect(interpretStackMapKey(state, { name: "escape", sequence: "\x1B" })).toEqual({ type: "action", action: { type: "clear-query" } });
		expect(printableCharacterFromInput({ sequence: " " })).toBe(" ");
		expect(printableCharacterFromInput({ ctrl: true, sequence: "a" })).toBeUndefined();
	});
});

describe("renderStackMapFrame", () => {
	test("keeps branch rows aligned while rendering diagnostics separately", () => {
		const frame = renderStackMapFrame(MODEL, createInitialStackMapState(MODEL));
		const lines = frame.split("\n");
		const tableLines = lines.filter((line) => line.includes(" │ ") && !line.includes("─┼─"));
		const header = tableLines[0];
		const trunkLine = lines.find((line) => /^\s*◯\s+main/.test(line));

		expect(frame).not.toContain("Diagnostics:");
		expect(frame).toContain("d show diagnostics (1)");
		expect(header).toContain("TOPO");
		expect(header).toContain("  BRANCH");
		expect(header).not.toContain("TOPO │ BRANCH");
		expect(frame).toContain("State: scope=all; visibleBranches=3; selected=feature/current");
		expect(frame).toContain("/ filter  c cmux  o all/cmux");
		expect(frame).not.toContain("? hide/show");
		expect(frame).not.toContain(`filter${"="}all`);
		expect(trunkLine ?? "").toMatch(/^\s*◯\s+main/);
		expect(trunkLine).toContain(" │ repo");
		expect(frame).not.toContain("◯─┘");
		expect(frame).not.toContain("◯ │ main");
		expect(frame).not.toContain("│ main");
		expect(tableLines.length).toBe(4);
		expect(tableLines.map(tableSeparatorIndexes)).toEqual(tableLines.map(() => tableSeparatorIndexes(header ?? "")));
	});

	test("toggles the diagnostics block via toggle-diagnostics", () => {
		const initial = createInitialStackMapState(MODEL);
		expect(initial.areDiagnosticsShown).toBe(false);

		const shown = reduceStackMapState(MODEL, initial, { type: "toggle-diagnostics" });
		const shownFrame = renderStackMapFrame(MODEL, shown);
		expect(shown.areDiagnosticsShown).toBe(true);
		expect(shownFrame).toContain("Diagnostics:\n- loaded");
		expect(shownFrame).toContain("d hide diagnostics");

		const hiddenAgain = reduceStackMapState(MODEL, shown, { type: "toggle-diagnostics" });
		const hiddenFrame = renderStackMapFrame(MODEL, hiddenAgain);
		expect(hiddenAgain.areDiagnosticsShown).toBe(false);
		expect(hiddenFrame).not.toContain("Diagnostics:");
		expect(hiddenFrame).toContain("d show diagnostics (1)");
	});

	test("maps the d key to toggle-diagnostics in rows mode", () => {
		expect(interpretStackMapKey(createInitialStackMapState(MODEL), { name: "d", sequence: "d" })).toEqual({
			type: "action",
			action: { type: "toggle-diagnostics" },
		});
	});

	test("renders query mode and empty-result feedback", () => {
		const frame = renderStackMapFrame(MODEL, { ...createInitialStackMapState(MODEL), query: "missing", mode: { type: "query" } });

		expect(frame).toContain("No branches match the current scope/query.");
		expect(frame).toContain('State: scope=all; query="missing"; visibleBranches=0; selected=<none>');
		expect(frame).toContain("Action: c unavailable; no visible branch is selected");
		expect(frame).toContain("Filter: type branch text  Backspace edit  Enter accept  Esc clear");
	});
});

function stackMapGraphFixture(): unknown {
	return {
		branches: [
			{ name: "main", parent: null, children: ["feature/a", "feature/recent"], validation_result: "TRUNK", needs_restack: false },
			{ name: "feature/a", parent: "main", children: ["feature/restack"], validation_result: "VALID", needs_restack: false },
			{ name: "feature/restack", parent: "feature/a", children: [], validation_result: "BAD_PARENT_NAME", needs_restack: true },
			{ name: "feature/recent", parent: "main", children: [], validation_result: "VALID", needs_restack: false },
		],
		trunk: "main",
		current: "feature/a",
		edges: [
			{ parent: "main", child: "feature/a" },
			{ parent: "feature/a", child: "feature/restack" },
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

function successJson(value: unknown): CommandOutput {
	return { code: 0, stdout: JSON.stringify(value), stderr: "", killed: false };
}
