import { describe, expect, test } from "vitest";
import type { ExecResult } from "@nseng-ai/foundation/command";

import {
	formatStackSquashSummary,
	runStackSquashFlow,
} from "../../src/stack-squash/stack-squash.ts";

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

interface ScriptedResult {
	code?: number;
	stdout?: string;
	stderr?: string;
}

function scriptedExec(results: readonly ScriptedResult[]) {
	const calls: ExecCall[] = [];
	const remaining = [...results];
	return {
		calls,
		exec: async (
			command: string,
			args: string[],
			options?: { cwd?: string },
		): Promise<ExecResult> => {
			calls.push(
				options?.cwd === undefined ? { command, args } : { command, args, cwd: options.cwd },
			);
			const result = remaining.shift();
			if (result === undefined) throw new Error(`unexpected exec: ${command} ${args.join(" ")}`);
			return {
				type: "exited",
				code: result.code ?? 0,
				stdout: result.stdout ?? "",
				stderr: result.stderr ?? "",
				signal: null,
			};
		},
	};
}

function stackBranches(branches: readonly string[]): ScriptedResult {
	return { stdout: JSON.stringify({ status: "ok", exitCode: 0, data: { branches } }) };
}

describe("stack squash core", () => {
	test("squashes branches tip-first and restores the tip", async () => {
		const commands = scriptedExec([
			{},
			stackBranches(["feature/bottom", "feature/middle", "feature/top"]),
			{ stdout: "main\n" },
			{ stdout: "2\n" },
			{ stdout: "3\n" },
			{ stdout: "4\n" },
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
				{ branch: "feature/top", commitsBefore: 4, state: "squashed" },
				{ branch: "feature/middle", commitsBefore: 3, state: "squashed" },
				{ branch: "feature/bottom", commitsBefore: 2, state: "squashed" },
			],
		});
		expect(commands.calls).toEqual([
			{ command: "git", args: ["status", "--porcelain=v1"], cwd: TEST_CWD },
			{ command: "ns", args: STACK_BRANCHES_ARGS, cwd: TEST_CWD },
			{ command: "gt", args: ["trunk", "--no-interactive"], cwd: TEST_CWD },
			{ command: "git", args: ["rev-list", "--count", "main..feature/bottom"], cwd: TEST_CWD },
			{
				command: "git",
				args: ["rev-list", "--count", "feature/bottom..feature/middle"],
				cwd: TEST_CWD,
			},
			{
				command: "git",
				args: ["rev-list", "--count", "feature/middle..feature/top"],
				cwd: TEST_CWD,
			},
			{ command: "gt", args: ["checkout", "feature/top", "--no-interactive"], cwd: TEST_CWD },
			{ command: "gt", args: ["squash", "--no-edit", "--no-interactive"], cwd: TEST_CWD },
			{ command: "gt", args: ["checkout", "feature/middle", "--no-interactive"], cwd: TEST_CWD },
			{ command: "gt", args: ["squash", "--no-edit", "--no-interactive"], cwd: TEST_CWD },
			{ command: "gt", args: ["checkout", "feature/bottom", "--no-interactive"], cwd: TEST_CWD },
			{ command: "gt", args: ["squash", "--no-edit", "--no-interactive"], cwd: TEST_CWD },
			{ command: "gt", args: ["checkout", "feature/top", "--no-interactive"], cwd: TEST_CWD },
		]);
		expect(progress).toEqual([
			"Preparing to squash 3 Graphite stack branches containing 9 commits from feature/top.",
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
			{ stdout: "main\n" },
			{ stdout: "1\n" },
			{},
		]);

		expect(await runStackSquashFlow(commands, { cwd: TEST_CWD })).toEqual({
			kind: "success",
			processed: [{ branch: "feature/top", commitsBefore: 1, state: "already_one_commit" }],
		});
		expect(commands.calls.at(-1)).toEqual({
			command: "gt",
			args: ["checkout", "feature/top", "--no-interactive"],
			cwd: TEST_CWD,
		});
	});

	test("skips a zero-commit branch and still restores the tip", async () => {
		const commands = scriptedExec([
			{},
			stackBranches(["feature/top"]),
			{ stdout: "main\n" },
			{ stdout: "0\n" },
			{},
		]);
		const completed: string[] = [];

		const outcome = await runStackSquashFlow(commands, {
			cwd: TEST_CWD,
			onBranchCompleted: (entry) => completed.push(`${entry.branch}:${entry.state}`),
		});

		expect(outcome).toEqual({
			kind: "success",
			processed: [{ branch: "feature/top", commitsBefore: 0, state: "no_commits" }],
		});
		expect(completed).toEqual(["feature/top:no_commits"]);
		expect(commands.calls).toEqual([
			{ command: "git", args: ["status", "--porcelain=v1"], cwd: TEST_CWD },
			{ command: "ns", args: STACK_BRANCHES_ARGS, cwd: TEST_CWD },
			{ command: "gt", args: ["trunk", "--no-interactive"], cwd: TEST_CWD },
			{ command: "git", args: ["rev-list", "--count", "main..feature/top"], cwd: TEST_CWD },
			{ command: "gt", args: ["checkout", "feature/top", "--no-interactive"], cwd: TEST_CWD },
		]);
	});

	test("still rejects an empty commit count", async () => {
		const commands = scriptedExec([
			{},
			stackBranches(["feature/top"]),
			{ stdout: "main\n" },
			{ stdout: "\n" },
		]);

		expect(await runStackSquashFlow(commands, { cwd: TEST_CWD })).toMatchObject({
			kind: "commit-count-failed",
			branch: "feature/top",
			parent: "main",
		});
	});

	test("summarizes mixed zero, one, and squashed branch outcomes", () => {
		expect(
			formatStackSquashSummary([
				{ branch: "feature/empty", commitsBefore: 0, state: "no_commits" },
				{ branch: "feature/one", commitsBefore: 1, state: "already_one_commit" },
				{ branch: "feature/two", commitsBefore: 2, state: "squashed" },
			]),
		).toBe(
			"Processed 3 Graphite stack branches; 3 commits became 2 (1 removed).\n\n- feature/empty: 0 commits (no squash needed)\n- feature/one: 1 commit (no squash needed)\n- feature/two: 2 → 1 commit",
		);
	});

	test("stops on the first squash failure", async () => {
		const commands = scriptedExec([
			{},
			stackBranches(["feature/bottom", "feature/top"]),
			{ stdout: "main\n" },
			{ stdout: "2\n" },
			{ stdout: "3\n" },
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
