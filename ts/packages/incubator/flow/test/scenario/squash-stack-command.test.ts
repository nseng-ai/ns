import { fakeStackInfo } from "@nseng-ai/extension-kit/graphite/testing";
import { stripAnsi } from "@nseng-ai/clinkr/testing";
import { describe, expect, test } from "vitest";

import { runFlowSquashStackCommandWithFakes } from "./flow-command-fakes.ts";
import { formattedExecCalls, type ScriptedExecResponse } from "./ns-cli-fakes.ts";

describe("flow squash-stack command outcomes", () => {
	test("squashes tip-first, restores the tip, and emits the shared summary", async () => {
		const run = runFlowSquashStackCommandWithFakes();

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toBe("");
		expect(stripAnsi(run.stdout.join("")).trimEnd()).toBe(
			"Processed 2 Graphite stack branches; 5 commits became 2 (3 removed).\n\n- feature/top: 3 → 1 commit\n- feature/bottom: 2 → 1 commit",
		);
		const progress = stripAnsi(run.liveOutput.map((entry) => entry.text).join(""));
		expect(progress).toContain("Commits");
		expect(progress).toContain("Squash");
		expect(progress).toContain("feature/top");
		expect(progress).toContain("3→1");
		expect(progress).toContain("feature/bottom");
		expect(progress).toContain("2→1");
		expect(run.stackGateway.operations()).toEqual([{ type: "stack", cwd: "/work" }]);
		expect(formattedExecCalls(run.context)).toEqual([
			"git status --porcelain=v1",
			"git rev-list --count main..feature/bottom",
			"git rev-list --count feature/bottom..feature/top",
			"gt checkout feature/top --no-interactive",
			"gt squash --no-edit --no-interactive",
			"gt checkout feature/bottom --no-interactive",
			"gt squash --no-edit --no-interactive",
			"gt checkout feature/top --no-interactive",
		]);
	});

	test("treats a zero-commit branch as a successful skipped entry", async () => {
		const exec: ScriptedExecResponse[] = [
			{ match: "git status --porcelain=v1", result: {} },
			{ match: "git rev-list --count main..feature/empty", result: { stdout: "0\n" } },
			{ match: "gt checkout feature/empty --no-interactive", result: {} },
		];
		const run = runFlowSquashStackCommandWithFakes({
			state: { exec },
			graphiteStack: {
				stack: {
					type: "stack",
					stack: fakeStackInfo({
						trunk: "main",
						current: "feature/empty",
						ancestors: ["main"],
					}),
				},
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toBe("");
		expect(stripAnsi(run.stdout.join("")).trimEnd()).toBe(
			"Processed 1 Graphite stack branch; 0 commits became 0 (0 removed).\n\n- feature/empty: 0 commits (no squash needed)",
		);
		const progress = stripAnsi(run.liveOutput.map((entry) => entry.text).join(""));
		expect(progress).toContain("feature/empty");
		expect(progress).toContain("empty");
		expect(formattedExecCalls(run.context)).toEqual([
			"git status --porcelain=v1",
			"git rev-list --count main..feature/empty",
			"gt checkout feature/empty --no-interactive",
		]);
	});

	test("dirty worktree exits 1 with a refusal block before reading Graphite metadata", async () => {
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
		expect(run.stackGateway.operations()).toEqual([]);
	});

	test("treats the configured trunk as an empty stack", async () => {
		const exec: ScriptedExecResponse[] = [{ match: "git status --porcelain=v1", result: {} }];
		const run = runFlowSquashStackCommandWithFakes({
			state: { exec },
			graphiteStack: {
				stack: {
					type: "stack",
					stack: fakeStackInfo({ trunk: "main", current: "main", ancestors: [] }),
				},
			},
		});

		expect(await run.exit).toBe(1);
		expect(stripAnsi(run.stderr.join(""))).toContain("No Graphite stack branches to squash.");
		expect(formattedExecCalls(run.context)).toEqual(["git status --porcelain=v1"]);
	});

	test("renders a provider discovery failure without a fabricated command transcript", async () => {
		const exec: ScriptedExecResponse[] = [{ match: "git status --porcelain=v1", result: {} }];
		const run = runFlowSquashStackCommandWithFakes({
			state: { exec },
			graphiteStack: {
				stack: {
					type: "failure",
					failure: { message: "Graphite metadata is unavailable", returnCode: null },
				},
			},
		});

		expect(await run.exit).toBe(1);
		const stderr = stripAnsi(run.stderr.join(""));
		expect(stderr).toContain("Could not read Graphite stack metadata");
		expect(stderr).toContain("Graphite metadata is unavailable");
		expect(stderr).toContain("Cwd: /work");
		expect(stderr).not.toContain("Command:");
		expect(stderr).not.toContain("ns slot gt exec");
	});

	test("fails closed on inconsistent ancestor metadata before planning commits", async () => {
		const exec: ScriptedExecResponse[] = [{ match: "git status --porcelain=v1", result: {} }];
		const run = runFlowSquashStackCommandWithFakes({
			state: { exec },
			graphiteStack: {
				stack: {
					type: "stack",
					stack: fakeStackInfo({
						trunk: "main",
						current: "feature/top",
						ancestors: ["not-main", "feature/bottom"],
					}),
				},
			},
		});

		expect(await run.exit).toBe(1);
		const stderr = stripAnsi(run.stderr.join(""));
		expect(stderr).toContain("does not form a unique path from trunk `main`");
		expect(stderr).not.toContain("Command:");
		expect(formattedExecCalls(run.context)).toEqual(["git status --porcelain=v1"]);
	});

	test("mid-stack squash failure stops immediately with failed command details", async () => {
		const exec: ScriptedExecResponse[] = [
			{ match: "git status --porcelain=v1", result: {} },
			{ match: "git rev-list --count main..feature/bottom", result: { stdout: "2\n" } },
			{
				match: "git rev-list --count feature/bottom..feature/top",
				result: { stdout: "3\n" },
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
