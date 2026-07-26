import { describe, expect, test } from "vitest";
import { stripAnsi } from "@nseng-ai/clinkr/testing";

import { runFlowPullTrunkCommandWithFakes } from "./flow-command-fakes.ts";
import { formattedExecCalls, type ScriptedExecResponse } from "./ns-cli-fakes.ts";

function upstreamLookup(branch: string): string {
	return `git for-each-ref --format=%(refname)%00%(upstream:remotename)%00%(upstream:remoteref) refs/heads/${branch}`;
}

function upstreamRecord(input: {
	branch: string;
	remoteName?: string;
	remoteRef?: string;
}): string {
	return `refs/heads/${input.branch}\0${input.remoteName ?? ""}\0${input.remoteRef ?? ""}\n`;
}

describe("flow pull-trunk command outcomes", () => {
	test("successful fetch exits 0 on stdout with a house-style result block", async () => {
		const run = runFlowPullTrunkCommandWithFakes();

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toBe("");
		const stdout = stripAnsi(run.stdout.join(""));
		expect(stdout).toContain("Pulled local Graphite trunk branch `main` only.");
		expect(stdout).toContain("No full `gt sync` was run.");
		expect(stdout).toContain("Command: git fetch company refs/heads/stable:refs/heads/main");
		expect(stdout).toContain("Cwd: /work");
		expect(stdout).not.toContain("Exit: 0");
		expect(stdout).not.toContain("Killed:");
		expect(stdout).not.toContain("stdout:");
		expect(stdout).not.toContain("stderr:");
		expect(formattedExecCalls(run.context)).toEqual([
			"gt trunk --no-interactive",
			upstreamLookup("main"),
			"git worktree list --porcelain",
			"git fetch company refs/heads/stable:refs/heads/main",
		]);
	});

	test("successful pull uses the exact configured upstream in the trunk worktree", async () => {
		const exec: ScriptedExecResponse[] = [
			{ match: "gt trunk --no-interactive", result: { stdout: "release\n" } },
			{
				match: upstreamLookup("release"),
				result: {
					stdout: upstreamRecord({
						branch: "release",
						remoteName: "company",
						remoteRef: "refs/heads/stable",
					}),
				},
			},
			{
				match: "git worktree list --porcelain",
				result: {
					stdout: "worktree /work\nHEAD abc123\nbranch refs/heads/release\n",
				},
			},
			{ match: "git pull --ff-only company refs/heads/stable", result: { stdout: "updated\n" } },
		];
		const run = runFlowPullTrunkCommandWithFakes({ state: { exec } });

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toBe("");
		const stdout = stripAnsi(run.stdout.join(""));
		expect(stdout).toContain("Command: git pull --ff-only company refs/heads/stable");
		expect(stdout).toContain("Cwd: /work");
		expect(formattedExecCalls(run.context)).toEqual([
			"gt trunk --no-interactive",
			upstreamLookup("release"),
			"git worktree list --porcelain",
			"git pull --ff-only company refs/heads/stable",
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

	test("missing configured upstream stops before worktree inspection", async () => {
		const exec: ScriptedExecResponse[] = [
			{ match: "gt trunk --no-interactive", result: { stdout: "main\n" } },
			{
				match: upstreamLookup("main"),
				result: { stdout: upstreamRecord({ branch: "main" }) },
			},
		];
		const run = runFlowPullTrunkCommandWithFakes({ state: { exec } });

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		const stderr = stripAnsi(run.stderr.join(""));
		expect(stderr).toContain("Graphite trunk `main` has no configured Git upstream");
		expect(stderr).toContain("git branch --set-upstream-to=<remote>/<remote-branch> main");
		expect(formattedExecCalls(run.context)).toEqual([
			"gt trunk --no-interactive",
			upstreamLookup("main"),
		]);
	});

	test("upstream inspection failure stops before worktree inspection", async () => {
		const exec: ScriptedExecResponse[] = [
			{ match: "gt trunk --no-interactive", result: { stdout: "main\n" } },
			{
				match: upstreamLookup("main"),
				result: { code: 128, stderr: "fatal: cannot inspect refs\n" },
			},
		];
		const run = runFlowPullTrunkCommandWithFakes({ state: { exec } });

		expect(await run.exit).toBe(1);
		const stderr = stripAnsi(run.stderr.join(""));
		expect(stderr).toContain("Could not inspect the configured Git upstream");
		expect(stderr).toContain("fatal: cannot inspect refs");
		expect(formattedExecCalls(run.context)).toEqual([
			"gt trunk --no-interactive",
			upstreamLookup("main"),
		]);
	});

	test("worktree-list failure exits 1 on stderr with the failed command", async () => {
		const exec: ScriptedExecResponse[] = [
			{ match: "gt trunk --no-interactive", result: { stdout: "main\n" } },
			{
				match: upstreamLookup("main"),
				result: {
					stdout: upstreamRecord({
						branch: "main",
						remoteName: "company",
						remoteRef: "refs/heads/stable",
					}),
				},
			},
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
				match: upstreamLookup("main"),
				result: {
					stdout: upstreamRecord({
						branch: "main",
						remoteName: "company",
						remoteRef: "refs/heads/stable",
					}),
				},
			},
			{
				match: "git worktree list --porcelain",
				result: { stdout: "worktree /work\nHEAD abc123\nbranch refs/heads/feature\n" },
			},
			{
				match: "git fetch company refs/heads/stable:refs/heads/main",
				result: { code: 1, stderr: "not fast-forward\n" },
			},
		];
		const run = runFlowPullTrunkCommandWithFakes({ state: { exec } });

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		const stderr = stripAnsi(run.stderr.join(""));
		expect(stderr).toContain("Could not update local trunk branch `main`.");
		expect(stderr).toContain("Command: git fetch company refs/heads/stable:refs/heads/main");
		expect(stderr).toContain("Cwd: /work");
		expect(stderr).toContain("not fast-forward");
	});
});
