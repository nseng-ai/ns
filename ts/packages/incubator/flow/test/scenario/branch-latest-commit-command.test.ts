import { describe, expect, test } from "vitest";
import { stripAnsi } from "@nseng-ai/clinkr/testing";

import {
	branchLatestCommitSynchronizedBackupCleanupWarningExec,
	branchLatestCommitBackupCreateFailExec,
	branchLatestCommitChildBranchRefusalExec,
	branchLatestCommitGtCreateFailExec,
	branchLatestCommitSuffixedExec,
	branchLatestCommitSynchronizedExec,
	runFlowBranchLatestCommitCommandWithFakes,
} from "./flow-command-fakes.ts";
import { formattedExecCalls, type ScriptedExecResponse } from "./ns-cli-fakes.ts";

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
		expect(stdout).toContain(`Cwd: ${run.context.cwd}`);
		// Success stays concise: no subprocess transcript plumbing.
		expect(stdout).not.toContain("Exit:");
		expect(stdout).not.toContain("Killed:");
		expect(stdout).not.toContain("stdout:");
		const calls = formattedExecCalls(run.context);
		expect(calls).toEqual(
			expect.arrayContaining([
				"gt children --no-interactive",
				expect.stringMatching(/^git branch autobranch-backup\/feature\/\d+ abc123$/),
				"git reset --hard parent456",
				"gt create demo-branch --no-interactive --no-ai",
				"git reset --hard abc123",
				expect.stringMatching(/^git branch -D autobranch-backup\/feature\/\d+$/),
			]),
		);
		expect(calls).not.toContain("gt trunk --no-interactive");
		expect(run.context.textGeneratorCalls).toEqual([]);
	});

	test("synchronized non-trunk success warns how to publish without remote mutation", async () => {
		const run = runFlowBranchLatestCommitCommandWithFakes({
			state: { exec: branchLatestCommitSynchronizedExec() },
		});

		expect(await run.exit).toBe(0);
		const stdout = stripAnsi(run.stdout.join(""));
		expect(stdout).toContain("Moved the latest commit to a new Graphite branch.");
		expect(stdout).toContain("New branch: demo-branch");
		expect(stdout).not.toContain("upstream origin/feature");
		expect(run.stderr.join("")).toContain(
			"Warning: upstream origin/feature is still unchanged at abc123 after the local source reset. Run `ns flow submit` from demo-branch to publish the reshaped stack.",
		);

		const calls = formattedExecCalls(run.context);
		expect(calls.filter((call) => call === "gt trunk --no-interactive")).toHaveLength(2);
		expect(
			calls.filter((call) => call === "git rev-list --left-right --count HEAD...origin/feature"),
		).toHaveLength(2);
		expect(calls).toEqual(
			expect.arrayContaining([
				"git reset --hard parent456",
				"gt create demo-branch --no-interactive --no-ai",
				"git reset --hard abc123",
			]),
		);
		expect(
			calls.some(
				(call) =>
					call.startsWith("git fetch") ||
					call.startsWith("git push") ||
					call.startsWith("gt submit") ||
					call.startsWith("ns flow submit"),
			),
		).toBe(false);
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
		expect(stderr).toContain("`ns flow branch-latest-commit` requires a clean worktree");
		expect(stderr).toContain("Use `ns flow autobranch`");
		// The dirty porcelain status is the actionable detail, surfaced under the stdout label.
		expect(stderr).toContain("M src/app.ts");
		expect(stderr).toContain(`Cwd: ${run.context.cwd}`);
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

	test("repository root failure stops slug policy resolution", async () => {
		const exec: ScriptedExecResponse[] = [
			{
				match: "git rev-parse --show-toplevel",
				result: { code: 128, stderr: "fatal: not a git repository\n" },
			},
		];
		const run = runFlowBranchLatestCommitCommandWithFakes({ state: { exec } });

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		expect(stripAnsi(run.stderr.join(""))).toContain(
			"Could not determine the repository root for ns.toml.",
		);
	});

	test("suffixes when the requested branch exists exactly", async () => {
		const run = runFlowBranchLatestCommitCommandWithFakes({
			state: { exec: branchLatestCommitSuffixedExec() },
		});

		expect(await run.exit).toBe(0);
		const stdout = stripAnsi(run.stdout.join(""));
		expect(stdout).toContain("New branch: demo-branch-2 (base slug demo-branch was unavailable)");
		expect(formattedExecCalls(run.context)).toContain(
			"gt create demo-branch-2 --no-interactive --no-ai",
		);
		expect(run.context.textGeneratorCalls).toEqual([]);
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
		expect(stderr).toContain(`Cwd: ${run.context.cwd}`);
	});

	test("recovery branch creation failure stops before source reset", async () => {
		const run = runFlowBranchLatestCommitCommandWithFakes({
			state: { exec: branchLatestCommitBackupCreateFailExec() },
		});

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		const stderr = stripAnsi(run.stderr.join(""));
		expect(stderr).toContain("Failed to create recovery branch before moving latest commit.");
		expect(stderr).toContain("fatal: cannot lock ref");
		const calls = formattedExecCalls(run.context);
		expect(calls).not.toContain("git reset --hard parent456");
		expect(calls).not.toContain("gt create demo-branch --no-interactive --no-ai");
	});

	test("synchronized publication and recovery cleanup warnings coexist on stderr", async () => {
		const run = runFlowBranchLatestCommitCommandWithFakes({
			state: { exec: branchLatestCommitSynchronizedBackupCleanupWarningExec() },
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("New branch: demo-branch");
		expect(run.stdout.join("")).not.toContain("recovery branch");
		expect(run.stderr.join("")).toContain("Warning: upstream origin/feature is still unchanged");
		expect(run.stderr.join("")).toContain("Run `ns flow submit` from demo-branch");
		expect(run.stderr.join("")).toContain("Warning: recovery branch autobranch-backup/feature/");
		expect(run.stderr.join("")).toContain("could not be deleted");
	});
});
