import { describe, expect, test } from "vitest";
import { stripAnsi } from "@sdl/clinkr/testing";

import {
	branchLatestCommitChildBranchRefusalExec,
	branchLatestCommitGtCreateFailExec,
	runFlowBranchLatestCommitCommandWithFakes,
} from "./flow-command-fakes.ts";
import { formattedExecCalls, type ScriptedExecResponse } from "./sdl-cli-fakes.ts";

describe("flow branch-latest-commit command outcomes", () => {
	test("clean worktree success exits 0 on stdout with a house-style result block", async () => {
		const run = runFlowBranchLatestCommitCommandWithFakes();

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toBe("");
		const stdout = stripAnsi(run.stdout.join(""));
		expect(stdout).toContain("Moved the latest commit to a new Graphite branch.");
		expect(stdout).toContain("New branch: demo-branch");
		expect(stdout).toContain("Moved commit: abc123 Add demo feature");
		expect(stdout).toContain("Source branch feature reset to parent4");
		expect(stdout).toContain("Working directory is clean.");
		expect(stdout).toContain("Cwd: /work");
		// Success stays concise: no subprocess transcript plumbing.
		expect(stdout).not.toContain("Exit:");
		expect(stdout).not.toContain("Killed:");
		expect(stdout).not.toContain("stdout:");
		const calls = formattedExecCalls(run.context);
		expect(calls).toContain("gt create demo-branch --no-interactive --no-ai");
	});

	test("dirty worktree refuses with a warn block on stderr and does not run the flow", async () => {
		const exec: ScriptedExecResponse[] = [
			{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
			{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature\n" } },
			{ match: "git status --porcelain=v1", result: { stdout: " M src/app.ts\n?? notes.md\n" } },
			{ match: "git diff HEAD --no-ext-diff", result: { stdout: "diff --git a/x b/x\n" } },
		];
		const run = runFlowBranchLatestCommitCommandWithFakes({ state: { exec } });

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		const stderr = stripAnsi(run.stderr.join(""));
		expect(stderr).toContain("`sdl flow branch-latest-commit` requires a clean worktree");
		expect(stderr).toContain("Use `sdl flow autobranch`");
		// The dirty porcelain status is the actionable detail, surfaced under the stdout label.
		expect(stderr).toContain("M src/app.ts");
		expect(stderr).toContain("Cwd: /work");
		// The latest-commit flow never started.
		const calls = formattedExecCalls(run.context);
		expect(calls).not.toContain("gt children --no-interactive");
		expect(calls.some((call) => call.startsWith("gt create"))).toBe(false);
	});

	test("eligibility guardrail declines with a warn refusal, not a red failure", async () => {
		const run = runFlowBranchLatestCommitCommandWithFakes({
			state: { exec: branchLatestCommitChildBranchRefusalExec() },
		});

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		const ERROR_TRUECOLOR = "\x1b[38;2;248;81;73m";
		const rawStderr = run.stderr.join("");
		const stderr = stripAnsi(rawStderr);
		// A declined guardrail renders warn — its headline must not carry the red error swatch.
		const headline = rawStderr.split("\n")[0] ?? "";
		expect(headline).not.toContain(ERROR_TRUECOLOR);
		expect(stderr).toContain("Did not move the latest commit to a new Graphite branch.");
		expect(stderr).toContain(
			"Refusing to move latest commit because the source branch has Graphite child branches.",
		);
		expect(stderr).toContain("- child-a");
		// The flow declined before mutating refs.
		const calls = formattedExecCalls(run.context);
		expect(calls.some((call) => call.startsWith("gt create"))).toBe(false);
		expect(calls).not.toContain("git rev-list --parents -n 1 HEAD");
	});

	test("snapshot load failure exits 1 on stderr with a failure block", async () => {
		const exec: ScriptedExecResponse[] = [
			{
				match: "git rev-parse --show-toplevel",
				result: { code: 128, stderr: "fatal: not a git repository\n" },
			},
		];
		const run = runFlowBranchLatestCommitCommandWithFakes({ state: { exec } });

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		const stderr = stripAnsi(run.stderr.join(""));
		expect(stderr).toContain("Not inside a git repository.");
		expect(stderr).toContain("Command: git rev-parse --show-toplevel");
		// The git failure transcript promotes the salient cause line.
		expect(stderr).toContain("fatal: not a git repository");
	});

	test("Graphite create failure exits 1 on stderr and surfaces recovery guidance", async () => {
		const run = runFlowBranchLatestCommitCommandWithFakes({
			state: { exec: branchLatestCommitGtCreateFailExec() },
		});

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		const stderr = stripAnsi(run.stderr.join(""));
		expect(stderr).toContain("Could not move the latest commit to a new Graphite branch.");
		expect(stderr).toContain("Failed to create Graphite branch after resetting source branch.");
		expect(stderr).toContain("Recovery branch: autobranch-backup/feature/");
		expect(stderr).toContain("Restored source branch to the original HEAD.");
		expect(stderr).toContain("Deleted incomplete branch demo-branch.");
		expect(stderr).toContain("Cwd: /work");
	});
});
