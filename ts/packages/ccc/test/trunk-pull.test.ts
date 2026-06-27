import { describe, expect, test } from "vitest";

import type { ExecResult } from "@sdl/core/exec";

import { runTrunkPull, runTrunkPullCli, type TrunkPullCliInput } from "../src/trunk-pull.ts";

type ExecOptions = Parameters<TrunkPullCliInput["exec"]>[2];

interface ScriptedExec {
	command: string;
	args: string[];
	result?: Partial<ExecResult>;
}

class FakeCommands implements Pick<TrunkPullCliInput, "exec"> {
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

function createCliInput(commands: FakeCommands): TrunkPullCliInput & {
	stdoutText: string;
	stderrText: string;
} {
	const input = {
		cwd: "/repo",
		exec: commands.exec.bind(commands),
		stdoutText: "",
		stderrText: "",
		stdout(text: string): void {
			input.stdoutText += text;
		},
		stderr(text: string): void {
			input.stderrText += text;
		},
	};
	return input;
}

describe("runTrunkPull", () => {
	test("fetches only the resolved Graphite trunk branch when it is not checked out", async () => {
		const commands = new FakeCommands([
			step("gt", ["trunk", "--no-interactive"], { stdout: "main\n" }),
			step("git", ["worktree", "list", "--porcelain"], {
				stdout: "worktree /repo\nHEAD abc123\nbranch refs/heads/feature\n",
			}),
			step("git", ["fetch", "origin", "refs/heads/main:refs/heads/main"], {
				stdout: "updated\n",
			}),
		]);

		const result = await runTrunkPull(commands, "/repo");

		expect(result.ok).toBe(true);
		expect(commands.execCalls.map((call) => [call.command, call.args])).toEqual([
			["gt", ["trunk", "--no-interactive"]],
			["git", ["worktree", "list", "--porcelain"]],
			["git", ["fetch", "origin", "refs/heads/main:refs/heads/main"]],
		]);
		expect(
			commands.execCalls.some((call) => call.command === "gt" && call.args[0] === "sync"),
		).toBe(false);
		if (!result.ok) throw new Error(result.message);
		expect(result.message).toContain("Pulled local Graphite trunk branch `main` only.");
		expect(result.message).toContain("No full `gt sync` was run.");
	});

	test("pulls the trunk worktree when trunk is checked out elsewhere", async () => {
		const commands = new FakeCommands([
			step("gt", ["trunk", "--no-interactive"], { stdout: "master\n" }),
			step("git", ["worktree", "list", "--porcelain"], { stdout: worktreesPorcelain() }),
			step("git", ["pull", "--ff-only", "origin", "master"], {
				stdout: "Already up to date.\n",
			}),
		]);

		const result = await runTrunkPull(commands, "/repo");

		expect(result.ok).toBe(true);
		expect(commands.execCalls.map((call) => [call.command, call.args, call.options?.cwd])).toEqual([
			["gt", ["trunk", "--no-interactive"], "/repo"],
			["git", ["worktree", "list", "--porcelain"], "/repo"],
			["git", ["pull", "--ff-only", "origin", "master"], "/Users/schrockn/code/sdl-tools"],
		]);
		expect(
			commands.execCalls.some((call) => call.command === "gt" && call.args[0] === "sync"),
		).toBe(false);
		if (!result.ok) throw new Error(result.message);
		expect(result.message).toContain("Command: git pull --ff-only origin master");
		expect(result.message).toContain("Cwd: /Users/schrockn/code/sdl-tools");
	});

	test("reports Graphite trunk lookup failures without fetching", async () => {
		const commands = new FakeCommands([
			step("gt", ["trunk", "--no-interactive"], { code: 1, stderr: "no trunk\n" }),
		]);

		const result = await runTrunkPull(commands, "/repo");

		expect(result.ok).toBe(false);
		expect(commands.execCalls).toHaveLength(1);
		expect(result.message).toContain("Could not resolve Graphite trunk");
		expect(result.message).toContain("no trunk");
	});

	test("reports fetch failures", async () => {
		const commands = new FakeCommands([
			step("gt", ["trunk", "--no-interactive"], { stdout: "master\n" }),
			step("git", ["worktree", "list", "--porcelain"], {
				stdout: "worktree /repo\nHEAD abc123\nbranch refs/heads/feature\n",
			}),
			step("git", ["fetch", "origin", "refs/heads/master:refs/heads/master"], {
				code: 1,
				stderr: "fetch failed\n",
			}),
		]);

		const result = await runTrunkPull(commands, "/repo");

		expect(result.ok).toBe(false);
		expect(result.message).toContain("Could not update local trunk branch `master`.");
		expect(result.message).toContain("fetch failed");
	});

	test("reports checked-out trunk pull failures with the trunk worktree cwd", async () => {
		const commands = new FakeCommands([
			step("gt", ["trunk", "--no-interactive"], { stdout: "master\n" }),
			step("git", ["worktree", "list", "--porcelain"], { stdout: worktreesPorcelain() }),
			step("git", ["pull", "--ff-only", "origin", "master"], {
				code: 1,
				stderr: "not fast-forward\n",
			}),
		]);

		const result = await runTrunkPull(commands, "/repo");

		expect(result.ok).toBe(false);
		expect(result.message).toContain("Could not update local trunk branch `master`.");
		expect(result.message).toContain("Command: git pull --ff-only origin master");
		expect(result.message).toContain("Cwd: /Users/schrockn/code/sdl-tools");
		expect(result.message).toContain("not fast-forward");
	});
});

describe("runTrunkPullCli", () => {
	test("writes successful messages to stdout and returns zero", async () => {
		const commands = new FakeCommands([
			step("gt", ["trunk", "--no-interactive"], { stdout: "main\n" }),
			step("git", ["worktree", "list", "--porcelain"], {
				stdout: "worktree /repo\nHEAD abc123\nbranch refs/heads/feature\n",
			}),
			step("git", ["fetch", "origin", "refs/heads/main:refs/heads/main"], { stdout: "updated\n" }),
		]);
		const input = createCliInput(commands);

		const exitCode = await runTrunkPullCli(input);

		expect(exitCode).toBe(0);
		expect(input.stdoutText).toContain("Pulled local Graphite trunk branch `main` only.");
		expect(input.stderrText).toBe("");
	});

	test("writes failures to stderr and returns one", async () => {
		const commands = new FakeCommands([
			step("gt", ["trunk", "--no-interactive"], { code: 1, stderr: "no trunk\n" }),
		]);
		const input = createCliInput(commands);

		const exitCode = await runTrunkPullCli(input);

		expect(exitCode).toBe(1);
		expect(input.stdoutText).toBe("");
		expect(input.stderrText).toContain("Could not resolve Graphite trunk");
		expect(input.stderrText).toContain("no trunk");
	});
});
