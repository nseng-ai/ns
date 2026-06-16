import { describe, expect, it } from "vitest";

import { parseJsonOutput, runScenario, slotWorktree } from "../support/run-scenario.ts";

describe("slot init CLI", () => {
	it("creates metadata dirs and detached worktrees from trunk", async () => {
		const run = runScenario(["init", "--size", "2", "--format", "json"], { git: { worktrees: [{ path: "/repo", branch: "master" }], trunkBranch: "main" } });
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ data: { pool_size: 2, created: ["slot-01", "slot-02"], worktrees_dir: "/slots/repos/repo/worktrees" } });
		expect(run.storage.operations()).toEqual([
			{ type: "ensure-dir", path: "/slots/repos/repo" },
			{ type: "ensure-dir", path: "/slots/repos/repo/worktrees" },
		]);
		expect(run.git.operations()).toEqual([
			{ type: "add-detached-worktree", path: "/slots/repos/repo/worktrees/slot-01", ref: "main" },
			{ type: "add-detached-worktree", path: "/slots/repos/repo/worktrees/slot-02", ref: "main" },
		]);
	});

	it("rejects invalid sizes", async () => {
		const run = runScenario(["init", "--size", "100", "--format", "json"]);
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ error_type: "invalid_size" });
	});

	it("rejects already initialized pools", async () => {
		const run = runScenario(["init", "--size", "1", "--format", "json"], { git: { worktrees: [slotWorktree("slot-01", null)] } });
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ error_type: "pool_already_initialized" });
	});
});

describe("slot resize CLI", () => {
	it("grows sparse pools by filling absent slot numbers first", async () => {
		const run = runScenario(["resize", "--size", "4", "--format", "json"], { git: { worktrees: [slotWorktree("slot-01", null), slotWorktree("slot-03", null)] } });
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ data: { previous_pool_size: 2, pool_size: 4, created: ["slot-02", "slot-04"], removed: [] } });
	});

	it("shrinks by removing the highest records after the target prefix", async () => {
		const run = runScenario(["resize", "--size", "2", "--format", "json"], { git: { worktrees: [slotWorktree("slot-01", null), slotWorktree("slot-02", null), slotWorktree("slot-03", null), slotWorktree("slot-04", null)] } });
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ data: { previous_pool_size: 4, pool_size: 2, created: [], removed: ["slot-03", "slot-04"] } });
		expect(run.git.operations()).toEqual([
			{ type: "remove-worktree", path: "/slots/repos/repo/worktrees/slot-03" },
			{ type: "remove-worktree", path: "/slots/repos/repo/worktrees/slot-04" },
		]);
	});

	it("returns no-op when already at the requested size", async () => {
		const run = runScenario(["resize", "--size", "1", "--format", "json"], { git: { worktrees: [slotWorktree("slot-01", null)] } });
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ data: { previous_pool_size: 1, pool_size: 1, created: [], removed: [] } });
		expect(run.git.operations()).toEqual([]);
	});

	it("reports all unsafe shrink offenders", async () => {
		const run = runScenario(["resize", "--size", "1", "--format", "json"], {
			git: {
				worktrees: [slotWorktree("slot-01", null), slotWorktree("slot-02", "feature/a"), slotWorktree("slot-03", null), slotWorktree("slot-04", "feature/rebase")],
				branchOccupancies: [
					{ path: "/slots/repos/repo/worktrees/slot-02", branch: "feature/a", operation: "checked-out" },
					{ path: "/slots/repos/repo/worktrees/slot-04", branch: "feature/rebase", operation: "rebase" },
				],
				dirtyPaths: ["/slots/repos/repo/worktrees/slot-03"],
			},
		});
		expect(await run.exit).toBe(2);
		const output = parseJsonOutput(run) as { message: string; error_type: string };
		expect(output.error_type).toBe("resize_unsafe");
		expect(output.message).toContain("slot-02 is assigned to 'feature/a'");
		expect(output.message).toContain("slot-03 at /slots/repos/repo/worktrees/slot-03 has uncommitted changes");
		expect(output.message).toContain("slot-04 is assigned to 'feature/rebase'");
	});
});
