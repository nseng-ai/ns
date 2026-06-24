import { describe, expect, it } from "vitest";

import { checkoutBranchSlot, checkoutCurrentSlot } from "../../src/api.ts";
import { runScenario, slotWorktree } from "../support/run-scenario.ts";

describe("Slot Peer API", () => {
	it("checks out the current branch and maps checkout outcome to camelCase", async () => {
		const run = runScenario([], {
			git: {
				localBranches: ["master", "feature/a"],
				worktrees: [{ path: "/repo", branch: "feature/a" }, slotWorktree("slot-01")],
				previousBranches: { "/repo": "master" },
			},
		});

		const result = await checkoutCurrentSlot({ cwd: "/repo", context: run.context });

		expect(result).toEqual({
			ok: true,
			target: {
				slotName: "slot-01",
				branchName: "feature/a",
				worktreePath: "/slots/repos/repo/worktrees/slot-01",
				cdCommand: "cd /slots/repos/repo/worktrees/slot-01",
				alreadyAssigned: false,
				createdBranch: false,
				currentWorktreeNote: null,
			},
		});
		expect(run.git.operations()).toEqual([
			{ type: "checkout-branch", path: "/repo", branch: "master" },
			{
				type: "checkout-branch",
				path: "/slots/repos/repo/worktrees/slot-01",
				branch: "feature/a",
			},
		]);
	});

	it("checks out a named branch without clipboard operations", async () => {
		const run = runScenario([], {
			git: {
				localBranches: ["master", "feature/a"],
				worktrees: [slotWorktree("slot-01")],
			},
			clipboardResult: { type: "failure", reason: "subprocess_error", detail: "must not copy" },
		});

		const result = await checkoutBranchSlot({
			cwd: "/repo",
			context: run.context,
			branchName: "feature/a",
		});

		expect(result).toMatchObject({
			ok: true,
			target: {
				slotName: "slot-01",
				branchName: "feature/a",
				worktreePath: "/slots/repos/repo/worktrees/slot-01",
				cdCommand: "cd /slots/repos/repo/worktrees/slot-01",
				alreadyAssigned: false,
				createdBranch: false,
				currentWorktreeNote: null,
			},
		});
	});

	it("maps lifecycle failures to typed Peer API failures", async () => {
		const run = runScenario([], {
			git: { localBranches: ["master"], worktrees: [slotWorktree("slot-01")] },
		});

		const result = await checkoutBranchSlot({
			cwd: "/repo",
			context: run.context,
			branchName: "feature/missing",
		});

		expect(result).toEqual({
			ok: false,
			failure: {
				errorType: "branch_missing",
				message: "Branch 'feature/missing' does not exist. Pass -b/--new to create it from HEAD.",
			},
		});
		expect(run.git.operations()).toEqual([]);
	});
});
