import { describe, expect, test } from "vitest";
import { stripAnsi } from "@sdl/clinkr/testing";

import { runFlowPullTrunkCommandWithFakes } from "./flow-command-fakes.ts";
import { formattedExecCalls, type ScriptedExecResponse } from "./sdl-cli-fakes.ts";

describe("flow pull-trunk command outcomes", () => {
	test("successful fetch exits 0 on stdout with a house-style result block", async () => {
		const run = runFlowPullTrunkCommandWithFakes();

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toBe("");
		const stdout = stripAnsi(run.stdout.join(""));
		expect(stdout).toContain("Pulled local Graphite trunk branch `main` only.");
		expect(stdout).toContain("No full `gt sync` was run.");
		expect(stdout).toContain("Command: git fetch origin refs/heads/main:refs/heads/main");
		expect(stdout).toContain("Cwd: /work");
		expect(stdout).not.toContain("Exit: 0");
		expect(stdout).not.toContain("Killed:");
		expect(stdout).not.toContain("stdout:");
		expect(stdout).not.toContain("stderr:");
		expect(formattedExecCalls(run.context)).toEqual([
			"gt trunk --no-interactive",
			"git worktree list --porcelain",
			"git fetch origin refs/heads/main:refs/heads/main",
		]);
	});

	test("Graphite trunk failure exits 1 on stderr and surfaces stderr", async () => {
		const exec: ScriptedExecResponse[] = [
			{
				match: "gt trunk --no-interactive",
				result: { code: 1, stderr: "fatal: no configured trunk\n" },
			},
		];
		const run = runFlowPullTrunkCommandWithFakes({ state: { exec } });

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		const stderr = stripAnsi(run.stderr.join(""));
		expect(stderr).toContain("Could not resolve Graphite trunk. Local trunk was not updated.");
		expect(stderr).toContain("fatal: no configured trunk");
		expect(formattedExecCalls(run.context)).toEqual(["gt trunk --no-interactive"]);
	});

	test("worktree-list failure exits 1 on stderr with the failed command", async () => {
		const exec: ScriptedExecResponse[] = [
			{ match: "gt trunk --no-interactive", result: { stdout: "main\n" } },
			{
				match: "git worktree list --porcelain",
				result: { code: 1, stderr: "fatal: cannot read worktrees\n" },
			},
		];
		const run = runFlowPullTrunkCommandWithFakes({ state: { exec } });

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		const stderr = stripAnsi(run.stderr.join(""));
		expect(stderr).toContain("Could not inspect Git worktrees. Local trunk was not updated.");
		expect(stderr).toContain("Command: git worktree list --porcelain");
		expect(stderr).toContain("fatal: cannot read worktrees");
	});

	test("update failure exits 1 on stderr with command, cwd, and promoted cause", async () => {
		const exec: ScriptedExecResponse[] = [
			{ match: "gt trunk --no-interactive", result: { stdout: "main\n" } },
			{
				match: "git worktree list --porcelain",
				result: { stdout: "worktree /work\nHEAD abc123\nbranch refs/heads/feature\n" },
			},
			{
				match: "git fetch origin refs/heads/main:refs/heads/main",
				result: { code: 1, stderr: "not fast-forward\n" },
			},
		];
		const run = runFlowPullTrunkCommandWithFakes({ state: { exec } });

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		const stderr = stripAnsi(run.stderr.join(""));
		expect(stderr).toContain("Could not update local trunk branch `main`.");
		expect(stderr).toContain("Command: git fetch origin refs/heads/main:refs/heads/main");
		expect(stderr).toContain("Cwd: /work");
		expect(stderr).toContain("not fast-forward");
	});
});
