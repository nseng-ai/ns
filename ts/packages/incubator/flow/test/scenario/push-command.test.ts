import { describe, expect, test } from "vitest";
import { stripAnsi } from "@nseng-ai/clinkr/testing";

import { runFlowPushCommandWithFakes } from "./flow-command-fakes.ts";
import { formattedExecCalls, type ScriptedExecResponse } from "./ns-cli-fakes.ts";

const PUSH_TIMEOUT_MS = 120_000;

// Each outcome asserts the rendered house-style block: which headline, the exit code, and the
// stdout(success) / stderr(failure) routing that `ok`/`failed` drive. The block styling itself is
// covered by the git-result-block unit test; here we prove the command wires the right kind/exit.

describe("flow push command outcomes", () => {
	test("clean worktree + successful push exits 0 on stdout with a success block", async () => {
		const run = runFlowPushCommandWithFakes();

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toBe("");
		const stdout = stripAnsi(run.stdout.join(""));
		expect(stdout).toContain("`git push` completed successfully.");
		expect(stdout).toContain("Command: git push");
		expect(stdout).toContain("For Graphite-tracked PR branches, prefer `ns flow submit`");
		expect(stdout).not.toContain("Everything up-to-date");
		expect(stdout).not.toContain("stdout:");
		expect(formattedExecCalls(run.context)).toEqual(["git status --porcelain", "git push"]);
		expect(run.context.execCalls[1]?.options).toEqual({ timeoutMs: PUSH_TIMEOUT_MS });
		expect(run.context.textGeneratorCalls).toEqual([]);
	});

	test("dirty worktree refuses with exit 1 on stderr and does not push", async () => {
		const exec: ScriptedExecResponse[] = [
			{ match: "git status --porcelain", result: { stdout: " M src/app.ts\n?? notes.md\n" } },
		];
		const run = runFlowPushCommandWithFakes({ state: { exec } });

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		const stderr = stripAnsi(run.stderr.join(""));
		expect(stderr).toContain("requires a clean worktree");
		expect(stderr).toContain("did not run `git push`");
		expect(stderr).toContain(" M src/app.ts");
		expect(stderr).toContain("?? notes.md");
		expect(stderr).toContain("ns flow submit");
		expect(stderr).toContain("/ns:flow:submit");
		expect(formattedExecCalls(run.context)).toEqual(["git status --porcelain"]);
		expect(run.context.textGeneratorCalls).toEqual([]);
	});

	test("status failure exits 1 on stderr and does not push", async () => {
		const exec: ScriptedExecResponse[] = [
			{
				match: "git status --porcelain",
				result: { code: 128, stderr: "fatal: not a git repository\n" },
			},
		];
		const run = runFlowPushCommandWithFakes({ state: { exec } });

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		const stderr = stripAnsi(run.stderr.join(""));
		expect(stderr).toContain("Could not inspect the worktree status");
		expect(stderr).toContain("Command: git status --porcelain");
		expect(stderr).toContain("Termination: exit code 128");
		expect(stderr).toContain("fatal: not a git repository");
		expect(formattedExecCalls(run.context)).toEqual(["git status --porcelain"]);
		expect(run.context.textGeneratorCalls).toEqual([]);
	});

	test("push failure exits 1 on stderr and surfaces stdout stderr evidence", async () => {
		const exec: ScriptedExecResponse[] = [
			{ match: "git status --porcelain", result: { stdout: "" } },
			{
				match: "git push",
				result: {
					code: 1,
					stdout: "rejected update\n",
					stderr: "non-fast-forward\n",
				},
			},
		];
		const run = runFlowPushCommandWithFakes({ state: { exec } });

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		const stderr = stripAnsi(run.stderr.join(""));
		expect(stderr).toContain("`git push` failed");
		expect(stderr).toContain("Command: git push");
		expect(stderr).toContain("Termination: exit code 1");
		expect(stderr).toContain("rejected update");
		expect(stderr).toContain("non-fast-forward");
		expect(stderr).toContain("ns flow submit");
		expect(stderr).toContain("/ns:flow:submit");
		expect(stderr).toContain("Graphite-tracked PR branches");
		expect(formattedExecCalls(run.context)).toEqual(["git status --porcelain", "git push"]);
		expect(run.context.execCalls[1]?.options).toEqual({ timeoutMs: PUSH_TIMEOUT_MS });
		expect(run.context.textGeneratorCalls).toEqual([]);
	});

	test("timed-out git push is a failure even with exit code zero", async () => {
		const exec: ScriptedExecResponse[] = [
			{ match: "git status --porcelain", result: { stdout: "" } },
			{
				match: "git push",
				result: {
					type: "timed-out",
					code: 0,
					signal: null,
					stdout: "",
					stderr: "timed out\n",
				},
			},
		];
		const run = runFlowPushCommandWithFakes({ state: { exec } });

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		const stderr = stripAnsi(run.stderr.join(""));
		expect(stderr).toContain("`git push` failed");
		expect(stderr).toContain("Termination: timed out");
		expect(stderr).toContain("timed out");
		expect(formattedExecCalls(run.context)).toEqual(["git status --porcelain", "git push"]);
		expect(run.context.execCalls[1]?.options).toEqual({ timeoutMs: PUSH_TIMEOUT_MS });
		expect(run.context.textGeneratorCalls).toEqual([]);
	});
});
