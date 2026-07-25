import { describe, expect, test } from "vitest";

import type { CommandExecApi, ExecOptions, ExecResult } from "@nseng-ai/foundation/exec";
import {
	deriveValidatedGraphiteStackPath,
	execGitCommonDir,
	type GraphiteStackPathFailure,
	type StackResult,
} from "@nseng-ai/extension-kit/graphite/stack";
import { FakeGraphiteStackGateway, fakeStackInfo } from "@nseng-ai/extension-kit/graphite/testing";

interface RecordedCall {
	command: string;
	args: string[];
	options: ExecOptions | undefined;
}

function fakeExec(result: Partial<Extract<ExecResult, { type: "exited" }>>): {
	api: CommandExecApi;
	calls: RecordedCall[];
} {
	const calls: RecordedCall[] = [];
	const api: CommandExecApi = {
		async exec(command, args, options) {
			calls.push({ command, args: [...args], options });
			return {
				type: "exited",
				stdout: result.stdout ?? "",
				stderr: result.stderr ?? "",
				code: result.code ?? 0,
				signal: result.signal ?? null,
			};
		},
	};
	return { api, calls };
}

describe("FakeGraphiteStackGateway", () => {
	test("records explicit-branch stack lookups separately", async () => {
		const gateway = new FakeGraphiteStackGateway();

		await gateway.stackForBranch("/repo", "feature/current");

		expect(gateway.operations()).toEqual([
			{ type: "stack-for-branch", cwd: "/repo", branch: "feature/current" },
		]);
	});
});

describe("deriveValidatedGraphiteStackPath", () => {
	test("returns a newly allocated trunk-to-current path with the original stack", () => {
		const stack = fakeStackInfo({
			trunk: "main",
			current: "feature/top",
			ancestors: ["main", "feature/base"],
		});

		const result = deriveValidatedGraphiteStackPath({ type: "stack", stack });

		expect(result).toEqual({
			type: "success",
			stack,
			path: ["main", "feature/base", "feature/top"],
		});
		if (result.type !== "success") throw new Error("expected validated stack path");
		expect(result.path).not.toBe(stack.ancestors);
	});

	test("accepts a one-node current-at-trunk path", () => {
		const stack = fakeStackInfo({ trunk: "main", current: "main", ancestors: [] });

		expect(deriveValidatedGraphiteStackPath({ type: "stack", stack })).toEqual({
			type: "success",
			stack,
			path: ["main"],
		});
	});

	const failures: readonly {
		name: string;
		result: StackResult;
		failure: GraphiteStackPathFailure;
	}[] = [
		{
			name: "untracked branch",
			result: { type: "untracked_branch", message: "feature/local is not tracked" },
			failure: { type: "untracked_branch", message: "feature/local is not tracked" },
		},
		{
			name: "provider failure",
			result: {
				type: "failure",
				failure: { message: "metadata unavailable", returnCode: 17 },
			},
			failure: {
				type: "provider_failure",
				failure: { message: "metadata unavailable", returnCode: 17 },
			},
		},
		{
			name: "ancestor cycle",
			result: {
				type: "stack",
				stack: fakeStackInfo({
					ancestorTermination: { type: "cycle", branch: "feature/base" },
				}),
			},
			failure: { type: "ancestor_cycle", branch: "feature/base" },
		},
		{
			name: "missing ancestor row",
			result: {
				type: "stack",
				stack: fakeStackInfo({
					ancestorTermination: { type: "row_missing", branch: "feature/missing" },
				}),
			},
			failure: { type: "ancestor_row_missing", branch: "feature/missing" },
		},
		{
			name: "trunk marker problem",
			result: {
				type: "stack",
				stack: fakeStackInfo({
					trunkMarker: {
						type: "problem",
						terminus: "main",
						terminusState: "unmarked",
						markedTrunks: ["legacy"],
					},
				}),
			},
			failure: {
				type: "trunk_marker_problem",
				marker: {
					type: "problem",
					terminus: "main",
					terminusState: "unmarked",
					markedTrunks: ["legacy"],
				},
			},
		},
		{
			name: "blank trunk",
			result: {
				type: "stack",
				stack: fakeStackInfo({ trunk: " ", ancestors: [" "] }),
			},
			failure: { type: "path_inconsistent", trunk: " ", current: "feature/current" },
		},
		{
			name: "blank current branch",
			result: {
				type: "stack",
				stack: fakeStackInfo({ current: " " }),
			},
			failure: { type: "path_inconsistent", trunk: "master", current: " " },
		},
		{
			name: "first ancestor does not match trunk",
			result: {
				type: "stack",
				stack: fakeStackInfo({ trunk: "main", ancestors: ["legacy"] }),
			},
			failure: { type: "path_inconsistent", trunk: "main", current: "feature/current" },
		},
		{
			name: "blank path member",
			result: {
				type: "stack",
				stack: fakeStackInfo({ trunk: "main", ancestors: ["main", " "] }),
			},
			failure: { type: "path_inconsistent", trunk: "main", current: "feature/current" },
		},
		{
			name: "duplicate path member",
			result: {
				type: "stack",
				stack: fakeStackInfo({
					trunk: "main",
					ancestors: ["main", "feature/base", "feature/base"],
				}),
			},
			failure: { type: "path_inconsistent", trunk: "main", current: "feature/current" },
		},
		{
			name: "malformed current-at-trunk ancestry",
			result: {
				type: "stack",
				stack: fakeStackInfo({ trunk: "main", current: "main", ancestors: ["main"] }),
			},
			failure: { type: "path_inconsistent", trunk: "main", current: "main" },
		},
	];

	test.each(failures)("preserves neutral facts for $name", ({ result, failure }) => {
		expect(deriveValidatedGraphiteStackPath(result)).toEqual({ type: "failure", failure });
	});
});

describe("execGitCommonDir", () => {
	test("returns an absolute common dir unchanged and runs git rev-parse", async () => {
		const fake = fakeExec({ stdout: "/repo/.git\n" });

		const result = await execGitCommonDir(fake.api, "/repo");

		expect(result).toBe("/repo/.git");
		expect(fake.calls).toEqual([
			{ command: "git", args: ["rev-parse", "--git-common-dir"], options: { cwd: "/repo" } },
		]);
	});

	test("resolves a relative common dir against cwd", async () => {
		const fake = fakeExec({ stdout: ".git\n" });
		expect(await execGitCommonDir(fake.api, "/repo")).toBe("/repo/.git");
	});

	test("returns null on a nonzero exit", async () => {
		const fake = fakeExec({
			type: "exited",
			stdout: "",
			stderr: "fatal: not a git repository",
			code: 128,
			signal: null,
		});
		expect(await execGitCommonDir(fake.api, "/repo")).toBeNull();
	});

	test("returns null when the resolved output is empty", async () => {
		const fake = fakeExec({ stdout: "   \n" });
		expect(await execGitCommonDir(fake.api, "/repo")).toBeNull();
	});
});
