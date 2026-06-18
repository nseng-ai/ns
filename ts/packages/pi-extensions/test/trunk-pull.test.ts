import { describe, expect, test } from "vitest";

import trunkPullExtension, {
	runTrunkPull,
	type CommandContext,
	type ExecResult,
	type ExtensionAPI,
} from "../src/trunk-pull.ts";

type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];

interface ScriptedExec {
	command: string;
	args: string[];
	result?: Partial<ExecResult>;
}

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly execCalls: Array<{
		command: string;
		args: string[];
		options: { cwd?: string; timeout?: number } | undefined;
	}> = [];
	private readonly script: ScriptedExec[];

	constructor(script: ScriptedExec[] = []) {
		this.script = [...script];
	}

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	async exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<ExecResult> {
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

function createContext(): CommandContext & {
	notifications: Array<{ message: string; level: string | undefined }>;
	idleCalls: number;
} {
	const ctx = {
		cwd: "/repo",
		notifications: [] as Array<{ message: string; level: string | undefined }>,
		idleCalls: 0,
		ui: {
			notify(message: string, level?: string): void {
				ctx.notifications.push({ message, level });
			},
		},
		async waitForIdle(): Promise<void> {
			ctx.idleCalls += 1;
		},
	};
	return ctx;
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
		"worktree /Users/schrockn/code/asdl-tools",
		"HEAD def456",
		"branch refs/heads/master",
		"",
	].join("\n");
}

describe("sdl:code:pull-trunk", () => {
	test("registers the command", () => {
		const pi = new FakePi();

		trunkPullExtension(pi);

		expect([...pi.commands.keys()]).toEqual(["sdl:code:pull-trunk"]);
		expect(pi.commands.get("sdl:code:pull-trunk")?.description).toBe(
			"Pull Graphite trunk without running full gt sync",
		);
	});

	test("fetches only the resolved Graphite trunk branch when it is not checked out", async () => {
		const pi = new FakePi([
			step("gt", ["trunk", "--no-interactive"], { stdout: "main\n" }),
			step("git", ["worktree", "list", "--porcelain"], {
				stdout: "worktree /repo\nHEAD abc123\nbranch refs/heads/feature\n",
			}),
			step("git", ["fetch", "origin", "refs/heads/main:refs/heads/main"], { stdout: "updated\n" }),
		]);
		const ctx = createContext();

		const updated = await runTrunkPull(pi, ctx, "");

		expect(updated).toBe(true);
		expect(ctx.idleCalls).toBe(1);
		expect(pi.execCalls.map((call) => [call.command, call.args])).toEqual([
			["gt", ["trunk", "--no-interactive"]],
			["git", ["worktree", "list", "--porcelain"]],
			["git", ["fetch", "origin", "refs/heads/main:refs/heads/main"]],
		]);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "sync")).toBe(
			false,
		);
		expect(ctx.notifications[0]).toMatchObject({ level: "info" });
		expect(ctx.notifications[0]?.message).toContain(
			"Pulled local Graphite trunk branch `main` only.",
		);
		expect(ctx.notifications[0]?.message).toContain("No full `gt sync` was run.");
	});

	test("pulls the trunk worktree when trunk is checked out elsewhere", async () => {
		const pi = new FakePi([
			step("gt", ["trunk", "--no-interactive"], { stdout: "master\n" }),
			step("git", ["worktree", "list", "--porcelain"], { stdout: worktreesPorcelain() }),
			step("git", ["pull", "--ff-only", "origin", "master"], { stdout: "Already up to date.\n" }),
		]);
		const ctx = createContext();

		const updated = await runTrunkPull(pi, ctx, "");

		expect(updated).toBe(true);
		expect(pi.execCalls.map((call) => [call.command, call.args, call.options?.cwd])).toEqual([
			["gt", ["trunk", "--no-interactive"], "/repo"],
			["git", ["worktree", "list", "--porcelain"], "/repo"],
			["git", ["pull", "--ff-only", "origin", "master"], "/Users/schrockn/code/asdl-tools"],
		]);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "sync")).toBe(
			false,
		);
		expect(ctx.notifications[0]).toMatchObject({ level: "info" });
		expect(ctx.notifications[0]?.message).toContain("Command: git pull --ff-only origin master");
		expect(ctx.notifications[0]?.message).toContain("Cwd: /Users/schrockn/code/asdl-tools");
	});

	test("rejects arguments before waiting or running commands", async () => {
		const pi = new FakePi();
		const ctx = createContext();

		const updated = await runTrunkPull(pi, ctx, "--force");

		expect(updated).toBe(false);
		expect(ctx.idleCalls).toBe(0);
		expect(pi.execCalls).toEqual([]);
		expect(ctx.notifications[0]).toMatchObject({ level: "error" });
		expect(ctx.notifications[0]?.message).toContain("does not accept arguments");
	});

	test("reports Graphite trunk lookup failures without fetching", async () => {
		const pi = new FakePi([
			step("gt", ["trunk", "--no-interactive"], { code: 1, stderr: "no trunk\n" }),
		]);
		const ctx = createContext();

		const updated = await runTrunkPull(pi, ctx, "");

		expect(updated).toBe(false);
		expect(pi.execCalls).toHaveLength(1);
		expect(ctx.notifications[0]).toMatchObject({ level: "error" });
		expect(ctx.notifications[0]?.message).toContain("Could not resolve Graphite trunk");
		expect(ctx.notifications[0]?.message).toContain("no trunk");
	});

	test("reports fetch failures", async () => {
		const pi = new FakePi([
			step("gt", ["trunk", "--no-interactive"], { stdout: "master\n" }),
			step("git", ["worktree", "list", "--porcelain"], {
				stdout: "worktree /repo\nHEAD abc123\nbranch refs/heads/feature\n",
			}),
			step("git", ["fetch", "origin", "refs/heads/master:refs/heads/master"], {
				code: 1,
				stderr: "fetch failed\n",
			}),
		]);
		const ctx = createContext();

		const updated = await runTrunkPull(pi, ctx, "");

		expect(updated).toBe(false);
		expect(ctx.notifications[0]).toMatchObject({ level: "error" });
		expect(ctx.notifications[0]?.message).toContain(
			"Could not update local trunk branch `master`.",
		);
		expect(ctx.notifications[0]?.message).toContain("fetch failed");
	});
});
