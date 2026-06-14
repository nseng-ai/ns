import { describe, expect, test } from "vitest";

import {
	buildStackMapModelFromCommands,
	buildStackMapModelFromMetadata,
	loadStackMapPrototypeModel,
	type StackMapCommandOptions,
	type StackMapCommandOutput,
} from "../../src/stack-map-model-loader.ts";
import { createInitialStackMapState, renderStackMapPrototypeFrame, type StackMapPrototypeModel } from "../../src/stack-map-prototype.ts";

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
				workspaces: [{ label: "slot-04", isActive: true }],
				children: [
					{
						name: "feature/child-with-longer-name",
						graphiteNote: "needs restack",
						workspaces: [{ label: "slot-02", isDirty: true }],
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
			[{ branch: "feature/slot", slotName: "slot-04" }],
			["feature/recent"],
		);

		expect(model.trunk.children?.map((branch) => branch.name)).toEqual(["feature/current", "feature/slot", "feature/recent"]);
		expect(model.trunk.children?.[1]?.workspaces?.[0]?.label).toBe("slot-04");
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
				{ branch: "feature/a", slotName: "slot-01" },
				{ branch: "feature/c", slotName: "slot-03" },
			],
		);

		expect(model.trunk.name).toBe("main");
		expect(model.trunk.children?.[0]?.name).toBe("feature/a");
		expect(model.trunk.children?.[0]?.workspaces?.[0]?.label).toBe("slot-01");
		expect(model.trunk.children?.[0]?.children?.[0]?.name).toBe("feature/b");
		expect(model.trunk.children?.[0]?.children?.[0]?.graphiteNote).toBe("current");
		expect(model.trunk.children?.[0]?.children?.[0]?.children?.[0]?.workspaces?.[0]?.label).toBe("slot-03");
	});
});

describe("loadStackMapPrototypeModel", () => {
	test("queries stack, slots, Graphite metadata, and recent local branches", async () => {
		const calls: string[] = [];
		const model = await loadStackMapPrototypeModel({
			cwd: "/repo",
			runCommand: async (command: string, args: readonly string[], options: StackMapCommandOptions): Promise<StackMapCommandOutput> => {
				calls.push(`${options.cwd}$ ${command} ${args.join(" ")}`);
				if (command === "slot" && args[0] === "gt") return successJson({ exit_code: 0, data: { branches: ["feature/a"], trunk: "main", current: "feature/a", edges: [{ parent: "main", child: "feature/a" }], warnings: [] } });
				if (command === "slot") return successJson({ exit_code: 0, data: { rows: [{ slot_name: "slot-04", branch: "feature/a" }] } });
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
			"/repo$ git rev-parse --path-format=absolute --git-common-dir",
			"/repo$ sqlite3 -readonly -json /repo/.git/.graphite_metadata.db SELECT branch_name, parent_branch_name, children, validation_result FROM branch_metadata",
			"/repo$ git for-each-ref --format=%(refname:short) --sort=-committerdate --count=40 refs/heads",
		]);
		expect(model.trunk.children?.map((branch) => branch.name)).toEqual(["feature/a", "feature/recent"]);
		expect(model.trunk.children?.[0]?.workspaces?.[0]?.label).toBe("slot-04");
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
		expect(tableLines.length).toBe(4);
		expect(tableLines.map(tableSeparatorIndexes)).toEqual(tableLines.map(() => tableSeparatorIndexes(header ?? "")));
	});
});

function tableSeparatorIndexes(line: string): readonly number[] {
	return [...line.matchAll(/ │ /g)].map((match) => match.index);
}

function successJson(value: unknown): StackMapCommandOutput {
	return { code: 0, stdout: JSON.stringify(value), stderr: "" };
}
