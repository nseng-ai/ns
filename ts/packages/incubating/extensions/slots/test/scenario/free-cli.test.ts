import { describe, expect, it } from "vitest";

import { parseJsonOutput, runScenario, slotWorktree } from "../support/run-scenario.ts";

describe("slot free CLI", () => {
	it("appears in root help", async () => {
		const run = runScenario(["--help"]);
		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("free");
	});

	it("frees a slot by --wt", async () => {
		const run = runScenario(["free", "--wt", "slot-01", "--format", "json"], {
			git: {
				worktrees: [slotWorktree("slot-01", "feature/a")],
				localBranches: ["master", "feature/a"],
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: { freed: [{ slotName: "slot-01", branchName: "feature/a" }], dryRun: false },
		});
		expect(run.git.operations()).toEqual([
			{ type: "detach-head", path: "/slots/repos/repo/worktrees/slot-01", ref: "master" },
		]);
	});

	it("reports operation state for a detached rebasing slot", async () => {
		const run = runScenario(["free", "-n", "3", "--format", "json"], {
			git: {
				worktrees: [
					slotWorktree("slot-01", null),
					slotWorktree("slot-02", null),
					slotWorktree("slot-03", null),
				],
				branchOccupancies: [
					{
						path: "/slots/repos/repo/worktrees/slot-03",
						branch: "feature/rebasing",
						operation: "rebase",
					},
				],
			},
		});
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ errorType: "invalid-slot-args" });
		expect(run.stdout.join("")).toContain(
			"slot-03 holds 'feature/rebasing' with a rebase in progress",
		);
		expect(run.stdout.join("")).not.toContain("slot-03 is not currently assigned");
	});

	it("dry-runs --all cleanup without mutating PRs or branches", async () => {
		const run = runScenario(["free", "-n", "1", "--all", "--dry-run", "--format", "json"], {
			git: {
				worktrees: [slotWorktree("slot-01", "feature/a")],
				localBranches: ["master", "feature/a"],
			},
			pr: { prsByBranch: { "feature/a": { number: 12, state: "OPEN" } } },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				freed: [],
				wouldFree: [{ slotName: "slot-01" }],
				cleanup: [
					{ action: "pr", status: "planned", prNumber: 12 },
					{ action: "local-branch", status: "planned" },
				],
				dryRun: true,
			},
		});
		expect(run.git.operations()).toEqual([]);
		expect(run.pr.operations()).toEqual([{ type: "get-pr-for-branch", branch: "feature/a" }]);
	});

	it("renders human dry-run summary through the destructive result block", async () => {
		const run = runScenario(["free", "-n", "1", "--all", "--dry-run"], {
			git: {
				worktrees: [slotWorktree("slot-01", "feature/a")],
				localBranches: ["master", "feature/a"],
			},
			pr: { prsByBranch: { "feature/a": { number: 12, state: "OPEN" } } },
		});
		expect(await run.exit).toBe(0);
		const stdout = run.stdout.join("");
		expect(stdout).toContain("Would free 1 slot(s).");
		expect(stdout).toContain("Would free slot-01 -> feature/a");
		expect(stdout).toContain("would close PR #12");
		expect(stdout).toContain("would force-delete local branch feature/a");
		expect(stdout).not.toContain("\u001B[");
		expect(run.git.operations()).toEqual([]);
	});

	it("requires --yes for destructive --all when non-interactive", async () => {
		const run = runScenario(["free", "--wt", "slot-01", "--all", "--format", "json"], {
			git: {
				worktrees: [slotWorktree("slot-01", "feature/a")],
				localBranches: ["master", "feature/a"],
			},
			pr: { prsByBranch: { "feature/a": { number: 12, state: "OPEN" } } },
		});
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "usageError",
			errorType: "usageError",
			data: { missingFlag: "--yes" },
		});
		expect(run.git.operations()).toEqual([]);
	});

	it("human --all prompt accepts with live progress and final summary", async () => {
		const accepted = runScenario(["free", "--wt", "slot-01", "--all"], {
			stdin: "yes\n",
			git: {
				worktrees: [slotWorktree("slot-01", "feature/a")],
				localBranches: ["master", "feature/a"],
			},
			pr: { prsByBranch: { "feature/a": { number: 12, state: "OPEN" } } },
		});
		expect(await accepted.exit).toBe(0);
		const stderr = accepted.stderr.join("");
		expect(stderr).toContain("Checking cleanup actions for 1 slot(s)…");
		expect(stderr).toContain("[y/N]");
		expect(stderr).toContain("Freeing slot-01 (feature/a)…");
		expect(stderr).toContain("Checking PR for feature/a…");
		expect(stderr).toContain("Closing PR #12…");
		expect(stderr).toContain("Deleting local branch feature/a…");
		expect(stderr).toContain("[y/N]: \nFreeing slot-01 (feature/a)…");
		expect(stderr).not.toContain("[y/N]: Freeing");
		expect(accepted.stdout.join("")).toContain("Freed slot-01 -> feature/a");
		expect(accepted.stdout.join("")).toContain("✓ Closed PR #12");
		expect(accepted.stdout.join("")).toContain("✓ Force-deleted local branch feature/a");
		expect(accepted.git.operations()).toContainEqual({
			type: "detach-head",
			path: "/slots/repos/repo/worktrees/slot-01",
			ref: "master",
		});
	});

	it("human --all prompt decline keeps execution progress and mutations suppressed", async () => {
		const declined = runScenario(["free", "--wt", "slot-01", "--all"], {
			stdin: "\n",
			git: {
				worktrees: [slotWorktree("slot-01", "feature/a")],
				localBranches: ["master", "feature/a"],
			},
			pr: { prsByBranch: { "feature/a": { number: 12, state: "OPEN" } } },
		});
		expect(await declined.exit).toBe(0);
		expect(declined.stdout.join("")).toContain("Cancelled slot free.");
		const stderr = declined.stderr.join("");
		expect(stderr).toContain("Checking cleanup actions for 1 slot(s)…");
		expect(stderr).toContain("[y/N]");
		expect(stderr).not.toContain("Freeing slot-01 (feature/a)…");
		expect(stderr).not.toContain("Closing PR #12…");
		expect(stderr).not.toContain("Deleting local branch feature/a…");
		expect(declined.git.operations()).toEqual([]);
		expect(declined.pr.operations()).toEqual([{ type: "get-pr-for-branch", branch: "feature/a" }]);
	});

	it("reports an unmatched branch selector instead of treating it as missing", async () => {
		const run = runScenario(["free", "-b", "feature/missing", "--format", "json"], {
			git: {
				worktrees: [slotWorktree("slot-01", "feature/a")],
				localBranches: ["master", "feature/a"],
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				freed: [],
				skipped: ["Branch 'feature/missing' is not assigned to a managed slot; nothing to free."],
			},
		});
		expect(run.git.operations()).toEqual([]);
	});

	it("--all --yes closes PR then deletes local branch after detach", async () => {
		const run = runScenario(["free", "-b", "feature/a", "--all", "--yes", "--format", "json"], {
			git: {
				worktrees: [{ path: "/repo", branch: "master" }, slotWorktree("slot-01", "feature/a")],
				localBranches: ["master", "feature/a"],
			},
			pr: { prsByBranch: { "feature/a": { number: 12, state: "OPEN" } } },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				cleanup: [
					{ action: "pr", status: "success" },
					{ action: "local-branch", status: "success" },
				],
			},
		});
		expect(run.stderr.join("")).toBe("");
		expect(run.git.operations()).toEqual([
			{ type: "detach-head", path: "/slots/repos/repo/worktrees/slot-01", ref: "master" },
			{ type: "delete-local-branch", branch: "feature/a", shouldForce: true },
		]);
		expect(run.pr.operations()).toEqual([
			{ type: "get-pr-for-branch", branch: "feature/a" },
			{ type: "get-pr-for-branch", branch: "feature/a" },
			{ type: "close-pr", number: 12 },
		]);
	});

	it("renders cleanup failures as destructive errors while preserving negative JSON", async () => {
		const json = runScenario(["free", "-b", "feature/a", "--all", "--yes", "--format", "json"], {
			git: {
				worktrees: [slotWorktree("slot-01", "feature/a")],
				localBranches: ["master", "feature/a"],
			},
			pr: {
				prsByBranch: { "feature/a": { number: 12, state: "OPEN" } },
				closeFailures: { 12: "permission denied" },
			},
		});
		expect(await json.exit).toBe(1);
		expect(parseJsonOutput(json)).toMatchObject({
			message: "Slot free completed with cleanup errors.",
			data: { cleanup: [{ action: "pr", status: "error", message: "permission denied" }] },
		});

		const human = runScenario(["free", "-b", "feature/a", "--all", "--yes"], {
			git: {
				worktrees: [slotWorktree("slot-01", "feature/a")],
				localBranches: ["master", "feature/a"],
			},
			pr: {
				prsByBranch: { "feature/a": { number: 12, state: "OPEN" } },
				closeFailures: { 12: "permission denied" },
			},
		});
		expect(await human.exit).toBe(1);
		const output = human.stdout.join("");
		expect(human.stderr.join("")).toContain("Closing PR #12");
		expect(output).toContain("Slot free completed with cleanup errors.");
		expect(output).toContain("✗ Failed to close PR #12: permission denied");
	});
});
