import { describe, expect, test } from "vitest";

import type { ExecResult } from "@nseng-ai/core/command";

import { runTrunkPullDetailed } from "../src/ns/trunk-pull.ts";

type TrunkPullCommands = Parameters<typeof runTrunkPullDetailed>[0];
type ExecOptions = Parameters<TrunkPullCommands["exec"]>[2];

interface ScriptedExec {
	command: string;
	args: string[];
	result?: Partial<ExecResult>;
}

class FakeCommands implements TrunkPullCommands {
	readonly execCalls: Array<{
		command: string;
		args: string[];
		options: ExecOptions;
	}> = [];
	private readonly script: ScriptedExec[];

	constructor(script: ScriptedExec[] = []) {
		this.script = [...script];
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		this.execCalls.push({ command, args: [...args], options });
		const next = this.script.shift();
		if (next === undefined) {
			throw new Error(`unexpected exec: ${command} ${args.join(" ")}`);
		}
		if (next.command !== command || !sameArgs(next.args, args)) {
			throw new Error(
				`expected ${next.command} ${next.args.join(" ")}, got ${command} ${args.join(" ")}`,
			);
		}
		return { stdout: "", stderr: "", code: 0, killed: false, ...next.result };
	}
}

function step(command: string, args: string[], result: Partial<ExecResult> = {}): ScriptedExec {
	return { command, args, result };
}

function sameArgs(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function worktreesPorcelain(): string {
	return [
		"worktree /repo",
		"HEAD abc123",
		"branch refs/heads/feature",
		"",
		"worktree /Users/schrockn/code/sdl-tools",
		"HEAD def456",
		"branch refs/heads/master",
		"",
	].join("\n");
}

describe("runTrunkPullDetailed", () => {
	test("returns the resolved trunk and planned fetch command on success", async () => {
		const commands = new FakeCommands([
			step("gt", ["trunk", "--no-interactive"], { stdout: "main\n" }),
			step("git", ["worktree", "list", "--porcelain"], {
				stdout: "worktree /repo\nHEAD abc123\nbranch refs/heads/feature\n",
			}),
			step("git", ["fetch", "origin", "refs/heads/main:refs/heads/main"], {
				stdout: "updated\n",
			}),
		]);

		const result = await runTrunkPullDetailed(commands, "/repo");

		expect(result).toMatchObject({
			outcome: { kind: "success", trunk: "main" },
			command: "git",
			args: ["fetch", "origin", "refs/heads/main:refs/heads/main"],
			cwd: "/repo",
			execResult: { stdout: "updated\n", code: 0, killed: false },
		});
		expect(commands.execCalls.map((call) => [call.command, call.args])).toEqual([
			["gt", ["trunk", "--no-interactive"]],
			["git", ["worktree", "list", "--porcelain"]],
			["git", ["fetch", "origin", "refs/heads/main:refs/heads/main"]],
		]);
		expect(
			commands.execCalls.some((call) => call.command === "gt" && call.args[0] === "sync"),
		).toBe(false);
	});

	test("uses the trunk worktree cwd when trunk is checked out elsewhere", async () => {
		const commands = new FakeCommands([
			step("gt", ["trunk", "--no-interactive"], { stdout: "master\n" }),
			step("git", ["worktree", "list", "--porcelain"], { stdout: worktreesPorcelain() }),
			step("git", ["pull", "--ff-only", "origin", "master"], {
				stdout: "Already up to date.\n",
			}),
		]);

		const result = await runTrunkPullDetailed(commands, "/repo");

		expect(result).toMatchObject({
			outcome: { kind: "success", trunk: "master" },
			command: "git",
			args: ["pull", "--ff-only", "origin", "master"],
			cwd: "/Users/schrockn/code/sdl-tools",
		});
		expect(commands.execCalls.map((call) => [call.command, call.args, call.options?.cwd])).toEqual([
			["gt", ["trunk", "--no-interactive"], "/repo"],
			["git", ["worktree", "list", "--porcelain"], "/repo"],
			["git", ["pull", "--ff-only", "origin", "master"], "/Users/schrockn/code/sdl-tools"],
		]);
		expect(
			commands.execCalls.some((call) => call.command === "gt" && call.args[0] === "sync"),
		).toBe(false);
	});

	test("returns a structured Graphite trunk command failure", async () => {
		const commands = new FakeCommands([
			step("gt", ["trunk", "--no-interactive"], { code: 1, stderr: "no trunk\n" }),
		]);

		const result = await runTrunkPullDetailed(commands, "/repo");

		expect(result).toMatchObject({
			outcome: { kind: "trunk-command-failed" },
			command: "gt",
			args: ["trunk", "--no-interactive"],
			cwd: "/repo",
			execResult: { stderr: "no trunk\n", code: 1, killed: false },
		});
		expect(commands.execCalls).toHaveLength(1);
	});

	test("returns a structured empty-trunk failure with the original result", async () => {
		const commands = new FakeCommands([
			step("gt", ["trunk", "--no-interactive"], { stdout: "\n" }),
		]);

		const result = await runTrunkPullDetailed(commands, "/repo");

		expect(result).toMatchObject({
			outcome: { kind: "trunk-empty" },
			command: "gt",
			args: ["trunk", "--no-interactive"],
			cwd: "/repo",
			execResult: { stdout: "\n", code: 0, killed: false },
		});
	});

	test("returns a structured worktree-list failure", async () => {
		const commands = new FakeCommands([
			step("gt", ["trunk", "--no-interactive"], { stdout: "main\n" }),
			step("git", ["worktree", "list", "--porcelain"], {
				code: 1,
				stderr: "fatal: worktree metadata unavailable\n",
			}),
		]);

		const result = await runTrunkPullDetailed(commands, "/repo");

		expect(result).toMatchObject({
			outcome: { kind: "worktree-list-failed", trunk: "main" },
			command: "git",
			args: ["worktree", "list", "--porcelain"],
			cwd: "/repo",
			execResult: { stderr: "fatal: worktree metadata unavailable\n", code: 1, killed: false },
		});
	});

	test("returns a structured update failure with the planned cwd and stderr", async () => {
		const commands = new FakeCommands([
			step("gt", ["trunk", "--no-interactive"], { stdout: "master\n" }),
			step("git", ["worktree", "list", "--porcelain"], { stdout: worktreesPorcelain() }),
			step("git", ["pull", "--ff-only", "origin", "master"], {
				code: 1,
				stderr: "not fast-forward\n",
			}),
		]);

		const result = await runTrunkPullDetailed(commands, "/repo");

		expect(result).toMatchObject({
			outcome: { kind: "update-failed", trunk: "master" },
			command: "git",
			args: ["pull", "--ff-only", "origin", "master"],
			cwd: "/Users/schrockn/code/sdl-tools",
			execResult: { stderr: "not fast-forward\n", code: 1, killed: false },
		});
	});
});
