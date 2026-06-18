import { describe, expect, it } from "vitest";

import { renderList, type ListResult } from "../../src/operations/list.ts";
import { parseJsonOutput, runScenario, slotWorktree } from "../support/run-scenario.ts";

const nonEmptyListGit = {
	worktrees: [slotWorktree("slot-01", "feature/a"), slotWorktree("slot-02", null), slotWorktree("slot-03", "feature/rebase")],
	branchOccupancies: [
		{ path: "/slots/repos/repo/worktrees/slot-01", branch: "feature/a", operation: "checked-out" },
		{ path: "/slots/repos/repo/worktrees/slot-03", branch: "feature/rebase", operation: "rebase" },
	],
};

const sampleListResult: ListResult = {
	pool_size: 3,
	repo_name: "repo",
	rows: [
		{ slot_name: "slot-01", branch: "feature/a", operation: null, status: "assigned", worktree_path: "/slots/repos/repo/worktrees/slot-01" },
		{ slot_name: "slot-02", branch: null, operation: null, status: "available", worktree_path: "/slots/repos/repo/worktrees/slot-02" },
		{ slot_name: "slot-03", branch: "feature/rebase", operation: "rebase", status: "assigned", worktree_path: "/slots/repos/repo/worktrees/slot-03" },
	],
};

describe("slot list CLI", () => {
	it("prints version and runtime diagnostics", async () => {
		const version = runScenario(["--version"]);
		expect(await version.exit).toBe(0);
		expect(version.stdout.join("")).toContain("0.1.0");

		const runtime = runScenario(["--runtime"]);
		expect(await runtime.exit).toBe(0);
		expect(runtime.stdout.join("")).toContain("runtime: typescript");
		expect(runtime.stdout.join("")).toContain("ts/packages/slot/src/cli.ts");
	});

	it("shows list, ls, init, and resize in help", async () => {
		const run = runScenario(["--help"]);
		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		for (const command of ["list", "ls", "init", "resize"]) expect(help).toContain(command);
	});

	it("renders an empty pool in human mode", async () => {
		const run = runScenario(["list"], { git: { worktrees: [{ path: "/repo", branch: "master" }] } });
		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("No slots initialized for repo.");
	});

	it("renders assigned, available, and operation rows in human mode", async () => {
		const run = runScenario(["ls"], { git: nonEmptyListGit });
		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("SLOT");
		expect(output).toContain("STATUS");
		expect(output).toContain("BRANCH");
		expect(output).toContain("OPERATION");
		expect(output).toContain("WORKTREE");
		expect(output).toMatch(/^─/mu);
		expect(output).toMatch(/^slot-01\s+assigned\s+feature\/a\s+—\s+\/slots\/repos\/repo\/worktrees\/slot-01$/mu);
		expect(output).toMatch(/^slot-02\s+available\s+—\s+—\s+\/slots\/repos\/repo\/worktrees\/slot-02$/mu);
		expect(output).toMatch(/^slot-03\s+assigned\s+feature\/rebase\s+rebase in progress\s+\/slots\/repos\/repo\/worktrees\/slot-03$/mu);
	});

	it("propagates ANSI capability to the list table renderer", () => {
		const colorOutput = renderList(sampleListResult, { canEmitAnsi: true });
		const plainOutput = renderList(sampleListResult, { canEmitAnsi: false });
		expect(colorOutput).toContain(String.fromCharCode(0x1b));
		expect(plainOutput).not.toContain(String.fromCharCode(0x1b));
	});

	it("renders assigned, available, and operation rows as JSON", async () => {
		const run = runScenario(["ls", "--format", "json"], { git: nonEmptyListGit });
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			exit_code: 0,
			data: {
				pool_size: 3,
				repo_name: "repo",
				rows: [
					{ slot_name: "slot-01", branch: "feature/a", operation: null, status: "assigned" },
					{ slot_name: "slot-02", branch: null, operation: null, status: "available" },
					{ slot_name: "slot-03", branch: "feature/rebase", operation: "rebase", status: "assigned" },
				],
			},
		});
	});

	it("prints a JSON schema for machine consumers", async () => {
		const run = runScenario(["list", "--json-schema"]);
		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("pool_size");
	});
});
