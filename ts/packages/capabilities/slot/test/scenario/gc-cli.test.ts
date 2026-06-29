import { stripTerminalEscapes } from "@sdl/core/exec";
import { describe, expect, it } from "vitest";

import { parseJsonOutput, runScenario, slotWorktree } from "../support/run-scenario.ts";

describe("slot gc CLI", () => {
	it("appears in root help", async () => {
		const run = runScenario(["--help"]);
		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("gc");
	});

	it("dry-run classifies merged/open/missing PRs without mutation", async () => {
		const run = runScenario(["gc", "--dry-run", "--format", "json"], {
			git: {
				worktrees: [
					slotWorktree("slot-01", "feature/merged"),
					slotWorktree("slot-02", "feature/open"),
					slotWorktree("slot-03", "feature/no-pr"),
				],
				localBranches: ["master", "feature/merged", "feature/open", "feature/no-pr"],
			},
			pr: {
				prsByBranch: {
					"feature/merged": { number: 1, state: "MERGED" },
					"feature/open": { number: 2, state: "OPEN" },
				},
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				freed_count: 1,
				kept_count: 2,
				dry_run: true,
				entries: [{ action: "would_free" }, { action: "kept_open_pr" }, { action: "kept_no_pr" }],
			},
		});
		expect(run.pr.operations()).toEqual([
			{
				type: "get-prs-for-branches",
				branches: ["feature/merged", "feature/open", "feature/no-pr"],
			},
		]);
		expect(run.git.operations()).toEqual([]);
	});

	it("renders human dry-run output through the destructive result block", async () => {
		const run = runScenario(["gc", "--dry-run"], {
			canEmitAnsi: true,
			git: {
				worktrees: [
					slotWorktree("slot-01", "feature/merged"),
					slotWorktree("slot-02", "feature/open"),
					slotWorktree("slot-03", "feature/no-pr"),
				],
				localBranches: ["master", "feature/merged", "feature/open", "feature/no-pr"],
			},
			pr: {
				prsByBranch: {
					"feature/merged": { number: 1, state: "MERGED" },
					"feature/open": { number: 2, state: "OPEN" },
				},
			},
		});
		expect(await run.exit).toBe(0);
		const rendered = run.stdout.join("");
		expect(rendered).toContain("\u001b[");
		const stripped = stripTerminalEscapes(rendered);
		expect(stripped).toContain("Would free 1 slot(s).");
		expect(stripped).toContain("ACTION");
		expect(stripped).toContain("SLOT");
		expect(stripped).toContain("BRANCH");
		expect(stripped).toContain("PR");
		expect(stripped).toContain("Would free");
		expect(stripped).toContain("slot-01");
		expect(stripped).toContain("feature/merged");
		expect(stripped).toContain("#1 MERGED");
		expect(stripped).toContain("Kept: open PR");
		expect(stripped).toContain("slot-02");
		expect(stripped).toContain("#2 OPEN");
		expect(stripped).toContain("Kept: no PR");
		expect(stripped).toContain("slot-03");
		expect(stripped).toContain("Summary: would free 1; kept 2; skipped 0; errors 0");
	});

	it("fails the command when batch PR lookup fails", async () => {
		const run = runScenario(["gc", "--dry-run", "--format", "json"], {
			git: {
				worktrees: [slotWorktree("slot-01", "feature/merged")],
				localBranches: ["master", "feature/merged"],
			},
			pr: { batchLookupFailure: "GraphQL failed" },
		});
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({
			errorType: "pr_lookup_failed",
			message: "GraphQL failed",
		});
		expect(run.pr.operations()).toEqual([
			{ type: "get-prs-for-branches", branches: ["feature/merged"] },
		]);
		expect(run.git.operations()).toEqual([]);
	});

	it("non-interactive destructive gc without --force fails as usageError", async () => {
		const run = runScenario(["gc", "--format", "json"], {
			git: {
				worktrees: [slotWorktree("slot-01", "feature/merged")],
				localBranches: ["master", "feature/merged"],
			},
			pr: { prsByBranch: { "feature/merged": { number: 1, state: "MERGED" } } },
		});
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "usageError",
			exitCode: 2,
			errorType: "usageError",
			data: { missingFlag: "--force" },
		});
		expect(run.git.operations()).toEqual([]);
	});

	it("human prompt accepts empty default and declines no", async () => {
		const accepted = runScenario(["gc"], {
			stdin: "\n",
			git: {
				worktrees: [slotWorktree("slot-01", "feature/closed")],
				localBranches: ["master", "feature/closed"],
			},
			pr: { prsByBranch: { "feature/closed": { number: 1, state: "CLOSED" } } },
		});
		expect(await accepted.exit).toBe(0);
		const acceptedStderr = stripTerminalEscapes(accepted.stderr.join(""));
		expect(acceptedStderr).toContain("Would free 1 slot(s).");
		expect(acceptedStderr).toContain("ACTION");
		expect(acceptedStderr).toContain("slot-01");
		expect(acceptedStderr).toContain("feature/closed");
		expect(acceptedStderr).toContain("#1 CLOSED");
		expect(accepted.stderr.join("")).toContain("Free 1 merged/closed slot(s)? [Y/n]");
		expect(accepted.git.operations()).toEqual([
			{ type: "detach-head", path: "/slots/repos/repo/worktrees/slot-01", ref: "master" },
		]);

		const declined = runScenario(["gc"], {
			stdin: "no\n",
			git: {
				worktrees: [slotWorktree("slot-01", "feature/closed")],
				localBranches: ["master", "feature/closed"],
			},
			pr: { prsByBranch: { "feature/closed": { number: 1, state: "CLOSED" } } },
		});
		expect(await declined.exit).toBe(0);
		expect(stripTerminalEscapes(declined.stdout.join(""))).toContain("Cancelled slot gc.");
		expect(declined.git.operations()).toEqual([]);
	});

	it("human --delete-branches prompt previews branch cleanup before confirmation", async () => {
		const declined = runScenario(["gc", "--delete-branches"], {
			stdin: "no\n",
			git: {
				worktrees: [slotWorktree("slot-01", "feature/closed")],
				localBranches: ["master", "feature/closed"],
			},
			pr: { prsByBranch: { "feature/closed": { number: 1, state: "CLOSED" } } },
		});
		expect(await declined.exit).toBe(0);
		const declinedStderr = stripTerminalEscapes(declined.stderr.join(""));
		expect(declinedStderr).toContain("Would free 1 slot(s).");
		expect(declinedStderr).toContain("ACTION");
		expect(declinedStderr).toContain("slot-01");
		expect(declinedStderr).toContain("feature/closed");
		expect(declinedStderr).toContain("#1 CLOSED");
		expect(declinedStderr).toContain("cleanup: would force-delete local branch feature/closed");
		expect(declined.stderr.join("")).toContain(
			"Free 1 merged/closed slot(s) and force-delete their local branches? [Y/n]",
		);
		expect(stripTerminalEscapes(declined.stdout.join(""))).toContain("Cancelled slot gc.");
		expect(declined.git.operations()).toEqual([]);
	});

	it("--force frees closed assignments and --delete-branches deletes local branch", async () => {
		const run = runScenario(["gc", "--force", "--delete-branches", "--format", "json"], {
			git: {
				worktrees: [
					slotWorktree("slot-01", "feature/closed"),
					slotWorktree("slot-02", "feature/open"),
				],
				localBranches: ["master", "feature/closed", "feature/open"],
			},
			pr: {
				prsByBranch: {
					"feature/closed": { number: 1, state: "CLOSED" },
					"feature/open": { number: 2, state: "OPEN" },
				},
			},
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				freed_count: 1,
				kept_count: 1,
				cleanup_error_count: 0,
				entries: [
					{ action: "freed", cleanup: [{ action: "local_branch", status: "success" }] },
					{ action: "kept_open_pr" },
				],
			},
		});
		expect(run.git.operations()).toEqual([
			{ type: "detach-head", path: "/slots/repos/repo/worktrees/slot-01", ref: "master" },
			{ type: "delete-local-branch", branch: "feature/closed", shouldForce: true },
		]);
	});

	it("renders cleanup failures as destructive errors while preserving negative JSON", async () => {
		const json = runScenario(["gc", "--force", "--delete-branches", "--format", "json"], {
			git: {
				worktrees: [slotWorktree("slot-01", "feature/closed")],
				localBranches: ["master", "feature/closed"],
				deleteBranchFailures: {
					"feature/closed": { message: "permission denied" },
				},
			},
			pr: { prsByBranch: { "feature/closed": { number: 1, state: "CLOSED" } } },
		});
		expect(await json.exit).toBe(1);
		expect(parseJsonOutput(json)).toMatchObject({
			message: "Slot gc completed with cleanup errors.",
			data: {
				cleanup_error_count: 1,
				entries: [
					{ cleanup: [{ action: "local_branch", status: "error", message: "permission denied" }] },
				],
			},
		});

		const human = runScenario(["gc", "--force", "--delete-branches"], {
			git: {
				worktrees: [slotWorktree("slot-01", "feature/closed")],
				localBranches: ["master", "feature/closed"],
				deleteBranchFailures: {
					"feature/closed": { message: "permission denied" },
				},
			},
			pr: { prsByBranch: { "feature/closed": { number: 1, state: "CLOSED" } } },
		});
		expect(await human.exit).toBe(1);
		expect(human.stdout.join("")).toBe("");
		const stderr = human.stderr.join("");
		expect(stderr).toContain("Slot gc completed with cleanup errors.");
		expect(stderr).toContain(
			"✗ Failed to force-delete local branch feature/closed: permission denied",
		);
	});

	it("--dry-run conflicts with --force", async () => {
		const run = runScenario(["gc", "--dry-run", "--force", "--format", "json"]);
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ errorType: "conflicting_flags" });
	});
});
