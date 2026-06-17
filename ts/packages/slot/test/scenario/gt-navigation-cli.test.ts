import { describe, expect, it } from "vitest";

import { parseJsonOutput, runScenario, slotWorktree } from "../support/run-scenario.ts";

describe("slot gt navigation CLI", () => {
	it("shows gt commands while hiding the exec subgroup", async () => {
		const root = runScenario(["--help"]);
		expect(await root.exit).toBe(0);
		expect(root.stdout.join("")).toContain("gt");
		const gt = runScenario(["gt", "--help"]);
		expect(await gt.exit).toBe(0);
		expect(gt.stdout.join("")).toContain("up");
		expect(gt.stdout.join("")).toContain("down");
		expect(gt.stdout.join("")).toContain("free-stack");
		expect(gt.stdout.join("")).not.toContain("exec");
	});

	it("does not require a Graphite gateway for plain commands", async () => {
		const run = runScenario(["list", "--format", "json"], { git: { worktrees: [{ path: "/repo", branch: "master" }, slotWorktree("slot-01")] } });
		expect(await run.exit).toBe(0);
		expect(run.gt).toBeUndefined();
	});

	it("gt up reuses an existing upstack slot worktree", async () => {
		const run = runScenario(["gt", "up", "--format", "json"], {
			git: { worktrees: [{ path: "/repo", branch: "feature/current" }, slotWorktree("slot-01", "feature/child")] },
			gt: { children: { type: "children", branches: ["feature/child"] } },
		});
		expect(await run.exit).toBe(0);
		const output = parseJsonOutput(run);
		expect(output).toMatchObject({ data: { slot_name: "slot-01", branch_name: "feature/child", is_already_assigned: true, cd_command: "cd /slots/repos/repo/worktrees/slot-01" } });
		expect(output).not.toMatchObject({ data: { already_assigned: expect.anything() } });
		expect(run.gt?.operations()).toEqual([{ type: "children-of", cwd: "/repo" }]);
		expect(run.git.operations()).toEqual([]);
	});

	it("gt down checks out the parent into an available slot", async () => {
		const run = runScenario(["gt", "down", "--no-clipboard", "--format", "json"], {
			git: { localBranches: ["master", "feature/parent", "feature/current"], worktrees: [{ path: "/repo", branch: "feature/current" }, slotWorktree("slot-01")] },
			gt: { parent: { type: "parent", branch: "feature/parent" } },
		});
		expect(await run.exit).toBe(0);
		const output = parseJsonOutput(run);
		expect(output).toMatchObject({ data: { slot_name: "slot-01", branch_name: "feature/parent", is_already_assigned: false, was_clipboard_skipped: true } });
		expect(output).not.toMatchObject({ data: { already_assigned: expect.anything(), clipboard_skipped: expect.anything() } });
		expect(run.git.operations()).toEqual([{ type: "checkout-branch", path: "/slots/repos/repo/worktrees/slot-01", branch: "feature/parent" }]);
	});

	it("gt up reports multiple children as a negative exit", async () => {
		const run = runScenario(["gt", "up", "--format", "json"], {
			git: { worktrees: [{ path: "/repo", branch: "feature/current" }] },
			gt: { children: { type: "children", branches: ["feature/a", "feature/b"] } },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ exit_code: 1, message: "Multiple upstack branches for 'feature/current': feature/a, feature/b. Run `slot checkout <branch>` for the branch you want." });
	});
});
