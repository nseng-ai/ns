import { describe, expect, test } from "vitest";

import type { ObjectiveList } from "@asdl/pi-extension-runtime/objective-list";

import { objectiveTabModule, type ObjectiveTabState } from "../../src/objective-tab.ts";
import type { CommandOptions, CommandOutput } from "../../src/command-runner.ts";
import type { TabModuleDeps } from "../../src/tabs/tab-module.ts";

const LIST: ObjectiveList = {
	trunkBranch: "master",
	rootPath: ".asdl/objectives",
	statusFilter: "active",
	namesOnly: false,
	records: [
		{ slug: "alpha", status: "open", latestUpdateIso: "2026-06-01T00:00:00Z" },
		{ slug: "beta", status: "open", latestUpdateIso: null },
		{ slug: "gamma", status: "closed", latestUpdateIso: "2026-06-10T00:00:00Z" },
	],
};

interface CommandCall {
	readonly command: string;
	readonly args: readonly string[];
	readonly options: CommandOptions | undefined;
}

function depsWith(runCommand: TabModuleDeps["runCommand"]): TabModuleDeps {
	return { cwd: "/repo", env: {}, runCommand };
}

function envelope(data: unknown): string {
	return JSON.stringify({ exit_code: 0, data });
}

describe("objectiveTabModule.loadModel", () => {
	test("loads and parses a valid objective list envelope", async () => {
		const calls: CommandCall[] = [];
		const runCommand = async (
			command: string,
			args: readonly string[],
			options: CommandOptions = {},
		): Promise<CommandOutput> => {
			calls.push({ command, args: [...args], options });
			return {
				code: 0,
				stdout: envelope({
					trunkBranch: "master",
					rootPath: ".asdl/objectives",
					statusFilter: "active",
					namesOnly: false,
					records: [
						{
							slug: "alpha",
							status: "open",
							latestUpdateIso: "2026-06-01T00:00:00Z",
							hasOutstandingChanges: false,
						},
					],
				}),
				stderr: "",
				killed: false,
			};
		};

		const model = await objectiveTabModule.loadModel(depsWith(runCommand));
		expect(model.records).toEqual([
			{ slug: "alpha", status: "open", latestUpdateIso: "2026-06-01T00:00:00Z" },
		]);
		expect(calls).toEqual([
			{
				command: "objective",
				args: ["list", "--minimal", "--format", "json"],
				options: { cwd: "/repo", timeout: 10_000 },
			},
		]);
	});

	test("throws when the objective CLI exits non-zero", async () => {
		const runCommand = async (): Promise<CommandOutput> => ({
			code: 3,
			stdout: "",
			stderr: "not in a repo",
			killed: false,
		});
		await expect(objectiveTabModule.loadModel(depsWith(runCommand))).rejects.toThrow(
			/objective list failed with exit code 3.*not in a repo/,
		);
	});

	test("throws when the envelope payload is invalid", async () => {
		const runCommand = async (): Promise<CommandOutput> => ({
			code: 0,
			stdout: envelope({ trunk_branch: "master" }),
			stderr: "",
			killed: false,
		});
		await expect(objectiveTabModule.loadModel(depsWith(runCommand))).rejects.toThrow(
			/Invalid objective list JSON/,
		);
	});
});

describe("objectiveTabModule state", () => {
	test("selects the first record initially", () => {
		expect(objectiveTabModule.createInitialState(LIST)).toEqual({ selectedSlug: "alpha" });
	});

	test("selects nothing when the list is empty", () => {
		expect(objectiveTabModule.createInitialState({ ...LIST, records: [] })).toEqual({
			selectedSlug: undefined,
		});
	});

	test("move-selection moves down and wraps around the end", () => {
		const down = objectiveTabModule.reduce(
			LIST,
			{ selectedSlug: "alpha" },
			{ type: "move-selection", delta: 1 },
		);
		expect(down).toEqual({ selectedSlug: "beta" });

		const wrap = objectiveTabModule.reduce(
			LIST,
			{ selectedSlug: "gamma" },
			{ type: "move-selection", delta: 1 },
		);
		expect(wrap).toEqual({ selectedSlug: "alpha" });
	});

	test("move-selection wraps backward past the start", () => {
		const up = objectiveTabModule.reduce(
			LIST,
			{ selectedSlug: "alpha" },
			{ type: "move-selection", delta: -1 },
		);
		expect(up).toEqual({ selectedSlug: "gamma" });
	});

	test("move-selection is a no-op on an empty list", () => {
		const state: ObjectiveTabState = { selectedSlug: undefined };
		expect(
			objectiveTabModule.reduce({ ...LIST, records: [] }, state, {
				type: "move-selection",
				delta: 1,
			}),
		).toBe(state);
	});
});

describe("objectiveTabModule.interpretKey", () => {
	const state: ObjectiveTabState = { selectedSlug: "alpha" };

	test("maps navigation keys to move-selection", () => {
		expect(objectiveTabModule.interpretKey(state, { name: "down" })).toEqual({
			type: "action",
			action: { type: "move-selection", delta: 1 },
		});
		expect(objectiveTabModule.interpretKey(state, { name: "j" })).toEqual({
			type: "action",
			action: { type: "move-selection", delta: 1 },
		});
		expect(objectiveTabModule.interpretKey(state, { name: "up" })).toEqual({
			type: "action",
			action: { type: "move-selection", delta: -1 },
		});
		expect(objectiveTabModule.interpretKey(state, { name: "k" })).toEqual({
			type: "action",
			action: { type: "move-selection", delta: -1 },
		});
	});

	test("maps q and escape to quit", () => {
		expect(objectiveTabModule.interpretKey(state, { name: "q" })).toEqual({ type: "quit" });
		expect(objectiveTabModule.interpretKey(state, { name: "escape" })).toEqual({ type: "quit" });
	});

	test("ignores modified and unknown keys", () => {
		expect(objectiveTabModule.interpretKey(state, { name: "j", ctrl: true })).toEqual({
			type: "none",
		});
		expect(objectiveTabModule.interpretKey(state, { name: "x" })).toEqual({ type: "none" });
	});
});

describe("objectiveTabModule.render", () => {
	test("renders a cursor on the selected row and a detail line", () => {
		const lines = objectiveTabModule.render(LIST, { selectedSlug: "beta" });
		const joined = lines.join("\n");
		expect(joined).toContain("Objectives (status=active)");
		expect(lines.some((line) => line.startsWith("› ") && line.includes("beta"))).toBe(true);
		expect(lines.some((line) => line.startsWith("  ") && line.includes("alpha"))).toBe(true);
		expect(joined).toContain("Selected: beta — status=open; latest update=—");
		expect(joined).toContain("↑/k ↓/j select   Tab switch   q quit");
	});

	test("renders an empty-state message when there are no records", () => {
		const lines = objectiveTabModule.render({ ...LIST, records: [] }, { selectedSlug: undefined });
		expect(lines.join("\n")).toContain("No Objective records in this checkout.");
	});
});
