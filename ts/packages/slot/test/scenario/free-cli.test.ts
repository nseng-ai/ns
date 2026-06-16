import { describe, expect, it } from "vitest";

import { parseJsonOutput, runScenario, slotWorktree } from "../support/run-scenario.ts";

const slot01 = slotWorktree("slot-01", "feature/a");
const slot02 = slotWorktree("slot-02", "feature/b");

function assignedGit() {
	return {
		worktrees: [{ path: "/repo", branch: "master" }, slot01, slot02],
		branchOccupancies: [
			{ path: slot01.path, branch: "feature/a", operation: "checked-out" },
			{ path: slot02.path, branch: "feature/b", operation: "checked-out" },
		],
		localBranches: ["master", "feature/a", "feature/b"],
	};
}

describe("slot free CLI", () => {
	it("appears in root help and exposes release flags", async () => {
		const root = runScenario(["--help"]);
		expect(await root.exit).toBe(0);
		expect(root.stdout.join("")).toContain("free");

		const help = runScenario(["free", "--help"]);
		expect(await help.exit).toBe(0);
		const text = help.stdout.join("");
		for (const flag of ["--num", "--wt", "--branch", "--current", "--all", "--dry-run", "--yes", "--format", "--json-schema"]) {
			expect(text).toContain(flag);
		}
		expect(text).not.toContain("--cleanup");
	});

	it("fails for empty pool and missing selectors", async () => {
		const empty = runScenario(["free", "-n", "1"], { git: { worktrees: [{ path: "/repo", branch: "master" }] } });
		expect(await empty.exit).toBe(2);
		expect(empty.stderr.join("")).toContain("No managed slots configured");

		const missing = runScenario(["free"], { git: { worktrees: [{ path: "/repo", branch: "master" }, slotWorktree("slot-01", null)] } });
		expect(await missing.exit).toBe(2);
		expect(missing.stderr.join("")).toContain("Pass at least one slot selector");
	});

	it("dry-runs multiple selectors in order and dedupes first seen", async () => {
		const run = runScenario(["free", "-n", "2", "--wt", "slot-01", "--branch", "feature/a", "--dry-run", "--format", "json"], { git: assignedGit() });
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			exit_code: 0,
			data: {
				freed: [],
				would_free: [
					{ slot_name: "slot-02", branch_name: "feature/b" },
					{ slot_name: "slot-01", branch_name: "feature/a" },
				],
				dry_run: true,
			},
		});
		expect(run.git.operations()).toEqual([]);
	});

	it("skips branch selectors outside managed slots", async () => {
		const run = runScenario(["free", "--branch", "master", "--branch", "missing", "--format", "json"], { git: assignedGit() });
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				freed: [],
				skipped: [
					"Branch master is checked out in the main worktree, not a managed slot; nothing to free.",
					"Branch missing is not checked out in a managed slot; nothing to free.",
				],
			},
		});
	});

	it("refuses dirty and operation slots with aggregated errors", async () => {
		const run = runScenario(["free", "-n", "1", "-n", "2", "--format", "json"], {
			git: {
				...assignedGit(),
				dirtyPaths: [slot01.path],
				branchOccupancies: [
					{ path: slot01.path, branch: "feature/a", operation: "checked-out" },
					{ path: slot02.path, branch: "feature/b", operation: "rebase" },
				],
			},
		});
		expect(await run.exit).toBe(2);
		const envelope = parseJsonOutput(run);
		expect(envelope).toMatchObject({ exit_code: 2, error_type: "invalid_slot_args" });
		expect(JSON.stringify(envelope)).toContain("uncommitted changes");
		expect(JSON.stringify(envelope)).toContain("rebase in progress");
		expect(run.git.operations()).toEqual([]);
	});

	it("executes --all --yes cleanup through fake PR and git gateways", async () => {
		const run = runScenario(["free", "-n", "1", "--all", "--yes", "--format", "json"], {
			git: assignedGit(),
			pr: { prsByBranch: { "feature/a": { number: 123, state: "OPEN" } } },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				freed: [{ slot_name: "slot-01", branch_name: "feature/a" }],
				cleanup: [
					{ action: "pr", status: "success", pr_number: 123 },
					{ action: "local_branch", status: "success" },
				],
			},
		});
		expect(run.pr.closeCalls()).toEqual([123]);
		expect(run.git.operations()).toContainEqual({ type: "delete-local-branch", branch: "feature/a", shouldForce: true });
	});

	it("requires --yes for --all in JSON and lets human prompt decline without mutation", async () => {
		const json = runScenario(["free", "-n", "1", "--all", "--format", "json"], { git: assignedGit() });
		expect(await json.exit).toBe(2);
		expect(parseJsonOutput(json)).toMatchObject({ error_type: "confirmation_required" });

		const human = runScenario(["free", "-n", "1", "--all"], { git: assignedGit(), stdin: "\n" });
		expect(await human.exit).toBe(0);
		expect(human.stdout.join("")).toContain("Cancelled");
		expect(human.git.operations()).toEqual([]);
	});

	it("returns negative when cleanup fails after freeing", async () => {
		const run = runScenario(["free", "-n", "1", "--all", "--yes", "--format", "json"], {
			git: { ...assignedGit(), deleteBranchFailures: { "feature/a": { message: "protected", returncode: 1 } } },
			pr: { prsByBranch: { "feature/a": { number: 1, state: "MERGED" } } },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ exit_code: 1, data: { cleanup_error_count: 1 } });
	});
});
