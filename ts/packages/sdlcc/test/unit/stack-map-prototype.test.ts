import { describe, expect, test } from "vitest";

import {
	buildStackMapModelFromCommands,
	buildStackMapModelFromMetadata,
	loadStackMapPrototypeModel,
	parseCmuxTreeTabs,
	type StackMapCommandOptions,
	type StackMapCommandOutput,
} from "../../src/stack-map-model-loader.ts";
import { buildNewWorkspaceArgs, buildSdlccCmuxReportBootstrapCommand, createStackMapCmuxActivationExecutor } from "../../src/stack-map-prototype-renderer.ts";
import {
	choicesForCmuxActivationPlan,
	createInitialStackMapState,
	matchCmuxTabsToBranches,
	planStackMapCmuxActivation,
	reduceStackMapPrototypeState,
	renderStackMapPrototypeFrame,
	type StackMapCmuxTabTarget,
	type StackMapPrototypeModel,
} from "../../src/stack-map-prototype.ts";

const MODEL: StackMapPrototypeModel = {
	title: "stack map",
	question: "question",
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

describe("buildStackMapModelFromMetadata", () => {
	test("includes current branch, slot branches, recent local branches, and descendants from Graphite metadata", () => {
		const model = buildStackMapModelFromMetadata(
			{
				branches: ["feature/current"],
				trunk: "main",
				current: "feature/current",
				edges: [{ parent: "main", child: "feature/current" }],
				warnings: [],
			},
			[
				{ branch: "main", parent: undefined, children: ["feature/current", "feature/slot", "feature/recent"], isTrunk: true },
				{ branch: "feature/current", parent: "main", children: [], isTrunk: false },
				{ branch: "feature/slot", parent: "main", children: ["feature/slot-child"], isTrunk: false },
				{ branch: "feature/slot-child", parent: "feature/slot", children: [], isTrunk: false },
				{ branch: "feature/recent", parent: "main", children: [], isTrunk: false },
			],
			[{ branch: "feature/slot", slotName: "slot-04", worktreePath: "/repo/worktrees/slot-04", status: "assigned" }],
			["feature/recent"],
		);

		expect(model.trunk.children?.map((branch) => branch.name)).toEqual(["feature/current", "feature/slot", "feature/recent"]);
		expect(model.trunk.children?.[1]?.slots?.[0]).toEqual({ branch: "feature/slot", slotName: "slot-04", worktreePath: "/repo/worktrees/slot-04", status: "assigned" });
		expect(model.trunk.children?.[1]?.children?.[0]?.name).toBe("feature/slot-child");
	});
});

describe("buildStackMapModelFromCommands", () => {
	test("builds branch topology from slot gt machine edges and slot labels", () => {
		const model = buildStackMapModelFromCommands(
			{
				branches: ["feature/a", "feature/b", "feature/c"],
				trunk: "main",
				current: "feature/b",
				edges: [
					{ parent: "main", child: "feature/a" },
					{ parent: "feature/a", child: "feature/b" },
					{ parent: "feature/b", child: "feature/c" },
				],
				warnings: [],
			},
			[
				{ branch: "feature/a", slotName: "slot-01", worktreePath: "/repo/slot-01", status: "assigned" },
				{ branch: "feature/c", slotName: "slot-03", status: "unknown" },
			],
		);

		expect(model.trunk.name).toBe("main");
		expect(model.trunk.children?.[0]?.name).toBe("feature/a");
		expect(model.trunk.children?.[0]?.slots?.[0]?.worktreePath).toBe("/repo/slot-01");
		expect(model.trunk.children?.[0]?.children?.[0]?.name).toBe("feature/b");
		expect(model.trunk.children?.[0]?.children?.[0]?.graphiteNote).toBe("current");
		expect(model.trunk.children?.[0]?.children?.[0]?.children?.[0]?.slots?.[0]?.slotName).toBe("slot-03");
	});
});

describe("loadStackMapPrototypeModel", () => {
	test("queries stack, slots, cmux, Graphite metadata, and recent local branches", async () => {
		const calls: string[] = [];
		const model = await loadStackMapPrototypeModel({
			cwd: "/repo",
			runCommand: async (command: string, args: readonly string[], options: StackMapCommandOptions): Promise<StackMapCommandOutput> => {
				calls.push(`${options.cwd}$ ${command} ${args.join(" ")}`);
				if (command === "slot" && args[0] === "gt") return successJson({ exit_code: 0, data: { branches: ["feature/a"], trunk: "main", current: "feature/a", edges: [{ parent: "main", child: "feature/a" }], warnings: [] } });
				if (command === "slot") return successJson({ exit_code: 0, data: { rows: [{ slot_name: "slot-04", branch: "feature/a", worktree_path: "/repo/worktrees/slot-04", status: "assigned" }] } });
				if (command === "cmux") return successJson(cmuxTreeFixture({ includeExplicitWorktree: true }));
				if (command === "git" && args[0] === "rev-parse") return { code: 0, stdout: "/repo/.git\n", stderr: "" };
				if (command === "sqlite3") {
					return successJson([
						{ branch_name: "main", parent_branch_name: null, children: JSON.stringify(["feature/a", "feature/recent"]), validation_result: "TRUNK" },
						{ branch_name: "feature/a", parent_branch_name: "main", children: "[]", validation_result: "VALID" },
						{ branch_name: "feature/recent", parent_branch_name: "main", children: "[]", validation_result: "VALID" },
					]);
				}
				if (command === "git" && args[0] === "for-each-ref") return { code: 0, stdout: "feature/recent\n", stderr: "" };
				return { code: 2, stdout: "", stderr: `unexpected command ${command}` };
			},
		});

		expect(calls).toEqual([
			"/repo$ slot gt exec stack-branches --format json",
			"/repo$ slot list --format json",
			"/repo$ cmux tree --json --all",
			"/repo$ git rev-parse --path-format=absolute --git-common-dir",
			"/repo$ sqlite3 -readonly -json /repo/.git/.graphite_metadata.db SELECT branch_name, parent_branch_name, children, validation_result FROM branch_metadata",
			"/repo$ git for-each-ref --format=%(refname:short) --sort=-committerdate --count=40 refs/heads",
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

describe("reduceStackMapPrototypeState", () => {
	test("moves chooser selection and cancels without quitting rows", () => {
		const first = cmuxTarget("surface:1");
		const second = cmuxTarget("surface:2");
		const choices = choicesForCmuxActivationPlan({ type: "choose-tab", branch: "feature/current", targets: [first, second], includeOpenNew: true });
		const choosing = reduceStackMapPrototypeState(MODEL, createInitialStackMapState(MODEL), { type: "show-cmux-choice", branch: "feature/current", choices });
		const moved = reduceStackMapPrototypeState(MODEL, choosing, { type: "move-choice", delta: 1 });
		const cancelled = reduceStackMapPrototypeState(MODEL, moved, { type: "cancel-choice" });

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

describe("renderStackMapPrototypeFrame", () => {
	test("keeps topology in a left gutter and aligns branch metadata as a table", () => {
		const frame = renderStackMapPrototypeFrame(MODEL, createInitialStackMapState(MODEL));
		const lines = frame.split("\n");
		const tableLines = lines.filter((line) => line.includes(" │ ") && !line.includes("─┼─"));
		const header = tableLines[0];

		expect(header).toContain("TOPO");
		expect(header).toContain("│ BRANCH");
		expect(frame).toContain("c cmux");
		expect(tableLines.length).toBe(4);
		expect(tableLines.map(tableSeparatorIndexes)).toEqual(tableLines.map(() => tableSeparatorIndexes(header ?? "")));
	});
});

function modelWithTabs(tabs: readonly StackMapCmuxTabTarget[]): StackMapPrototypeModel {
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
