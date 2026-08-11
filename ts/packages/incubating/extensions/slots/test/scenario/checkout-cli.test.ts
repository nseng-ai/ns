import { stripAnsi } from "@nseng-ai/clinkr/testing";
import { describe, expect, it } from "vitest";

import {
	completeFilesystemScenario,
	runFilesystemScenario,
} from "../support/run-filesystem-scenario.ts";
import { slotWorktree } from "../support/scenario-fixture.ts";

describe("slot checkout CLI", () => {
	it("appears in root help with co alias", async () => {
		const run = runFilesystemScenario(["--help"]);
		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("checkout");
		expect(run.stdout.join("")).toContain("co");
	});

	it("checks out an existing branch into the lowest available slot", async () => {
		const run = runFilesystemScenario(["checkout", "feature/a", "--format", "json"], {
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
		expect(JSON.parse(run.stdout.join(""))).toMatchObject({
			data: {
				slotName: "slot-01",
				branchName: "feature/a",
				cdCommand: "cd /slots/repos/repo/worktrees/slot-01",
				alreadyAssigned: false,
				createdBranch: false,
				clipboardCopied: true,
			},
		});
		expect(run.git.operations()).toEqual([
			{ type: "checkout-branch", path: "/slots/repos/repo/worktrees/slot-01", branch: "feature/a" },
		]);
	});

	it("co alias routes through the checkout human renderer", async () => {
		const run = runFilesystemScenario(["co", "feature/a"], {
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
		const run = runFilesystemScenario(["checkout", "feature/a"], {
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
		const run = runFilesystemScenario(["checkout", "--current"], {
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
		const main = runFilesystemScenario(["checkout", "feature/a"], {
			git: {
				localBranches: ["master", "feature/a"],
				worktrees: [{ path: "/repo", branch: "feature/a" }, slotWorktree("slot-01")],
			},
		});
		expect(await main.exit).toBe(0);
		expect(stripAnsi(main.stdout.join("")).trimEnd().split("\n")[0]).toBe(
			"✓ feature/a is already checked out in the main worktree at /repo",
		);

		const slot = runFilesystemScenario(["checkout", "feature/a"], {
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
		const run = runFilesystemScenario(["checkout", "feature/missing", "--format", "json"], {
			git: { localBranches: ["master"], worktrees: [slotWorktree("slot-01")] },
		});
		expect(await run.exit).toBe(2);
		expect(JSON.parse(run.stdout.join(""))).toMatchObject({ errorType: "branch-missing" });
		expect(run.git.operations()).toEqual([]);
	});

	it("creates a new branch from base before assigning it", async () => {
		const run = runFilesystemScenario(
			["checkout", "feature/new", "master", "-b", "--format", "json"],
			{
				git: { localBranches: ["master"], worktrees: [slotWorktree("slot-01")] },
			},
		);
		expect(await run.exit).toBe(0);
		expect(JSON.parse(run.stdout.join(""))).toMatchObject({
			data: { createdBranch: true, branchName: "feature/new" },
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
		const run = runFilesystemScenario(["checkout", "feature/a", "--format", "json"], {
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
		expect(JSON.parse(run.stdout.join(""))).toMatchObject({ errorType: "branch-in-use" });
	});

	it("--current redirects only after allocation is executable", async () => {
		const run = runFilesystemScenario(["checkout", "--current", "--format", "json"], {
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
		const run = runFilesystemScenario(["checkout", "feature/a", "base", "--format", "json"]);
		expect(await run.exit).toBe(2);
		expect(JSON.parse(run.stdout.join(""))).toMatchObject({ errorType: "base-without-new" });
	});

	it("completes local branches for checkout branch and base positionals", async () => {
		const branchRun = completeFilesystemScenario(["checkout", "f"], {
			git: { localBranches: ["master", "feature/a", "feature/b", "topic/a"] },
		});
		expect(await branchRun.values).toEqual(["feature/a", "feature/b"]);
		expect(branchRun.git.operations()).toEqual([]);

		const baseRun = completeFilesystemScenario(["checkout", "-b", "new-branch", "m"], {
			git: { localBranches: ["master", "main", "feature/a"] },
		});
		expect(await baseRun.values).toEqual(["master", "main"]);
		expect(baseRun.git.operations()).toEqual([]);
	});

	it("completes local branches for co alias", async () => {
		const run = completeFilesystemScenario(["co", "f"], {
			git: { localBranches: ["master", "feature/a", "topic/a"] },
		});

		expect(await run.values).toEqual(["feature/a"]);
		expect(run.git.operations()).toEqual([]);
	});

	it("keeps static options available during checkout completion", async () => {
		const run = completeFilesystemScenario(["checkout", "--"], {
			git: { localBranches: ["master", "feature/a"] },
		});

		const values = await run.values;
		expect(values).toContain("--help");
		expect(values).toContain("--new");
		expect(values).toContain("--format");
		expect(values).toContain("--json-schema");
		expect(run.git.operations()).toEqual([]);
	});
});
