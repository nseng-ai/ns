import { stripAnsi } from "@nseng-ai/clinkr/testing";
import { describe, expect, test } from "vitest";

import { runFlowSquashStackCommandWithFakes } from "./flow-command-fakes.ts";
import { formattedExecCalls, type ScriptedExecResponse } from "./ns-cli-fakes.ts";

const STACK_DISCOVERY = "ns slot gt exec stack-branches --downstack --format json";

function stackBranches(branches: readonly string[]): string {
	return JSON.stringify({ status: "ok", exitCode: 0, data: { branches } });
}

describe("flow squash-stack command outcomes", () => {
	test("squashes tip-first, restores the tip, and emits the shared summary", async () => {
		const run = runFlowSquashStackCommandWithFakes();

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toBe("");
		expect(stripAnsi(run.stdout.join("")).trimEnd()).toBe(
			"Processed 2 Graphite stack branches; each now has one commit.\n\n- feature/top (squashed)\n- feature/bottom (squashed)",
		);
		expect(formattedExecCalls(run.context)).toEqual([
			"git status --porcelain=v1",
			STACK_DISCOVERY,
			"gt checkout feature/top --no-interactive",
			"gt squash --no-edit --no-interactive",
			"gt checkout feature/bottom --no-interactive",
			"gt squash --no-edit --no-interactive",
			"gt checkout feature/top --no-interactive",
		]);
	});

	test("dirty worktree exits 1 with a refusal block", async () => {
		const exec: ScriptedExecResponse[] = [
			{ match: "git status --porcelain=v1", result: { stdout: " M src/app.ts\n" } },
		];
		const run = runFlowSquashStackCommandWithFakes({ state: { exec } });

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		const stderr = stripAnsi(run.stderr.join(""));
		expect(stderr).toContain("Worktree has uncommitted changes; stack squash did not run.");
		expect(stderr).toContain("stdout:\nM src/app.ts");
		expect(stderr).toContain("Command: git status --porcelain=v1");
		expect(stderr).toContain("Cwd: /work");
	});

	test("stack discovery failure exits 1 with command, cwd, and transcript", async () => {
		const exec: ScriptedExecResponse[] = [
			{ match: "git status --porcelain=v1", result: {} },
			{ match: STACK_DISCOVERY, result: { code: 2, stderr: "forked stack\n" } },
		];
		const run = runFlowSquashStackCommandWithFakes({ state: { exec } });

		expect(await run.exit).toBe(1);
		const stderr = stripAnsi(run.stderr.join(""));
		expect(stderr).toContain("Could not read Graphite stack branches; not starting stack squash.");
		expect(stderr).toContain(`Command: ${STACK_DISCOVERY}`);
		expect(stderr).toContain("Cwd: /work");
		expect(stderr).toContain("forked stack");
	});

	test("successful discovery command with a failure envelope omits command transcript", async () => {
		const exec: ScriptedExecResponse[] = [
			{ match: "git status --porcelain=v1", result: {} },
			{
				match: STACK_DISCOVERY,
				result: { stdout: JSON.stringify({ status: "failure", message: "stack unavailable" }) },
			},
		];
		const run = runFlowSquashStackCommandWithFakes({ state: { exec } });

		expect(await run.exit).toBe(1);
		const stderr = stripAnsi(run.stderr.join(""));
		expect(stderr).toContain("stack unavailable");
		expect(stderr).not.toContain(`Command: ${STACK_DISCOVERY}`);
		expect(stderr).not.toContain('"status":"failure"');
	});

	test("mid-stack squash failure stops immediately with failed command details", async () => {
		const exec: ScriptedExecResponse[] = [
			{ match: "git status --porcelain=v1", result: {} },
			{
				match: STACK_DISCOVERY,
				result: { stdout: stackBranches(["feature/bottom", "feature/top"]) },
			},
			{ match: "gt checkout feature/top --no-interactive", result: {} },
			{ match: "gt squash --no-edit --no-interactive", result: {} },
			{ match: "gt checkout feature/bottom --no-interactive", result: {} },
			{
				match: "gt squash --no-edit --no-interactive",
				result: { code: 1, stderr: "cannot squash bottom\n" },
			},
		];
		const run = runFlowSquashStackCommandWithFakes({ state: { exec } });

		expect(await run.exit).toBe(1);
		const stderr = stripAnsi(run.stderr.join(""));
		expect(stderr).toContain(
			"Could not squash Graphite branch `feature/bottom`; stack squash stopped.",
		);
		expect(stderr).toContain("Command: gt squash --no-edit --no-interactive");
		expect(stderr).toContain("Cwd: /work");
		expect(stderr).toContain("cannot squash bottom");
		expect(formattedExecCalls(run.context).at(-1)).toBe("gt squash --no-edit --no-interactive");
	});
});
