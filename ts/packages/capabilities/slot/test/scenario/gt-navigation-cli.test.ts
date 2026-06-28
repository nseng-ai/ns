import { stripAnsi } from "@sdl/clinkr/testing";
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
		expect(gt.stdout.join("")).toContain("metadata-backed stack commands");
		expect(gt.stdout.join("")).toContain("require the sqlite3 CLI");
		expect(gt.stdout.join("")).not.toContain("exec");
	});

	it("does not invoke the Graphite gateway for plain commands", async () => {
		const run = runScenario(["list", "--format", "json"], {
			git: { worktrees: [{ path: "/repo", branch: "master" }, slotWorktree("slot-01")] },
		});
		expect(await run.exit).toBe(0);
		expect(run.gt.operations()).toEqual([]);
	});

	it("gt up reuses an existing upstack slot worktree", async () => {
		const run = runScenario(["gt", "up", "--format", "json"], {
			git: {
				worktrees: [
					{ path: "/repo", branch: "feature/current" },
					slotWorktree("slot-01", "feature/child"),
				],
			},
			gt: { children: { type: "children", branches: ["feature/child"] } },
		});
		expect(await run.exit).toBe(0);
		const output = parseJsonOutput(run);
		expect(output).toMatchObject({
			data: {
				slot_name: "slot-01",
				branch_name: "feature/child",
				already_assigned: true,
				cd_command: "cd /slots/repos/repo/worktrees/slot-01",
			},
		});
		expect(output).not.toMatchObject({ data: { is_already_assigned: expect.anything() } });
		expect(run.gt.operations()).toEqual([{ type: "children-of", cwd: "/repo" }]);
		expect(run.git.operations()).toEqual([]);
	});

	it("gt down checks out the parent into an available slot", async () => {
		const run = runScenario(["gt", "down", "--no-clipboard", "--format", "json"], {
			git: {
				localBranches: ["master", "feature/parent", "feature/current"],
				worktrees: [{ path: "/repo", branch: "feature/current" }, slotWorktree("slot-01")],
			},
			gt: { parent: { type: "parent", branch: "feature/parent" } },
		});
		expect(await run.exit).toBe(0);
		const output = parseJsonOutput(run);
		expect(output).toMatchObject({
			data: {
				slot_name: "slot-01",
				branch_name: "feature/parent",
				already_assigned: false,
				clipboard_skipped: true,
			},
		});
		expect(output).not.toMatchObject({
			data: {
				is_already_assigned: expect.anything(),
				is_clipboard_skipped: expect.anything(),
				was_clipboard_skipped: expect.anything(),
			},
		});
		expect(run.git.operations()).toEqual([
			{
				type: "checkout-branch",
				path: "/slots/repos/repo/worktrees/slot-01",
				branch: "feature/parent",
			},
		]);
	});

	it("renders house-style human navigation output", async () => {
		const run = runScenario(["gt", "up"], {
			git: {
				worktrees: [
					{ path: "/repo", branch: "feature/current" },
					slotWorktree("slot-01", "feature/child"),
				],
			},
			gt: { children: { type: "children", branches: ["feature/child"] } },
		});
		expect(await run.exit).toBe(0);
		expect(stripAnsi(run.stdout.join("")).trimEnd().split("\n")).toEqual([
			"✓ slot-01 -> feature/child",
			"cd /slots/repos/repo/worktrees/slot-01",
			"Copied cd command to clipboard.",
		]);
	});

	it("renders checked-out, main-worktree, and no-clipboard navigation variants", async () => {
		const checkedOut = runScenario(["gt", "down", "--no-clipboard"], {
			git: {
				localBranches: ["master", "feature/parent", "feature/current"],
				worktrees: [{ path: "/repo", branch: "feature/current" }, slotWorktree("slot-01")],
			},
			gt: { parent: { type: "parent", branch: "feature/parent" } },
		});
		expect(await checkedOut.exit).toBe(0);
		expect(stripAnsi(checkedOut.stdout.join("")).trimEnd().split("\n")).toEqual([
			"✓ Checked out slot-01 -> feature/parent",
			"cd /slots/repos/repo/worktrees/slot-01",
		]);

		const main = runScenario(["gt", "down"], {
			git: {
				worktrees: [
					{ path: "/repo", branch: "feature/parent" },
					slotWorktree("slot-01", "feature/current"),
				],
			},
			cwd: "/slots/repos/repo/worktrees/slot-01",
			gt: { parent: { type: "parent", branch: "feature/parent" } },
		});
		expect(await main.exit).toBe(0);
		expect(stripAnsi(main.stdout.join("")).trimEnd().split("\n")[0]).toBe(
			"✓ feature/parent is checked out at /repo",
		);
	});

	it("gt down reports a missing parent as a negative exit", async () => {
		const run = runScenario(["gt", "down", "--format", "json"], {
			git: { worktrees: [{ path: "/repo", branch: "feature/current" }] },
			gt: { parent: { type: "no_parent" } },
		});
		expect(await run.exit).toBe(1);
		expect(parseJsonOutput(run)).toMatchObject({
			exitCode: 1,
			message: "No downstack branch for 'feature/current'.",
		});
	});

	it("gt up reports multiple children as a negative exit", async () => {
		const run = runScenario(["gt", "up", "--format", "json"], {
			git: { worktrees: [{ path: "/repo", branch: "feature/current" }] },
			gt: { children: { type: "children", branches: ["feature/a", "feature/b"] } },
		});
		expect(await run.exit).toBe(1);
		expect(parseJsonOutput(run)).toMatchObject({
			exitCode: 1,
			message:
				"Multiple upstack branches for 'feature/current': feature/a, feature/b. Run `sdl slot checkout <branch>` for the branch you want.",
		});
	});
});
