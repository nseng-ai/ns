import { FakeGraphiteStackGateway, fakeStackInfo } from "@nseng-ai/extension-kit/graphite/testing";
import type { StackInfo } from "@nseng-ai/extension-kit/graphite/stack";
import type { ExecResult } from "@nseng-ai/foundation/command";
import { describe, expect, test } from "vitest";

import {
	formatStackSquashSummary,
	runStackSquashFlow,
} from "../../src/stack-squash/stack-squash.ts";

const TEST_CWD = "/work";

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

function trackedStack(overrides: Partial<StackInfo> = {}): FakeGraphiteStackGateway {
	return new FakeGraphiteStackGateway({
		stack: {
			type: "stack",
			stack: fakeStackInfo({
				trunk: "main",
				current: "feature/top",
				ancestors: ["main"],
				...overrides,
			}),
		},
	});
}

describe("stack squash core", () => {
	test("uses structured ancestors, squashes tip-first, and restores the tip", async () => {
		const commands = scriptedExec([
			{},
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
		const graphite = trackedStack({
			current: "feature/top",
			ancestors: ["main", "feature/bottom", "feature/middle"],
			descendants: ["feature/unrelated-child"],
			descendantWalk: {
				forks: [
					{
						branch: "feature/top",
						children: ["feature/unrelated-child", "feature/other-child"],
					},
				],
				childrenCorruptions: [],
				termination: { type: "cycle", branch: "feature/unrelated-child" },
			},
		});
		const progress: string[] = [];

		const outcome = await runStackSquashFlow(commands, graphite, {
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
		expect(graphite.operations()).toEqual([{ type: "stack", cwd: TEST_CWD }]);
		expect(commands.calls).toEqual([
			{ command: "git", args: ["status", "--porcelain=v1"], cwd: TEST_CWD },
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
			{
				command: "gt",
				args: ["checkout", "feature/middle", "--no-interactive"],
				cwd: TEST_CWD,
			},
			{ command: "gt", args: ["squash", "--no-edit", "--no-interactive"], cwd: TEST_CWD },
			{
				command: "gt",
				args: ["checkout", "feature/bottom", "--no-interactive"],
				cwd: TEST_CWD,
			},
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
		const graphite = trackedStack();

		expect(await runStackSquashFlow(commands, graphite, { cwd: TEST_CWD })).toEqual({
			kind: "worktree-dirty",
			status: "M file.ts",
			cwd: TEST_CWD,
		});
		expect(commands.calls).toHaveLength(1);
		expect(graphite.operations()).toEqual([]);
	});

	test("returns a structured provider discovery failure", async () => {
		const commands = scriptedExec([{}]);
		const graphite = new FakeGraphiteStackGateway({
			stack: {
				type: "failure",
				failure: { message: "metadata unavailable", returnCode: null },
			},
		});

		expect(await runStackSquashFlow(commands, graphite, { cwd: TEST_CWD })).toEqual({
			kind: "stack-discovery-failed",
			reason: "provider-failure",
			message:
				"Could not read Graphite stack metadata: metadata unavailable. Stack squash did not run.",
			cwd: TEST_CWD,
		});
		expect(commands.calls).toHaveLength(1);
	});

	test("fails safely when the current branch is untracked", async () => {
		const commands = scriptedExec([{}]);
		const graphite = new FakeGraphiteStackGateway({
			stack: { type: "untracked_branch", message: "feature/local is not tracked" },
		});

		expect(await runStackSquashFlow(commands, graphite, { cwd: TEST_CWD })).toMatchObject({
			kind: "stack-discovery-failed",
			reason: "untracked-branch",
			message: expect.stringContaining("gt track"),
		});
	});

	test("treats the current branch being trunk as an empty stack", async () => {
		const commands = scriptedExec([{}]);
		const graphite = trackedStack({ trunk: "main", current: "main", ancestors: [] });

		expect(await runStackSquashFlow(commands, graphite, { cwd: TEST_CWD })).toEqual({
			kind: "empty-stack",
			cwd: TEST_CWD,
		});
		expect(commands.calls).toHaveLength(1);
	});

	test.each([
		{
			termination: { type: "cycle", branch: "feature/bottom" } as const,
			reason: "ancestor-cycle",
		},
		{
			termination: { type: "row_missing", branch: "feature/missing" } as const,
			reason: "ancestor-row-missing",
		},
	])("fails safely when the ancestor walk ends with $reason", async ({ termination, reason }) => {
		const commands = scriptedExec([{}]);
		const graphite = trackedStack({ ancestorTermination: termination });

		expect(await runStackSquashFlow(commands, graphite, { cwd: TEST_CWD })).toMatchObject({
			kind: "stack-discovery-failed",
			reason,
		});
		expect(commands.calls).toHaveLength(1);
	});

	test("fails safely on an inconsistent trunk marker", async () => {
		const commands = scriptedExec([{}]);
		const graphite = trackedStack({
			trunkMarker: {
				type: "problem",
				terminus: "main",
				terminusState: "unmarked",
				markedTrunks: ["legacy"],
			},
		});

		expect(await runStackSquashFlow(commands, graphite, { cwd: TEST_CWD })).toMatchObject({
			kind: "stack-discovery-failed",
			reason: "inconsistent-trunk-marker",
			message: expect.stringContaining("marked trunks: `legacy`"),
		});
		expect(commands.calls).toHaveLength(1);
	});

	test("fails safely when completed ancestor metadata is internally inconsistent", async () => {
		const commands = scriptedExec([{}]);
		const graphite = trackedStack({
			ancestors: ["main", "feature/top"],
		});

		expect(await runStackSquashFlow(commands, graphite, { cwd: TEST_CWD })).toMatchObject({
			kind: "stack-discovery-failed",
			reason: "inconsistent-ancestor-metadata",
		});
		expect(commands.calls).toHaveLength(1);
	});

	test("treats an already-one-commit branch as success", async () => {
		const commands = scriptedExec([{}, { stdout: "1\n" }, {}]);
		const graphite = trackedStack();

		expect(await runStackSquashFlow(commands, graphite, { cwd: TEST_CWD })).toEqual({
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
		const commands = scriptedExec([{}, { stdout: "0\n" }, {}]);
		const graphite = trackedStack();
		const completed: string[] = [];

		const outcome = await runStackSquashFlow(commands, graphite, {
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
			{ command: "git", args: ["rev-list", "--count", "main..feature/top"], cwd: TEST_CWD },
			{ command: "gt", args: ["checkout", "feature/top", "--no-interactive"], cwd: TEST_CWD },
		]);
	});

	test("still rejects an empty commit count", async () => {
		const commands = scriptedExec([{}, { stdout: "\n" }]);
		const graphite = trackedStack();

		expect(await runStackSquashFlow(commands, graphite, { cwd: TEST_CWD })).toMatchObject({
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
			{ stdout: "2\n" },
			{ stdout: "3\n" },
			{},
			{ code: 1, stderr: "cannot squash branch\n" },
		]);
		const graphite = trackedStack({
			current: "feature/top",
			ancestors: ["main", "feature/bottom"],
		});

		const outcome = await runStackSquashFlow(commands, graphite, { cwd: TEST_CWD });

		expect(outcome).toMatchObject({
			kind: "squash-failed",
			branch: "feature/top",
			execResult: { code: 1, stderr: "cannot squash branch\n" },
		});
		expect(commands.calls.at(-1)?.args).toEqual(["squash", "--no-edit", "--no-interactive"]);
	});
});
