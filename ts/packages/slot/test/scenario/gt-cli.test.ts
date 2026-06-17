import { describe, expect, it } from "vitest";

import type { BranchMetadataGraph, StackInfo } from "../../src/gt/types.ts";
import { parseJsonOutput, runScenario, slotWorktree } from "../support/run-scenario.ts";

const STACK: StackInfo = {
	trunk: "master",
	current: "feature/b",
	ancestors: ["master", "feature/a"],
	children: ["feature/c"],
	descendants: ["feature/c"],
	ancestor_termination: { type: "completed" },
	descendant_walk: { forks: [], children_corruptions: [], termination: { type: "completed" } },
	trunk_marker: { type: "clean" },
	unwalked_children_corruptions: [],
	empty_branch_name_rows: 0,
};

const GRAPH: BranchMetadataGraph = {
	empty_branch_name_rows: 0,
	rows: [
		{ name: "feature/a", parent: "master", children: ["feature/b"], validation_result: null, children_corruption: null },
		{ name: "feature/b", parent: "feature/a", children: ["feature/c"], validation_result: null, children_corruption: null },
		{ name: "feature/c", parent: "feature/b", children: [], validation_result: "BAD_PARENT_NAME", children_corruption: null },
		{ name: "master", parent: null, children: ["feature/a"], validation_result: "TRUNK", children_corruption: null },
	],
};

describe("slot gt CLI", () => {
	it("navigates up by reusing an assigned worktree", async () => {
		const run = runScenario(["gt", "up", "--format", "json"], {
			git: { worktrees: [{ path: "/repo", branch: "feature/b" }, slotWorktree("slot-01", "feature/c")], localBranches: ["feature/b", "feature/c"] },
			gt: { children: { "/repo": ["feature/c"] } },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ data: { slot_name: "slot-01", branch_name: "feature/c", already_assigned: true, cd_command: "cd /slots/repos/repo/worktrees/slot-01" } });
	});

	it("checks out downstack parent when absent", async () => {
		const run = runScenario(["gt", "down", "--format", "json"], {
			git: { worktrees: [{ path: "/repo", branch: "feature/b" }, slotWorktree("slot-01", null)], localBranches: ["feature/a", "feature/b"] },
			gt: { parents: { "/repo": "feature/a" } },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ data: { slot_name: "slot-01", branch_name: "feature/a", already_assigned: false } });
		expect(run.git.operations()).toContainEqual({ type: "checkout-branch", path: "/slots/repos/repo/worktrees/slot-01", branch: "feature/a" });
	});

	it("frees assigned stack slots excluding current and trunk", async () => {
		const run = runScenario(["gt", "free-stack", "--format", "json"], {
			git: { worktrees: [{ path: "/repo", branch: "feature/b" }, slotWorktree("slot-01", "feature/a"), slotWorktree("slot-02", "feature/c")], localBranches: ["master", "feature/a", "feature/b", "feature/c"] },
			gt: { trunk: "master", stack: STACK },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ data: { noop_reason: null, freed: [{ slot_name: "slot-01", branch_name: "feature/a" }, { slot_name: "slot-02", branch_name: "feature/c" }] } });
	});

	it("keeps hidden exec stack-branches invocable", async () => {
		const run = runScenario(["gt", "exec", "stack-branches", "--format", "json"], {
			git: { worktrees: [{ path: "/repo", branch: "feature/b" }], localBranches: ["master", "feature/a", "feature/b", "feature/c"] },
			gt: { stack: STACK },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ data: { branches: ["feature/a", "feature/b", "feature/c"], trunk: "master", current: "feature/b", scope: "full", edges: [{ parent: "master", child: "feature/a" }, { parent: "feature/a", child: "feature/b" }, { parent: "feature/b", child: "feature/c" }] } });
	});

	it("emits sdlcc-compatible stack-map JSON", async () => {
		const run = runScenario(["gt", "exec", "stack-map-branches", "--format", "json"], {
			git: { worktrees: [{ path: "/repo", branch: "feature/b" }, slotWorktree("slot-02", "feature/c")], localBranches: ["master", "feature/a", "feature/b", "feature/c"], localBranchTips: [{ name: "feature/c", head_iso: "2026-01-02T00:00:00Z" }] },
			gt: { stack: STACK, graph: GRAPH },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ data: { branches: expect.arrayContaining([{ name: "feature/c", parent: "feature/b", children: [], validation_result: "BAD_PARENT_NAME", needs_restack: true }]), trunk: "master", current: "feature/b", edges: expect.arrayContaining([{ parent: "feature/b", child: "feature/c" }]), slots: [{ slot_name: "slot-02", branch: "feature/c", worktree_path: "/slots/repos/repo/worktrees/slot-02", status: "assigned" }], warnings: [] } });
	});
});
