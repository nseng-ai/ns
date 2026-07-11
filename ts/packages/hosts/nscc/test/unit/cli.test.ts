import { describe, expect, test } from "vitest";

import { runNsccCli, type NsccCliDeps } from "../../src/cli.ts";
import type { CommandOptions, CommandOutput, CommandRunner } from "../../src/command-runner.ts";

interface CliRun {
	readonly stdout: string[];
	readonly stderr: string[];
	readonly startCalls: string[];
	readonly exit: Promise<number>;
}

interface CommandCall {
	readonly command: string;
	readonly args: readonly string[];
	readonly options: CommandOptions | undefined;
}

function runWithFakes(args: readonly string[], deps: NsccCliDeps = {}): CliRun {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const startCalls: string[] = [];

	return {
		stdout,
		stderr,
		startCalls,
		exit: runNsccCli(args, {
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
			startTui: () => {
				startCalls.push("start");
			},
			...deps,
		}),
	};
}

function successRunner(calls: CommandCall[] = []): CommandRunner {
	return async (command, args, options) => {
		calls.push({ command, args: [...args], options });
		if (command === "git" && args[0] === "rev-parse")
			return { type: "exited", code: 0, signal: null, stdout: "/repo/slot-05\n", stderr: "" };
		if (command === "git" && args[0] === "branch")
			return { type: "exited", code: 0, signal: null, stdout: "feature/report\n", stderr: "" };
		if (command === "cmux")
			return { type: "exited", code: 0, signal: null, stdout: "", stderr: "" };
		return {
			type: "exited",
			code: 2,
			signal: null,
			stdout: "",
			stderr: `unexpected command ${command}`,
		};
	};
}

function reportEnv(
	overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
	return {
		PWD: "/repo/slot-05",
		SHELL: "/bin/bash",
		CMUX_WORKSPACE_ID: "workspace:45",
		CMUX_SURFACE_ID: "surface:117",
		...overrides,
	};
}

