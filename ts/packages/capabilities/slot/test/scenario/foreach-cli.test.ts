import { describe, expect, it } from "vitest";

import { parseJsonOutput, runScenario, slotWorktree } from "../support/run-scenario.ts";

describe("slot foreach CLI", () => {
	it("appears in root help", async () => {
		const run = runScenario(["--help"]);
		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("foreach");
	});

	it("runs the command in every slot in slot-number order and exits 0 when all succeed", async () => {
		const run = runScenario(["foreach", "--yes", "--format", "json", "--", "git", "clean", "-fd"], {
			git: {
				worktrees: [slotWorktree("slot-02", "feature/b"), slotWorktree("slot-01", "feature/a")],
			},
			command: {
				resultsByCwd: {
					"/slots/repos/repo/worktrees/slot-01": { stdout: "clean a\n" },
					"/slots/repos/repo/worktrees/slot-02": { stdout: "clean b\n" },
				},
			},
		});
		expect(await run.exit).toBe(0);
		expect(run.command.invocations()).toEqual([
			{ command: "git", args: ["clean", "-fd"], cwd: "/slots/repos/repo/worktrees/slot-01" },
			{ command: "git", args: ["clean", "-fd"], cwd: "/slots/repos/repo/worktrees/slot-02" },
		]);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				command: ["git", "clean", "-fd"],
				cancelled: false,
				slots: [
					{ slot_name: "slot-01", branch: "feature/a", exit_code: 0, succeeded: true },
					{ slot_name: "slot-02", branch: "feature/b", exit_code: 0, succeeded: true },
				],
			},
		});
	});

	it("continues past failures and exits 1 when any slot's command fails", async () => {
		const run = runScenario(["foreach", "--yes", "--format", "json", "--", "git", "status"], {
			git: {
				worktrees: [slotWorktree("slot-01", "feature/a"), slotWorktree("slot-02", null)],
			},
			command: {
				resultsByCwd: {
					"/slots/repos/repo/worktrees/slot-02": { code: 1, stderr: "boom\n" },
				},
			},
		});
		expect(await run.exit).toBe(1);
		expect(run.command.invocations()).toHaveLength(2);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "negative",
			data: {
				slots: [
					{ slot_name: "slot-01", succeeded: true, exit_code: 0 },
					{ slot_name: "slot-02", succeeded: false, exit_code: 1 },
				],
			},
		});
	});

	it("aborts before running anything when a slot has an operation in progress", async () => {
		const run = runScenario(["foreach", "--yes", "--format", "json", "--", "git", "status"], {
			git: {
				worktrees: [slotWorktree("slot-01", null), slotWorktree("slot-02", null)],
				branchOccupancies: [
					{
						path: "/slots/repos/repo/worktrees/slot-02",
						branch: "feature/rebasing",
						operation: "rebase",
					},
				],
			},
		});
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ errorType: "operation_in_progress" });
		expect(run.command.invocations()).toEqual([]);
	});

	it("fails with missing_command when no command is passed", async () => {
		const run = runScenario(["foreach", "--format", "json"], {
			git: { worktrees: [slotWorktree("slot-01", null)] },
		});
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ errorType: "missing_command" });
		expect(run.command.invocations()).toEqual([]);
	});

	it("fails with pool_empty when no managed slots exist", async () => {
		const run = runScenario(["foreach", "--yes", "--format", "json", "--", "git", "status"], {
			git: { worktrees: [{ path: "/repo", branch: "master" }] },
		});
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ errorType: "pool_empty" });
		expect(run.command.invocations()).toEqual([]);
	});

	it("requires --yes in JSON mode", async () => {
		const run = runScenario(["foreach", "--format", "json", "--", "git", "status"], {
			git: { worktrees: [slotWorktree("slot-01", null)] },
		});
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ errorType: "confirmation_required" });
		expect(run.command.invocations()).toEqual([]);
	});

	it("prompts in human mode: accept runs, decline cancels", async () => {
		const accepted = runScenario(["foreach", "--", "git", "status"], {
			stdin: "yes\n",
			git: { worktrees: [slotWorktree("slot-01", "feature/a")] },
		});
		expect(await accepted.exit).toBe(0);
		expect(accepted.stderr.join("")).toContain("[y/N]");
		expect(accepted.command.invocations()).toEqual([
			{ command: "git", args: ["status"], cwd: "/slots/repos/repo/worktrees/slot-01" },
		]);

		const declined = runScenario(["foreach", "--", "git", "status"], {
			stdin: "\n",
			git: { worktrees: [slotWorktree("slot-01", "feature/a")] },
		});
		expect(await declined.exit).toBe(0);
		expect(declined.stdout.join("")).toContain("Cancelled slot foreach.");
		expect(declined.command.invocations()).toEqual([]);
	});

	it("captures a flag-bearing command after -- (passthrough)", async () => {
		const run = runScenario(["foreach", "--yes", "--format", "json", "--", "git", "clean", "-fd"], {
			git: { worktrees: [slotWorktree("slot-01", null)] },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: { command: ["git", "clean", "-fd"] },
		});
	});
});
