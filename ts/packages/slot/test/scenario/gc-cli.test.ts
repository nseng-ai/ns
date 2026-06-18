import { describe, expect, it } from "vitest";

import { parseJsonOutput, runScenario, slotWorktree } from "../support/run-scenario.ts";

const slot01 = slotWorktree("slot-01", "feature/merged");
const slot02 = slotWorktree("slot-02", "feature/open");
const slot03 = slotWorktree("slot-03", "feature/no-pr");

function gcGit() {
	return {
		worktrees: [{ path: "/repo", branch: "master" }, slot01, slot02, slot03],
		branchOccupancies: [
			{ path: slot01.path, branch: "feature/merged", operation: "checked-out" },
			{ path: slot02.path, branch: "feature/open", operation: "checked-out" },
			{ path: slot03.path, branch: "feature/no-pr", operation: "checked-out" },
		],
		localBranches: ["master", "feature/merged", "feature/open", "feature/no-pr"],
	};
}

describe("slot gc CLI", () => {
	it("appears in help and exposes flags", async () => {
		const root = runScenario(["--help"]);
		expect(await root.exit).toBe(0);
		expect(root.stdout.join("")).toContain("gc");

		const help = runScenario(["gc", "--help"]);
		expect(await help.exit).toBe(0);
		const text = help.stdout.join("");
		for (const flag of ["--dry-run", "--force", "--delete-branches", "--format", "--json-schema"]) expect(text).toContain(flag);
	});

	it("fails for empty pool and conflicting dry-run force flags", async () => {
		const empty = runScenario(["gc"], { git: { worktrees: [{ path: "/repo", branch: "master" }] } });
		expect(await empty.exit).toBe(2);
		expect(empty.stderr.join("")).toContain("No managed slots configured");

		const conflict = runScenario(["gc", "--dry-run", "--force"]);
		expect(await conflict.exit).toBe(2);
		expect(conflict.stderr.join("")).toContain("mutually exclusive");
	});

	it("dry-runs classification for closed, open, and missing PRs", async () => {
		const run = runScenario(["gc", "--dry-run", "--format", "json"], {
			git: gcGit(),
			pr: { prsByBranch: { "feature/merged": { number: 10, state: "MERGED" }, "feature/open": { number: 11, state: "OPEN" } } },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				entries: [
					{ slot_name: "slot-01", action: "would_free", pr_number: 10, pr_state: "MERGED" },
					{ slot_name: "slot-02", action: "kept_open_pr", pr_number: 11, pr_state: "OPEN" },
					{ slot_name: "slot-03", action: "kept_no_pr" },
				],
				freed_count: 1,
				kept_count: 2,
				dry_run: true,
			},
		});
		expect(run.git.operations()).toEqual([]);
	});

	it("force frees closed PR slots and deletes only successfully freed local branches", async () => {
		const run = runScenario(["gc", "--force", "--delete-branches", "--format", "json"], {
			git: gcGit(),
			pr: { prsByBranch: { "feature/merged": { number: 10, state: "CLOSED" }, "feature/open": { number: 11, state: "OPEN" } } },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				entries: [
					{ slot_name: "slot-01", action: "freed", cleanup: [{ action: "local_branch", status: "success" }] },
					{ slot_name: "slot-02", action: "kept_open_pr" },
					{ slot_name: "slot-03", action: "kept_no_pr" },
				],
				freed_count: 1,
				kept_count: 2,
			},
		});
		expect(run.git.operations()).toContainEqual({ type: "delete-local-branch", branch: "feature/merged", shouldForce: true });
	});

	it("prompts with default yes and decline avoids mutation", async () => {
		const accepted = runScenario(["gc"], {
			git: gcGit(),
			pr: { prsByBranch: { "feature/merged": { number: 10, state: "MERGED" } } },
			stdin: "\n",
		});
		expect(await accepted.exit).toBe(0);
		expect(accepted.git.operations()).toContainEqual({ type: "detach-head", path: slot01.path, ref: "master" });

		const declined = runScenario(["gc"], {
			git: gcGit(),
			pr: { prsByBranch: { "feature/merged": { number: 10, state: "MERGED" } } },
			stdin: "n\n",
		});
		expect(await declined.exit).toBe(0);
		expect(declined.stdout.join("")).toContain("Cancelled");
		expect(declined.git.operations()).toEqual([]);
	});

	it("maps PR lookup and cleanup failures into error counts", async () => {
		const lookup = runScenario(["gc", "--dry-run", "--format", "json"], {
			git: gcGit(),
			pr: { lookupFailures: { "feature/merged": { stderr: "auth failed", stdout: "", returncode: 1 } } },
		});
		expect(await lookup.exit).toBe(0);
		expect(parseJsonOutput(lookup)).toMatchObject({ data: { error_count: 1 } });
		expect(JSON.stringify(parseJsonOutput(lookup))).toContain("auth failed");

		const cleanup = runScenario(["gc", "--force", "--delete-branches", "--format", "json"], {
			git: { ...gcGit(), deleteBranchFailures: { "feature/merged": { message: "cannot delete", returncode: 1 } } },
			pr: { prsByBranch: { "feature/merged": { number: 10, state: "MERGED" } } },
		});
		expect(await cleanup.exit).toBe(0);
		expect(parseJsonOutput(cleanup)).toMatchObject({ exit_code: 1, data: { cleanup_error_count: 1 } });
	});
});
