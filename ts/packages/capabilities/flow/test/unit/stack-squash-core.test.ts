import { describe, expect, test } from "vitest";
import type { ExecResult } from "@nseng-ai/foundation/command";

import { runStackSquashFlow } from "../../src/stack-squash/stack-squash.ts";

const TEST_CWD = "/work";
const STACK_BRANCHES_ARGS = [
	"slot",
	"gt",
	"exec",
	"stack-branches",
	"--downstack",
	"--format",
	"json",
];

interface ExecCall {
	command: string;
	args: string[];
	cwd?: string;
}

function scriptedExec(results: readonly Partial<ExecResult>[]) {
	const calls: ExecCall[] = [];
	const remaining = [...results];
	return {
		calls,
		exec: async (command: string, args: string[], options?: { cwd?: string }) => {
			calls.push(
				options?.cwd === undefined ? { command, args } : { command, args, cwd: options.cwd },
			);
			const result = remaining.shift();
			if (result === undefined) throw new Error(`unexpected exec: ${command} ${args.join(" ")}`);
			return {
				code: result.code ?? 0,
				stdout: result.stdout ?? "",
				stderr: result.stderr ?? "",
				killed: result.killed ?? false,
			};
		},
	};
}

function stackBranches(branches: readonly string[]): Partial<ExecResult> {
	return { stdout: JSON.stringify({ status: "ok", exitCode: 0, data: { branches } }) };
}

describe("stack squash core", () => {
	test("squashes branches tip-first and restores the tip", async () => {
		const commands = scriptedExec([
			{},
			stackBranches(["feature/bottom", "feature/middle", "feature/top"]),
			{},
			{},
			{},
			{},
			{},
			{},
			{},
		]);
		const progress: string[] = [];

		const outcome = await runStackSquashFlow(commands, {
			cwd: TEST_CWD,
			onProgress: (message) => progress.push(message),
		});

		expect(outcome).toEqual({
			kind: "success",
			processed: [
				{ branch: "feature/top", state: "squashed" },
				{ branch: "feature/middle", state: "squashed" },
				{ branch: "feature/bottom", state: "squashed" },
			],
		});
		expect(commands.calls).toEqual([
			{ command: "git", args: ["status", "--porcelain=v1"], cwd: TEST_CWD },
			{ command: "ns", args: STACK_BRANCHES_ARGS, cwd: TEST_CWD },
			{ command: "gt", args: ["checkout", "feature/top", "--no-interactive"], cwd: TEST_CWD },
			{ command: "gt", args: ["squash", "--no-edit", "--no-interactive"], cwd: TEST_CWD },
			{ command: "gt", args: ["checkout", "feature/middle", "--no-interactive"], cwd: TEST_CWD },
			{ command: "gt", args: ["squash", "--no-edit", "--no-interactive"], cwd: TEST_CWD },
			{ command: "gt", args: ["checkout", "feature/bottom", "--no-interactive"], cwd: TEST_CWD },
			{ command: "gt", args: ["squash", "--no-edit", "--no-interactive"], cwd: TEST_CWD },
			{ command: "gt", args: ["checkout", "feature/top", "--no-interactive"], cwd: TEST_CWD },
		]);
		expect(progress).toEqual([
			"Preparing to squash 3 Graphite stack branches from feature/top.",
			"Squashing feature/top.",
			"Squashing feature/middle.",
			"Squashing feature/bottom.",
		]);
	});

	test("refuses a dirty worktree before stack discovery", async () => {
		const commands = scriptedExec([{ stdout: " M file.ts\n" }]);

		expect(await runStackSquashFlow(commands, { cwd: TEST_CWD })).toEqual({
			kind: "worktree-dirty",
			status: "M file.ts",
			cwd: TEST_CWD,
		});
		expect(commands.calls).toHaveLength(1);
	});

	test("returns a stack discovery failure from the envelope", async () => {
		const commands = scriptedExec([
			{},
			{ stdout: JSON.stringify({ status: "failure", message: "forked stack" }) },
		]);

		const outcome = await runStackSquashFlow(commands, { cwd: TEST_CWD });

		expect(outcome).toMatchObject({ kind: "stack-discovery-failed", message: "forked stack" });
		expect(commands.calls).toHaveLength(2);
	});

	test("treats an already-one-commit squash as success", async () => {
		const commands = scriptedExec([
			{},
			stackBranches(["feature/top"]),
			{},
			{ code: 1, stderr: "ERROR: Only one commit in branch, nothing to squash.\n" },
			{},
		]);

		expect(await runStackSquashFlow(commands, { cwd: TEST_CWD })).toEqual({
			kind: "success",
			processed: [{ branch: "feature/top", state: "already_one_commit" }],
		});
		expect(commands.calls.at(-1)).toEqual({
			command: "gt",
			args: ["checkout", "feature/top", "--no-interactive"],
			cwd: TEST_CWD,
		});
	});

	test("stops on the first squash failure", async () => {
		const commands = scriptedExec([
			{},
			stackBranches(["feature/bottom", "feature/top"]),
			{},
			{ code: 1, stderr: "cannot squash branch\n" },
		]);

		const outcome = await runStackSquashFlow(commands, { cwd: TEST_CWD });

		expect(outcome).toMatchObject({
			kind: "squash-failed",
			branch: "feature/top",
			execResult: { code: 1, stderr: "cannot squash branch\n" },
		});
		expect(commands.calls.at(-1)?.args).toEqual(["squash", "--no-edit", "--no-interactive"]);
	});
});
