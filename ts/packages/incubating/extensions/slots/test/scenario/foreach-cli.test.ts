import type { ExecResult } from "@nseng-ai/foundation/command";
import { exitedResult } from "@nseng-ai/foundation/exec/testing";
import { describe, expect, it } from "vitest";

import { parseJsonOutput, runScenario, slotWorktree } from "../support/run-scenario.ts";

const mainWorktree = { path: "/repo", branch: "master" };

describe("slot foreach CLI", () => {
	it("appears in root help", async () => {
		const run = runScenario(["--help"]);
		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("foreach");
	});

	it("runs in the main worktree and then every slot in slot-number order", async () => {
		const run = runScenario(["foreach", "--yes", "--format", "json", "--", "git", "clean", "-fd"], {
			git: {
				worktrees: [
					slotWorktree("slot-02", "feature/b"),
					mainWorktree,
					slotWorktree("slot-01", "feature/a"),
				],
			},
			command: {
				resultsByCwd: {
					"/repo": exitedResult({ stdout: "clean main\n" }),
					"/slots/repos/repo/worktrees/slot-01": exitedResult({ stdout: "clean a\n" }),
					"/slots/repos/repo/worktrees/slot-02": exitedResult({ stdout: "clean b\n" }),
				},
			},
		});
		expect(await run.exit).toBe(0);
		expect(run.command.invocations()).toEqual([
			{ command: "git", args: ["clean", "-fd"], cwd: "/repo" },
			{ command: "git", args: ["clean", "-fd"], cwd: "/slots/repos/repo/worktrees/slot-01" },
			{ command: "git", args: ["clean", "-fd"], cwd: "/slots/repos/repo/worktrees/slot-02" },
		]);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				command: ["git", "clean", "-fd"],
				cancelled: false,
				mainWorktree: {
					worktreePath: "/repo",
					branch: "master",
					exitCode: 0,
					succeeded: true,
				},
				slots: [
					{ slotName: "slot-01", branch: "feature/a", exitCode: 0, succeeded: true },
					{ slotName: "slot-02", branch: "feature/b", exitCode: 0, succeeded: true },
				],
			},
		});
		expect(run.stderr.join("")).toBe("");
	});

	it("excludes named Slots only, including when every Slot is excluded", async () => {
		const run = runScenario(
			[
				"foreach",
				"--yes",
				"--exclude",
				"slot-01",
				"-x",
				"slot-02",
				"--format",
				"json",
				"--",
				"git",
				"status",
			],
			{
				git: {
					worktrees: [mainWorktree, slotWorktree("slot-01", "feature/a"), slotWorktree("slot-02")],
					branchOccupancies: [
						{
							path: "/slots/repos/repo/worktrees/slot-02",
							branch: "feature/rebasing",
							operation: "rebase",
						},
					],
				},
			},
		);
		expect(await run.exit).toBe(0);
		expect(run.command.invocations()).toEqual([{ command: "git", args: ["status"], cwd: "/repo" }]);
		expect(parseJsonOutput(run)).toMatchObject({
			data: {
				excluded: ["slot-01", "slot-02"],
				mainWorktree: { worktreePath: "/repo", succeeded: true },
				slots: [],
			},
		});
	});

	it("fails before execution when an excluded Slot is unknown", async () => {
		const run = runScenario(
			["foreach", "--yes", "--exclude", "slot-99", "--format", "json", "--", "git", "status"],
			{ git: { worktrees: [mainWorktree, slotWorktree("slot-01")] } },
		);
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ errorType: "unknown-slot" });
		expect(run.command.invocations()).toEqual([]);
	});

	it("continues past a main-worktree failure and exits 1 with complete results", async () => {
		const run = runScenario(["foreach", "--yes", "--format", "json", "--", "git", "status"], {
			git: {
				worktrees: [mainWorktree, slotWorktree("slot-01", "feature/a"), slotWorktree("slot-02")],
			},
			command: {
				resultsByCwd: {
					"/repo": exitedResult({ code: 1, stderr: "boom\n" }),
				},
			},
		});
		expect(await run.exit).toBe(1);
		expect(run.command.invocations()).toHaveLength(3);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "negative",
			data: {
				mainWorktree: { succeeded: false, exitCode: 1 },
				slots: [
					{ slotName: "slot-01", succeeded: true, exitCode: 0 },
					{ slotName: "slot-02", succeeded: true, exitCode: 0 },
				],
			},
		});
	});

	it("continues past a Slot failure and includes it in the negative result", async () => {
		const run = runScenario(["foreach", "--yes", "--format", "json", "--", "git", "status"], {
			git: {
				worktrees: [mainWorktree, slotWorktree("slot-01", "feature/a"), slotWorktree("slot-02")],
			},
			command: {
				resultsByCwd: {
					"/slots/repos/repo/worktrees/slot-01": exitedResult({ code: 1 }),
				},
			},
		});
		expect(await run.exit).toBe(1);
		expect(run.command.invocations()).toHaveLength(3);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "negative",
			data: {
				mainWorktree: { succeeded: true },
				slots: [
					{ slotName: "slot-01", succeeded: false },
					{ slotName: "slot-02", succeeded: true },
				],
			},
		});
	});

	it("aborts every invocation when the main worktree has an operation in progress", async () => {
		const run = runScenario(["foreach", "--yes", "--format", "json", "--", "git", "status"], {
			git: {
				worktrees: [{ path: "/repo", branch: null }, slotWorktree("slot-01")],
				branchOccupancies: [{ path: "/repo", branch: "feature/rebasing", operation: "rebase" }],
			},
		});
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({
			errorType: "operation-in-progress",
			message: expect.stringContaining("main worktree: rebase in progress"),
		});
		expect(run.command.invocations()).toEqual([]);
	});

	it("aborts every invocation when an included Slot has an operation in progress", async () => {
		const run = runScenario(["foreach", "--yes", "--format", "json", "--", "git", "status"], {
			git: {
				worktrees: [mainWorktree, slotWorktree("slot-01"), slotWorktree("slot-02")],
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
		expect(parseJsonOutput(run)).toMatchObject({ errorType: "operation-in-progress" });
		expect(run.command.invocations()).toEqual([]);
	});

	it("fails before confirmation or execution when the main worktree is absent", async () => {
		const run = runScenario(["foreach", "--format", "json", "--", "git", "status"], {
			git: { worktrees: [slotWorktree("slot-01")] },
		});
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ errorType: "main-worktree-not-found" });
		expect(run.command.invocations()).toEqual([]);
	});

	it("fails with missing-command when no command is passed", async () => {
		const run = runScenario(["foreach", "--format", "json"], {
			git: { worktrees: [mainWorktree, slotWorktree("slot-01")] },
		});
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ errorType: "missing-command" });
		expect(run.command.invocations()).toEqual([]);
	});

	it("preserves pool-empty when no managed Slots exist", async () => {
		const run = runScenario(["foreach", "--yes", "--format", "json", "--", "git", "status"], {
			git: { worktrees: [mainWorktree] },
		});
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ errorType: "pool-empty" });
		expect(run.command.invocations()).toEqual([]);
	});

	it("requires --yes in JSON mode", async () => {
		const run = runScenario(["foreach", "--format", "json", "--", "git", "status"], {
			git: { worktrees: [mainWorktree, slotWorktree("slot-01")] },
		});
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ errorType: "confirmation-required" });
		expect(run.command.invocations()).toEqual([]);
	});

	it("publishes an additive main-worktree JSON schema without weakening Slot results", async () => {
		const run = runScenario(["foreach", "--json-schema"]);
		expect(await run.exit).toBe(0);
		const schema = run.stdout.join("");
		expect(schema).toContain('"mainWorktree"');
		expect(schema).toContain('"slots"');
		expect(schema).toContain('"slotName"');
	});

	it("prompts with the complete target set and represents a decline honestly", async () => {
		const accepted = runScenario(["foreach", "--", "git", "status"], {
			stdin: "yes\n",
			git: { worktrees: [mainWorktree, slotWorktree("slot-01", "feature/a")] },
		});
		expect(await accepted.exit).toBe(0);
		expect(accepted.stderr.join("")).toContain("in the main worktree and 1 slot? [y/N]");
		expect(accepted.command.invocations()).toEqual([
			{ command: "git", args: ["status"], cwd: "/repo" },
			{ command: "git", args: ["status"], cwd: "/slots/repos/repo/worktrees/slot-01" },
		]);

		const declined = runScenario(["foreach", "--", "git", "status"], {
			stdin: "\n",
			git: { worktrees: [mainWorktree, slotWorktree("slot-01", "feature/a")] },
		});
		expect(await declined.exit).toBe(0);
		expect(declined.stdout.join("")).toContain("Cancelled slot foreach.");
		expect(declined.stderr.join("")).not.toContain("Running in");
		expect(declined.stderr.join("")).not.toContain("Finished");
		expect(declined.command.invocations()).toEqual([]);
	});

	it("emits human progress before and after each target in order", async () => {
		const run = runScenario(["foreach", "--yes", "--", "git", "status"], {
			git: { worktrees: [mainWorktree, slotWorktree("slot-01", "feature/a")] },
		});
		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toContain(
			"Running in main worktree (master) [1/2]…\n" +
				"Finished main worktree (master) [1/2]: succeeded (exit 0).\n" +
				"Running in slot-01 (feature/a) [2/2]…\n" +
				"Finished slot-01 (feature/a) [2/2]: succeeded (exit 0).\n",
		);
		expect(run.stdout.join("")).toContain("2/2 worktrees succeeded");
	});

	it("publishes a start before command completion and a finish only afterward", async () => {
		let resolveMain!: (result: ExecResult) => void;
		const pendingMain = new Promise<ExecResult>((resolve) => {
			resolveMain = resolve;
		});
		let notifyRun!: () => void;
		const commandStarted = new Promise<void>((resolve) => {
			notifyRun = resolve;
		});
		const run = runScenario(["foreach", "--yes", "--", "git", "status"], {
			git: { worktrees: [mainWorktree, slotWorktree("slot-01")] },
			command: {
				pendingResultsByCwd: { "/repo": pendingMain },
				onRun: (invocation) => {
					if (invocation.cwd === "/repo") notifyRun();
				},
			},
		});
		await commandStarted;
		expect(run.stderr.join("")).toContain("Running in main worktree (master) [1/2]…");
		expect(run.stderr.join("")).not.toContain("Finished main worktree");
		resolveMain(exitedResult());
		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toContain(
			"Finished main worktree (master) [1/2]: succeeded (exit 0).",
		);
	});

	it("reports a spawn failure and continues progress for later targets", async () => {
		const run = runScenario(["foreach", "--yes", "--", "tool"], {
			git: { worktrees: [mainWorktree, slotWorktree("slot-01", "feature/a")] },
			command: {
				resultsByCwd: {
					"/repo": {
						type: "spawn-failed",
						stdout: "",
						stderr: "not found",
						error: "not found",
					},
				},
			},
		});
		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toContain(
			"Finished main worktree (master) [1/2]: failed (spawn failed).",
		);
		expect(run.stderr.join("")).toContain("Running in slot-01 (feature/a) [2/2]…");
		expect(run.stderr.join("")).toContain("Finished main worktree (master) [1/2]: failed");
	});

	it("captures a flag-bearing command after --", async () => {
		const run = runScenario(["foreach", "--yes", "--format", "json", "--", "git", "clean", "-fd"], {
			git: { worktrees: [mainWorktree, slotWorktree("slot-01")] },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: { command: ["git", "clean", "-fd"] },
		});
	});
});
