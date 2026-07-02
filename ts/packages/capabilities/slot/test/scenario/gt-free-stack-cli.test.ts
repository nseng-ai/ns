import { describe, expect, it } from "vitest";

import { fakeStackInfo } from "@sdl/capability-kit/graphite/testing";
import { parseJsonOutput, runScenario, slotWorktree } from "../support/run-scenario.ts";

describe("slot gt free-stack CLI", () => {
	it("noops on trunk", async () => {
		const run = runScenario(["gt", "free-stack", "--format", "json"], {
			git: {
				worktrees: [{ path: "/repo", branch: "master" }, slotWorktree("slot-01", "feature/a")],
			},
			gt: { trunk: { type: "trunk", branch: "master" } },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				currentBranch: "master",
				trunkBranch: "master",
				freed: [],
				noopReason: "on-trunk",
			},
		});
		expect(run.gt.operations()).toEqual([{ type: "trunk", cwd: "/repo" }]);
	});

	it("renders human no-op on trunk as a result block", async () => {
		const run = runScenario(["gt", "free-stack"], {
			git: {
				worktrees: [{ path: "/repo", branch: "master" }, slotWorktree("slot-01", "feature/a")],
			},
			gt: { trunk: { type: "trunk", branch: "master" } },
		});
		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("On trunk; no stack slots freed.");
		expect(run.stdout.join("")).toContain("Current branch master is trunk master.");
	});

	it("frees assigned stack branches except current and trunk", async () => {
		const run = runScenario(["gt", "free-stack", "--format", "json"], {
			git: {
				worktrees: [
					{ path: "/repo", branch: "feature/current" },
					slotWorktree("slot-01", "feature/a"),
					slotWorktree("slot-02", "feature/c"),
					slotWorktree("slot-03", "feature/other"),
				],
			},
			gt: {
				trunk: { type: "trunk", branch: "master" },
				stack: {
					type: "stack",
					stack: fakeStackInfo({
						trunk: "master",
						current: "feature/current",
						ancestors: ["master", "feature/a"],
						descendants: ["feature/c"],
					}),
				},
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				freed: [
					{ slotName: "slot-01", branchName: "feature/a" },
					{ slotName: "slot-02", branchName: "feature/c" },
				],
				noopReason: null,
			},
		});
		expect(run.git.operations()).toEqual([
			{ type: "detach-head", path: "/slots/repos/repo/worktrees/slot-01", ref: "master" },
			{ type: "detach-head", path: "/slots/repos/repo/worktrees/slot-02", ref: "master" },
		]);
	});

	it("renders human freed stack slots with kept worktree details", async () => {
		const run = runScenario(["gt", "free-stack"], {
			git: {
				worktrees: [
					{ path: "/repo", branch: "feature/current" },
					slotWorktree("slot-01", "feature/a"),
					slotWorktree("slot-02", "feature/c"),
				],
			},
			gt: {
				trunk: { type: "trunk", branch: "master" },
				stack: {
					type: "stack",
					stack: fakeStackInfo({
						trunk: "master",
						current: "feature/current",
						ancestors: ["master", "feature/a"],
						descendants: ["feature/c"],
					}),
				},
			},
		});
		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("Freed 2 stack slot(s).");
		expect(run.stdout.join("")).toContain("Freed slot-01 -> feature/a");
		expect(run.stdout.join("")).toContain("Freed slot-02 -> feature/c");
		expect(run.stdout.join("")).toContain(
			"Worktree kept at /slots/repos/repo/worktrees/slot-01; detached HEAD at master",
		);
	});

	it("downstack frees only ancestors", async () => {
		const run = runScenario(["gt", "free-stack", "--downstack", "--format", "json"], {
			git: {
				worktrees: [
					{ path: "/repo", branch: "feature/current" },
					slotWorktree("slot-01", "feature/a"),
					slotWorktree("slot-02", "feature/c"),
				],
			},
			gt: {
				trunk: { type: "trunk", branch: "master" },
				stack: {
					type: "stack",
					stack: fakeStackInfo({
						trunk: "master",
						current: "feature/current",
						ancestors: ["master", "feature/a"],
						descendants: ["feature/c"],
					}),
				},
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: { freed: [{ slotName: "slot-01", branchName: "feature/a" }], downstack: true },
		});
	});

	it("renders human downstack no-op scope", async () => {
		const run = runScenario(["gt", "free-stack", "--downstack"], {
			git: {
				worktrees: [
					{ path: "/repo", branch: "feature/current" },
					slotWorktree("slot-02", "feature/c"),
				],
			},
			gt: {
				trunk: { type: "trunk", branch: "master" },
				stack: {
					type: "stack",
					stack: fakeStackInfo({
						trunk: "master",
						current: "feature/current",
						ancestors: ["master", "feature/a"],
						descendants: ["feature/c"],
					}),
				},
			},
		});
		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("No stack slots freed.");
		expect(run.stdout.join("")).toContain("No assigned downstack slots were found.");
	});
});
