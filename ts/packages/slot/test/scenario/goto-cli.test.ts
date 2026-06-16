import { describe, expect, it } from "vitest";

import { parseJsonOutput, runScenario, slotWorktree } from "../support/run-scenario.ts";

describe("slot goto CLI", () => {
	it("goes to assigned slot by number", async () => {
		const run = runScenario(["goto", "-n", "1", "--format", "json"], { git: { worktrees: [slotWorktree("slot-01", "feature/a")], localBranches: ["feature/a"] } });
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ data: { slot_name: "slot-01", branch_name: "feature/a", operation: null, cd_command: "cd /slots/repos/repo/worktrees/slot-01" } });
	});

	it("goes to assigned slot by worktree name", async () => {
		const run = runScenario(["goto", "--wt", "slot-02", "--format", "json"], { git: { worktrees: [slotWorktree("slot-01", "a"), slotWorktree("slot-02", "b")], localBranches: ["a", "b"] } });
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ data: { slot_name: "slot-02", branch_name: "b" } });
	});

	it("rejects conflicting selectors", async () => {
		const run = runScenario(["goto", "-n", "1", "--wt", "slot-01", "--format", "json"], { git: { worktrees: [slotWorktree("slot-01", "a")] } });
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ error_type: "conflicting_slot_args" });
	});

	it("returns negative for an unassigned slot", async () => {
		const run = runScenario(["goto", "-n", "1", "--format", "json"], { git: { worktrees: [slotWorktree("slot-01")] } });
		expect(await run.exit).toBe(1);
		expect(parseJsonOutput(run)).toMatchObject({ message: "slot-01 is not currently assigned. Run `slot list` to see the pool." });
	});

	it("surfaces operation state", async () => {
		const path = "/slots/repos/repo/worktrees/slot-01";
		const run = runScenario(["goto", "--wt", "slot-01", "--format", "json"], { git: { worktrees: [{ path, branch: "feature/a" }], branchOccupancies: [{ path, branch: "feature/a", operation: "rebase" }] } });
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ data: { operation: "rebase" } });
	});
});
