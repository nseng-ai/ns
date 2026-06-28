import { describe, expect, test } from "vitest";
import { stripAnsi } from "@sdl/clinkr/testing";

import { runFlowPushCommandWithFakes } from "./flow-command-fakes.ts";
import { formattedExecCalls, type ScriptedExecResponse } from "./sdl-cli-fakes.ts";

// Each outcome asserts the rendered house-style block: which headline, the exit code, and the
// stdout(success) / stderr(failure) routing that `ok`/`failed` drive. The block styling itself is
// covered by the git-result-block unit test; here we prove the command wires the right kind/exit.

describe("flow push command outcomes", () => {
	test("clean worktree + successful push exits 0 on stdout with a success block", async () => {
		const run = runFlowPushCommandWithFakes();

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toBe("");
		expect(stripAnsi(run.stdout.join(""))).toContain("`git push` completed successfully.");
		expect(formattedExecCalls(run.context)).toEqual(["git status --porcelain", "git push"]);
	});

	test("dirty worktree refuses with exit 1 on stderr and does not push", async () => {
		const exec: ScriptedExecResponse[] = [
			{ match: "git status --porcelain", result: { stdout: " M src/app.ts\n?? notes.md\n" } },
		];
		const run = runFlowPushCommandWithFakes({ state: { exec } });

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		const stderr = stripAnsi(run.stderr.join(""));
		expect(stderr).toContain("requires a clean worktree and did not run `git push`");
		expect(stderr).toContain(" M src/app.ts");
		expect(formattedExecCalls(run.context)).toEqual(["git status --porcelain"]);
	});

	test("status failure exits 1 on stderr and does not push", async () => {
		const exec: ScriptedExecResponse[] = [
			{
				match: "git status --porcelain",
				result: { code: 1, stderr: "fatal: not a git repository\n" },
			},
		];
		const run = runFlowPushCommandWithFakes({ state: { exec } });

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		const stderr = stripAnsi(run.stderr.join(""));
		expect(stderr).toContain("Could not inspect the worktree status.");
		expect(stderr).toContain("fatal: not a git repository");
		expect(formattedExecCalls(run.context)).toEqual(["git status --porcelain"]);
	});

	test("push failure exits 1 on stderr and surfaces cause lines", async () => {
		const exec: ScriptedExecResponse[] = [
			{ match: "git status --porcelain", result: { stdout: "" } },
			{
				match: "git push",
				result: {
					code: 1,
					stderr: " ! [rejected] main -> main (fetch first)\nerror: failed to push some refs\n",
				},
			},
		];
		const run = runFlowPushCommandWithFakes({ state: { exec } });

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		const stderr = stripAnsi(run.stderr.join(""));
		expect(stderr).toContain("`git push` failed.");
		expect(stderr).toContain("[rejected] main -> main");
		expect(stderr).toContain("error: failed to push some refs");
		expect(formattedExecCalls(run.context)).toEqual(["git status --porcelain", "git push"]);
	});
});
