import { stripAnsi } from "@sdl/clinkr/testing";
import { describe, expect, it } from "vitest";

import { parseJsonOutput, runScenario, slotWorktree } from "../support/run-scenario.ts";

describe("slot checkout CLI", () => {
	it("appears in root help with co alias", async () => {
		const run = runScenario(["--help"]);
		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("checkout");
		expect(run.stdout.join("")).toContain("co");
	});

	it("checks out an existing branch into the lowest available slot", async () => {
		const run = runScenario(["checkout", "feature/a", "--format", "json"], {
			git: {
				localBranches: ["master", "feature/a"],
				worktrees: [
					{ path: "/repo", branch: "master" },
					slotWorktree("slot-01"),
					slotWorktree("slot-02"),
				],
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				slot_name: "slot-01",
				branch_name: "feature/a",
				cd_command: "cd /slots/repos/repo/worktrees/slot-01",
				already_assigned: false,
				created_branch: false,
				clipboard_copied: true,
			},
		});
		expect(run.git.operations()).toEqual([
			{ type: "checkout-branch", path: "/slots/repos/repo/worktrees/slot-01", branch: "feature/a" },
		]);
	});

	it("co alias routes through the checkout human renderer", async () => {
		const run = runScenario(["co", "feature/a"], {
			git: { localBranches: ["master", "feature/a"], worktrees: [slotWorktree("slot-01")] },
		});
		expect(await run.exit).toBe(0);
		expect(stripAnsi(run.stdout.join("")).trimEnd().split("\n")).toEqual([
			"✓ Checked out slot-01 -> feature/a",
			"cd /slots/repos/repo/worktrees/slot-01",
			"Copied cd command to clipboard.",
		]);
	});

	it("renders house-style human navigation output", async () => {
		const run = runScenario(["checkout", "feature/a"], {
			git: {
				localBranches: ["master", "feature/a"],
				worktrees: [{ path: "/repo", branch: "master" }, slotWorktree("slot-01")],
			},
		});
		expect(await run.exit).toBe(0);
		expect(stripAnsi(run.stdout.join("")).trimEnd().split("\n")).toEqual([
			"✓ Checked out slot-01 -> feature/a",
			"cd /slots/repos/repo/worktrees/slot-01",
			"Copied cd command to clipboard.",
		]);
	});

	it("renders --current redirect notes before the bare cd line", async () => {
		const run = runScenario(["checkout", "--current"], {
			git: {
				localBranches: ["master", "feature/a"],
				worktrees: [
					{ path: "/repo", branch: "feature/a" },
					{ path: "/other", branch: "master" },
					slotWorktree("slot-01"),
				],
			},
		});
		expect(await run.exit).toBe(0);
		expect(stripAnsi(run.stdout.join("")).trimEnd().split("\n")).toEqual([
			"✓ Checked out slot-01 -> feature/a",
			"Trunk branch 'master' is checked out in /other; left /repo on a detached HEAD at feature/a.",
			"cd /slots/repos/repo/worktrees/slot-01",
			"Copied cd command to clipboard.",
		]);
	});

	it("preserves distinct already-assigned human headlines", async () => {
		const main = runScenario(["checkout", "feature/a"], {
			git: {
				localBranches: ["master", "feature/a"],
				worktrees: [{ path: "/repo", branch: "feature/a" }, slotWorktree("slot-01")],
			},
		});
		expect(await main.exit).toBe(0);
		expect(stripAnsi(main.stdout.join("")).trimEnd().split("\n")[0]).toBe(
			"✓ feature/a is already checked out in the main worktree at /repo",
		);

		const slot = runScenario(["checkout", "feature/a"], {
			git: {
				localBranches: ["master", "feature/a"],
				worktrees: [{ path: "/repo", branch: "master" }, slotWorktree("slot-01", "feature/a")],
			},
		});
		expect(await slot.exit).toBe(0);
		expect(stripAnsi(slot.stdout.join("")).trimEnd().split("\n")[0]).toBe(
			"✓ feature/a is already assigned to slot-01",
		);
	});

	it("reports missing branch without mutation", async () => {
		const run = runScenario(["checkout", "feature/missing", "--format", "json"], {
			git: { localBranches: ["master"], worktrees: [slotWorktree("slot-01")] },
		});
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ errorType: "branch_missing" });
		expect(run.git.operations()).toEqual([]);
	});

	it("creates a new branch from base before assigning it", async () => {
		const run = runScenario(["checkout", "feature/new", "master", "-b", "--format", "json"], {
			git: { localBranches: ["master"], worktrees: [slotWorktree("slot-01")] },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: { created_branch: true, branch_name: "feature/new" },
		});
		expect(run.git.operations()).toEqual([
			{ type: "create-branch", branch: "feature/new", startPoint: "master", shouldForce: false },
			{
				type: "checkout-branch",
				path: "/slots/repos/repo/worktrees/slot-01",
				branch: "feature/new",
			},
		]);
	});

	it("refuses branch in use by another worktree", async () => {
		const run = runScenario(["checkout", "feature/a", "--format", "json"], {
			git: {
				localBranches: ["master", "feature/a"],
				worktrees: [
					{ path: "/repo", branch: "master" },
					{ path: "/other", branch: "feature/a" },
					slotWorktree("slot-01"),
				],
			},
		});
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ errorType: "branch_in_use" });
	});

	it("--current redirects only after allocation is executable", async () => {
		const run = runScenario(["checkout", "--current", "--format", "json"], {
			git: {
				localBranches: ["master", "feature/a"],
				worktrees: [{ path: "/repo", branch: "feature/a" }, slotWorktree("slot-01")],
				previousBranches: { "/repo": "master" },
			},
		});
		expect(await run.exit).toBe(0);
		expect(run.git.operations()).toEqual([
			{ type: "checkout-branch", path: "/repo", branch: "master" },
			{ type: "checkout-branch", path: "/slots/repos/repo/worktrees/slot-01", branch: "feature/a" },
		]);
	});

	it("rejects invalid argument combinations", async () => {
		const run = runScenario(["checkout", "feature/a", "base", "--format", "json"]);
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ errorType: "base_without_new" });
	});
});
