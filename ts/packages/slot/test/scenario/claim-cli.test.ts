import { describe, expect, it } from "vitest";

import {
	parseJsonOutput,
	repoContext,
	runScenario,
	slotWorktree,
} from "../support/run-scenario.ts";

const slot1Path = "/slots/repos/repo/worktrees/slot-01";
const slot2Path = "/slots/repos/repo/worktrees/slot-02";

describe("slot claim CLI", () => {
	it("moves a branch from another slot into the current slot", async () => {
		const run = runScenario(["claim", "feature/source", "--format", "json"], {
			cwd: slot1Path,
			repo: repoContext({ root: slot1Path }),
			git: {
				localBranches: ["master", "feature/source", "feature/current"],
				worktrees: [
					slotWorktree("slot-01", "feature/current"),
					slotWorktree("slot-02", "feature/source"),
				],
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				slot_name: "slot-01",
				branch_name: "feature/source",
				source_slot_name: "slot-02",
				source_worktree_path: slot2Path,
			},
		});
		expect(run.git.operations()).toEqual([
			{ type: "detach-head", path: slot2Path, ref: "master" },
			{ type: "checkout-branch", path: slot1Path, branch: "feature/source" },
		]);
	});

	it("returns already current without mutation", async () => {
		const run = runScenario(["claim", "feature/current", "--format", "json"], {
			cwd: slot1Path,
			repo: repoContext({ root: slot1Path }),
			git: {
				localBranches: ["master", "feature/current"],
				worktrees: [slotWorktree("slot-01", "feature/current")],
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: { already_current: true, slot_name: "slot-01" },
		});
		expect(run.git.operations()).toEqual([]);
	});

	it("from main moves current non-trunk branch into the lowest slot", async () => {
		const run = runScenario(["claim", "feature/main", "--format", "json"], {
			git: {
				localBranches: ["master", "feature/main"],
				worktrees: [{ path: "/repo", branch: "feature/main" }, slotWorktree("slot-01")],
				previousBranches: { "/repo": "master" },
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: { slot_name: "slot-01", branch_name: "feature/main" },
		});
		expect(run.git.operations()).toEqual([
			{ type: "checkout-branch", path: "/repo", branch: "master" },
			{ type: "checkout-branch", path: slot1Path, branch: "feature/main" },
		]);
	});

	it("from main claiming trunk checks trunk out in main and moves current branch into a slot", async () => {
		const run = runScenario(["claim", "master", "--format", "json"], {
			git: {
				localBranches: ["master", "feature/main"],
				worktrees: [{ path: "/repo", branch: "feature/main" }, slotWorktree("slot-01")],
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				slot_name: "slot-01",
				branch_name: "feature/main",
				main_worktree_path: "/repo",
				main_checkout_branch: "master",
			},
		});
		expect(run.git.operations()).toEqual([
			{ type: "checkout-branch", path: "/repo", branch: "master" },
			{ type: "checkout-branch", path: slot1Path, branch: "feature/main" },
		]);
	});

	it("refuses trunk already current in main", async () => {
		const run = runScenario(["claim", "master", "--format", "json"], {
			git: {
				localBranches: ["master"],
				worktrees: [{ path: "/repo", branch: "master" }, slotWorktree("slot-01")],
			},
		});
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ error_type: "trunk_in_main_worktree" });
	});

	it("refuses dirty source slot before mutation", async () => {
		const run = runScenario(["claim", "feature/source", "--format", "json"], {
			cwd: slot1Path,
			repo: repoContext({ root: slot1Path }),
			git: {
				localBranches: ["master", "feature/source", "feature/current"],
				worktrees: [
					slotWorktree("slot-01", "feature/current"),
					slotWorktree("slot-02", "feature/source"),
				],
				dirtyPaths: [slot2Path],
			},
		});
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ error_type: "dirty_source_slot" });
		expect(run.git.operations()).toEqual([]);
	});
});
