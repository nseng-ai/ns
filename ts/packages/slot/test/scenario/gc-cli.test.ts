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
			git: { worktrees: [slotWorktree("slot-01", "feature/merged"), slotWorktree("slot-02", "feature/open"), slotWorktree("slot-03", "feature/no-pr")], localBranches: ["master", "feature/merged", "feature/open", "feature/no-pr"] },
			pr: { prsByBranch: { "feature/merged": { number: 1, state: "MERGED" }, "feature/open": { number: 2, state: "OPEN" } } },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ data: { freed_count: 1, kept_count: 2, dry_run: true, entries: [{ action: "would_free" }, { action: "kept_open_pr" }, { action: "kept_no_pr" }] } });
		expect(run.pr.operations()).toEqual([{ type: "get-prs-for-branches", branches: ["feature/merged", "feature/open", "feature/no-pr"] }]);
		expect(run.git.operations()).toEqual([]);
	});

	it("fails the command when batch PR lookup fails", async () => {
		const run = runScenario(["gc", "--dry-run", "--format", "json"], {
			git: { worktrees: [slotWorktree("slot-01", "feature/merged")], localBranches: ["master", "feature/merged"] },
			pr: { batchLookupFailure: "GraphQL failed" },
		});
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ error_type: "pr_lookup_failed", message: "GraphQL failed" });
		expect(run.pr.operations()).toEqual([{ type: "get-prs-for-branches", branches: ["feature/merged"] }]);
		expect(run.git.operations()).toEqual([]);
	});

	it("requires --force for destructive JSON gc", async () => {
		const run = runScenario(["gc", "--format", "json"], {
			git: { worktrees: [slotWorktree("slot-01", "feature/merged")], localBranches: ["master", "feature/merged"] },
			pr: { prsByBranch: { "feature/merged": { number: 1, state: "MERGED" } } },
		});
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ error_type: "confirmation_required" });
		expect(run.git.operations()).toEqual([]);
	});

	it("human prompt accepts empty default and declines no", async () => {
		const accepted = runScenario(["gc"], {
			stdin: "\n",
			git: { worktrees: [slotWorktree("slot-01", "feature/closed")], localBranches: ["master", "feature/closed"] },
			pr: { prsByBranch: { "feature/closed": { number: 1, state: "CLOSED" } } },
		});
		expect(await accepted.exit).toBe(0);
		expect(accepted.stderr.join("")).toContain("→ would free slot-01 (feature/closed) PR #1 CLOSED");
		expect(accepted.stderr.join("")).toContain("Free 1 slot(s)? [Y/n]");
		expect(accepted.git.operations()).toEqual([{ type: "detach-head", path: "/slots/repos/repo/worktrees/slot-01", ref: "master" }]);

		const declined = runScenario(["gc"], {
			stdin: "no\n",
			git: { worktrees: [slotWorktree("slot-01", "feature/closed")], localBranches: ["master", "feature/closed"] },
			pr: { prsByBranch: { "feature/closed": { number: 1, state: "CLOSED" } } },
		});
		expect(await declined.exit).toBe(0);
		expect(declined.stdout.join("")).toContain("Cancelled — no slots freed.");
		expect(declined.git.operations()).toEqual([]);
	});

	it("human --delete-branches prompt previews branch cleanup before confirmation", async () => {
		const declined = runScenario(["gc", "--delete-branches"], {
			stdin: "no\n",
			git: { worktrees: [slotWorktree("slot-01", "feature/closed")], localBranches: ["master", "feature/closed"] },
			pr: { prsByBranch: { "feature/closed": { number: 1, state: "CLOSED" } } },
		});
		expect(await declined.exit).toBe(0);
		expect(declined.stderr.join("")).toContain("→ would free slot-01 (feature/closed) PR #1 CLOSED");
		expect(declined.stderr.join("")).toContain("local branch: force-delete feature/closed");
		expect(declined.stderr.join("")).toContain("Free 1 slot(s) and delete local branches? [Y/n]");
		expect(declined.stdout.join("")).toContain("Cancelled — no slots freed.");
		expect(declined.git.operations()).toEqual([]);
	});

	it("--force frees closed assignments and --delete-branches deletes local branch", async () => {
		const run = runScenario(["gc", "--force", "--delete-branches", "--format", "json"], {
			git: { worktrees: [slotWorktree("slot-01", "feature/closed"), slotWorktree("slot-02", "feature/open")], localBranches: ["master", "feature/closed", "feature/open"] },
			pr: { prsByBranch: { "feature/closed": { number: 1, state: "CLOSED" }, "feature/open": { number: 2, state: "OPEN" } } },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ data: { freed_count: 1, kept_count: 1, cleanup_error_count: 0, entries: [{ action: "freed", cleanup: [{ action: "local_branch", status: "success" }] }, { action: "kept_open_pr" }] } });
		expect(run.git.operations()).toEqual([
			{ type: "detach-head", path: "/slots/repos/repo/worktrees/slot-01", ref: "master" },
			{ type: "delete-local-branch", branch: "feature/closed", shouldForce: true },
		]);
	});

	it("--dry-run conflicts with --force", async () => {
		const run = runScenario(["gc", "--dry-run", "--force", "--format", "json"]);
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ error_type: "conflicting_flags" });
	});
});
