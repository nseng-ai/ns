import { describe, expect, it } from "vitest";

import { fakeStackInfo } from "../../src/gateways/fakes/gt.ts";
import { parseJsonOutput, runScenario, slotWorktree } from "../support/run-scenario.ts";

describe("slot gt free-stack CLI", () => {
	it("noops on trunk", async () => {
		const run = runScenario(["gt", "free-stack", "--format", "json"], {
			git: { worktrees: [{ path: "/repo", branch: "master" }, slotWorktree("slot-01", "feature/a")] },
			gt: { trunk: { type: "trunk", branch: "master" } },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ data: { current_branch: "master", trunk_branch: "master", freed: [], noop_reason: "on_trunk" } });
		expect(run.gt?.operations()).toEqual([{ type: "trunk", cwd: "/repo" }]);
	});

	it("frees assigned stack branches except current and trunk", async () => {
		const run = runScenario(["gt", "free-stack", "--format", "json"], {
			git: { worktrees: [{ path: "/repo", branch: "feature/current" }, slotWorktree("slot-01", "feature/a"), slotWorktree("slot-02", "feature/c"), slotWorktree("slot-03", "feature/other")] },
			gt: {
				trunk: { type: "trunk", branch: "master" },
				stack: { type: "stack", stack: fakeStackInfo({ trunk: "master", current: "feature/current", ancestors: ["master", "feature/a"], descendants: ["feature/c"] }) },
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ data: { freed: [{ slot_name: "slot-01", branch_name: "feature/a" }, { slot_name: "slot-02", branch_name: "feature/c" }], noop_reason: null } });
		expect(run.git.operations()).toEqual([
			{ type: "detach-head", path: "/slots/repos/repo/worktrees/slot-01", ref: "master" },
			{ type: "detach-head", path: "/slots/repos/repo/worktrees/slot-02", ref: "master" },
		]);
	});

	it("downstack frees only ancestors", async () => {
		const run = runScenario(["gt", "free-stack", "--downstack", "--format", "json"], {
			git: { worktrees: [{ path: "/repo", branch: "feature/current" }, slotWorktree("slot-01", "feature/a"), slotWorktree("slot-02", "feature/c")] },
			gt: {
				trunk: { type: "trunk", branch: "master" },
				stack: { type: "stack", stack: fakeStackInfo({ trunk: "master", current: "feature/current", ancestors: ["master", "feature/a"], descendants: ["feature/c"] }) },
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ data: { freed: [{ slot_name: "slot-01", branch_name: "feature/a" }], downstack: true } });
	});
});