describe("runNsccCli", () => {
	test("starts the TUI with no arguments", async () => {
		const run = runWithFakes([]);

		expect(await run.exit).toBe(0);
		expect(run.startCalls).toEqual(["start"]);
		expect(run.stdout).toEqual([]);
		expect(run.stderr).toEqual([]);
	});

	test("prints help without starting the TUI", async () => {
		const run = runWithFakes(["--help"]);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("Usage: nscc [options]");
		expect(run.stdout.join("")).toContain("Open a full-screen OpenTUI stack map.");
		expect(run.stdout.join("")).toContain("cmux");
		expect(run.stderr).toEqual([]);
		expect(run.startCalls).toEqual([]);
	});

	test("prints short help without starting the TUI", async () => {
		const run = runWithFakes(["-h"]);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("Usage: nscc");
		expect(run.stderr).toEqual([]);
		expect(run.startCalls).toEqual([]);
	});

	test("prints version without starting the TUI", async () => {
		const run = runWithFakes(["--version"]);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("0.1.0\n");
		expect(run.stderr).toEqual([]);
		expect(run.startCalls).toEqual([]);
	});

	test("prints runtime diagnostics without starting the TUI", async () => {
		const run = runWithFakes(["--runtime"]);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(
			"runtime: bun\nentry_point: nscc bin nscc -> ts/packages/hosts/nscc/src/cli.ts\n",
		);
		expect(run.stderr).toEqual([]);
		expect(run.startCalls).toEqual([]);
	});

	test("rejects unknown commands without starting the TUI", async () => {
		const run = runWithFakes(["not-a-command"]);

		expect(await run.exit).toBe(2);
		expect(run.stdout).toEqual([]);
		expect(run.stderr.join("")).toContain("unknown command 'not-a-command'");
		expect(run.startCalls).toEqual([]);
	});

	test("reports cmux surface identity with human output", async () => {
		const calls: CommandCall[] = [];
		const run = runWithFakes(["cmux", "report"], {
			cwd: "/repo/slot-05",
			env: reportEnv(),
			runCommand: successRunner(calls),
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout).toEqual([
			"Reported cmux surface identity: feature/report @ /repo/slot-05\n",
		]);
		expect(run.stderr).toEqual([]);
		expect(calls).toEqual([
			{
				command: "git",
				args: ["rev-parse", "--show-toplevel"],
				options: { cwd: "/repo/slot-05", timeout: 10_000 },
			},
			{
				command: "git",
				args: ["branch", "--show-current"],
				options: { cwd: "/repo/slot-05", timeout: 10_000 },
			},
			{
				command: "cmux",
				args: [
					"surface",
					"resume",
					"set",
					"--workspace",
					"workspace:45",
					"--surface",
					"surface:117",
					"--cwd",
					"/repo/slot-05",
					"--name",
					"feature/report",
					"--kind",
					"nscc-branch",
					"--source",
					"nscc",
					"--shell",
					"/bin/bash",
				],
				options: { cwd: "/repo/slot-05", timeout: 10_000 },
			},
		]);
		expect(run.startCalls).toEqual([]);
	});

	test("reports cmux surface identity as JSON", async () => {
		const run = runWithFakes(["cmux", "report", "--format", "json"], {
			cwd: "/repo/slot-05",
			env: reportEnv(),
			runCommand: successRunner(),
		});

		expect(await run.exit).toBe(0);
		expect(JSON.parse(run.stdout.join(""))).toEqual({
			status: "ok",
			exitCode: 0,
			data: {
				branch: "feature/report",
				worktreePath: "/repo/slot-05",
				workspaceId: "workspace:45",
				surfaceId: "surface:117",
				kind: "nscc-branch",
				source: "nscc",
				shell: "/bin/bash",
			},
		});
		expect(run.stderr).toEqual([]);
	});

	test("fails before mutation when cmux surface env is missing", async () => {
		const calls: CommandCall[] = [];
		const run = runWithFakes(["cmux", "report"], {
			cwd: "/repo/slot-05",
			env: reportEnv({ CMUX_SURFACE_ID: undefined }),
			runCommand: successRunner(calls),
		});

		expect(await run.exit).toBe(2);
		expect(run.stdout).toEqual([]);
		expect(run.stderr.join("")).toContain("CMUX_SURFACE_ID is not set");
		expect(calls).toEqual([]);
	});

	test("emits JSON failures on stdout", async () => {
		const run = runWithFakes(["cmux", "report", "--format", "json"], {
			cwd: "/repo/slot-05",
			env: reportEnv({ CMUX_SURFACE_ID: undefined }),
			runCommand: successRunner(),
		});

		expect(await run.exit).toBe(2);
		expect(JSON.parse(run.stdout.join(""))).toEqual({
			status: "usageError",
			exitCode: 2,
			errorType: "usageError",
			message: "nscc cmux report must run inside a cmux surface; CMUX_SURFACE_ID is not set.",
			data: { code: "missing-surface-id", commandFailure: null },
		});
		expect(run.stderr).toEqual([]);
	});

	test("fails before mutation when cwd is not in a git worktree", async () => {
		const calls: CommandCall[] = [];
		const run = runWithFakes(["cmux", "report"], {
			cwd: "/tmp",
			env: reportEnv(),
			runCommand: async (command, args, options): Promise<CommandOutput> => {
				calls.push({ command, args: [...args], options });
				return {
					type: "exited",
					code: 128,
					signal: null,
					stdout: "",
					stderr: "fatal: not a git repository",
				};
			},
		});

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("must run inside a git worktree");
		expect(calls).toEqual([
			{
				command: "git",
				args: ["rev-parse", "--show-toplevel"],
				options: { cwd: "/tmp", timeout: 10_000 },
			},
		]);
	});

	test("reports spawn failures truthfully in JSON command evidence", async () => {
		const run = runWithFakes(["cmux", "report", "--format", "json"], {
			cwd: "/tmp",
			env: reportEnv(),
			runCommand: async (): Promise<CommandOutput> => ({
				type: "spawn-failed",
				stdout: "",
				stderr: "spawn git ENOENT",
				error: "spawn git ENOENT",
			}),
		});

		expect(await run.exit).toBe(2);
		expect(JSON.parse(run.stdout.join(""))).toMatchObject({
			data: {
				commandFailure: {
					exitCode: null,
					termination: "spawn-failed",
					error: "spawn git ENOENT",
				},
			},
		});
	});

	test("fails before mutation on detached HEAD", async () => {
		const calls: CommandCall[] = [];
		const run = runWithFakes(["cmux", "report"], {
			cwd: "/repo/slot-05",
			env: reportEnv(),
			runCommand: async (command, args, options): Promise<CommandOutput> => {
				calls.push({ command, args: [...args], options });
				if (command === "git" && args[0] === "rev-parse")
					return { type: "exited", code: 0, signal: null, stdout: "/repo/slot-05\n", stderr: "" };
				if (command === "git" && args[0] === "branch")
					return { type: "exited", code: 0, signal: null, stdout: "\n", stderr: "" };
				return {
					type: "exited",
					code: 2,
					signal: null,
					stdout: "",
					stderr: `unexpected command ${command}`,
				};
			},
		});

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("detached HEAD is not supported");
		expect(calls.map((call) => call.command)).toEqual(["git", "git"]);
	});

	test("reports cmux mutation failures", async () => {
		const run = runWithFakes(["cmux", "report"], {
			cwd: "/repo/slot-05",
			env: reportEnv(),
			runCommand: async (command, args): Promise<CommandOutput> => {
				if (command === "git" && args[0] === "rev-parse")
					return { type: "exited", code: 0, signal: null, stdout: "/repo/slot-05\n", stderr: "" };
				if (command === "git" && args[0] === "branch")
					return { type: "exited", code: 0, signal: null, stdout: "feature/report\n", stderr: "" };
				if (command === "cmux")
					return {
						type: "exited",
						code: 7,
						signal: null,
						stdout: "",
						stderr: "no current surface",
					};
				return {
					type: "exited",
					code: 2,
					signal: null,
					stdout: "",
					stderr: `unexpected command ${command}`,
				};
			},
		});

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("cmux surface resume set failed");
		expect(run.stderr.join("")).toContain("no current surface");
	});
});
