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
			git: { worktrees: [slotWorktree("slot-01", "feature/a")], localBranches: ["master", "feature/a"] },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ data: { freed: [{ slot_name: "slot-01", branch_name: "feature/a" }], dry_run: false } });
		expect(run.git.operations()).toEqual([{ type: "detach-head", path: "/slots/repos/repo/worktrees/slot-01", ref: "master" }]);
	});

	it("dry-runs --all cleanup without mutating PRs or branches", async () => {
		const run = runScenario(["free", "-n", "1", "--all", "--dry-run", "--format", "json"], {
			git: { worktrees: [slotWorktree("slot-01", "feature/a")], localBranches: ["master", "feature/a"] },
			pr: { prsByBranch: { "feature/a": { number: 12, state: "OPEN" } } },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ data: { freed: [], would_free: [{ slot_name: "slot-01" }], cleanup: [{ action: "pr", status: "planned", pr_number: 12 }, { action: "local_branch", status: "planned" }], dry_run: true } });
		expect(run.git.operations()).toEqual([]);
		expect(run.pr.operations()).toEqual([{ type: "get-pr-for-branch", branch: "feature/a" }]);
	});

	it("requires --yes for destructive --all in JSON mode", async () => {
		const run = runScenario(["free", "--wt", "slot-01", "--all", "--format", "json"], {
			git: { worktrees: [slotWorktree("slot-01", "feature/a")], localBranches: ["master", "feature/a"] },
			pr: { prsByBranch: { "feature/a": { number: 12, state: "OPEN" } } },
		});
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ error_type: "confirmation_required" });
		expect(run.git.operations()).toEqual([]);
	});

	it("--all --yes closes PR then deletes local branch after detach", async () => {
		const run = runScenario(["free", "-b", "feature/a", "--all", "--yes", "--format", "json"], {
			git: { worktrees: [{ path: "/repo", branch: "master" }, slotWorktree("slot-01", "feature/a")], localBranches: ["master", "feature/a"] },
			pr: { prsByBranch: { "feature/a": { number: 12, state: "OPEN" } } },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ data: { cleanup: [{ action: "pr", status: "success" }, { action: "local_branch", status: "success" }] } });
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
});
