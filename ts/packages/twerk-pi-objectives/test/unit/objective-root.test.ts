import { describe, expect, test } from "vitest";

import {
	completeObjectiveArgs,
	formatUnknownSubcommandMessage,
	parseRootArgs,
} from "../../src/commands/objective.ts";

describe("objective root command helpers", () => {
	test("completes all root subcommands for an empty prefix", () => {
		expect(completeObjectiveArgs("")).toEqual([
			{
				value: "claim ",
				label: "claim",
				description: "Claim an objective snapshot onto the current branch",
			},
			{
				value: "next ",
				label: "next",
				description: "Inspect an objective and suggest the next PR-sized slice",
			},
			{
				value: "list ",
				label: "list",
				description: "Render objective list in the Pi TUI",
			},
		]);
	});

	test.each([
		["c", ["claim "]],
		["n", ["next "]],
		["l", ["list "]],
	])("completes subcommand prefix %s", (prefix, values) => {
		expect(completeObjectiveArgs(prefix)?.map((item) => item.value)).toEqual(values);
	});

	test.each([
		["list --h", [{ value: "list --here", label: "--here", description: "list objective snapshots on the current branch" }]],
		["list --b", [{ value: "list --branch ", label: "--branch <name>", description: "list objective snapshots for a specific branch" }]],
		["list --a", [{ value: "list --all", label: "--all", description: "include closed objectives in repo view" }]],
		["list --c", [{ value: "list --closed", label: "--closed", description: "show only closed objectives in repo view" }]],
	])("completes list flag prefix %s", (prefix, expected) => {
		expect(completeObjectiveArgs(prefix)).toEqual(expected);
	});

	test("returns full replacements for ls flag completions", () => {
		expect(completeObjectiveArgs("ls --h")).toEqual([
			{
				value: "ls --here",
				label: "--here",
				description: "list objective snapshots on the current branch",
			},
		]);
	});

	test("preserves earlier list args when completing the current flag token", () => {
		expect(completeObjectiveArgs("list --here --c")).toEqual([
			{
				value: "list --here --closed",
				label: "--closed",
				description: "show only closed objectives in repo view",
			},
		]);
	});

	test.each(["claim da", "next da"])("does not complete dynamic slugs for %s", (prefix) => {
		expect(completeObjectiveArgs(prefix)).toBeNull();
	});

	test("parses subcommand and rest args", () => {
		expect(parseRootArgs("claim foo")).toEqual({ subcommand: "claim", restArgs: "foo" });
		expect(parseRootArgs("ls --here")).toEqual({ subcommand: "ls", restArgs: "--here" });
	});

	test("parses empty args", () => {
		expect(parseRootArgs("   ")).toEqual({ restArgs: "" });
	});

	test("formats unknown subcommand errors with valid choices", () => {
		expect(formatUnknownSubcommandMessage("wat")).toBe("Unknown objective subcommand: wat\nValid subcommands: claim, next, list, ls.");
	});
});
