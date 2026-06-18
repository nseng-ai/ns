import { describe, expect, test } from "vitest";

import { runSdlccCli, type SdlccCliDeps } from "../../src/cli.ts";
import type { CommandOptions, CommandOutput } from "../../src/command-runner.ts";

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

function runWithFakes(args: readonly string[], deps: SdlccCliDeps = {}): CliRun {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const startCalls: string[] = [];

	return {
		stdout,
		stderr,
		startCalls,
		exit: runSdlccCli(args, {
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
			startTui: () => {
				startCalls.push("start");
			},
			...deps,
		}),
	};
}

function successRunner(calls: CommandCall[] = []): SdlccCliDeps["runCommand"] {
	return async (command, args, options) => {
		calls.push({ command, args: [...args], options });
		if (command === "git" && args[0] === "rev-parse")
			return { code: 0, stdout: "/repo/slot-05\n", stderr: "", killed: false };
		if (command === "git" && args[0] === "branch")
			return { code: 0, stdout: "feature/report\n", stderr: "", killed: false };
		if (command === "cmux") return { code: 0, stdout: "", stderr: "", killed: false };
		return { code: 2, stdout: "", stderr: `unexpected command ${command}`, killed: false };
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

describe("runSdlccCli", () => {
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
		expect(run.stdout.join("")).toContain("Usage: sdlcc [options]");
		expect(run.stdout.join("")).toContain("Open a full-screen OpenTUI stack map.");
		expect(run.stdout.join("")).toContain("cmux");
		expect(run.stderr).toEqual([]);
		expect(run.startCalls).toEqual([]);
	});

	test("prints short help without starting the TUI", async () => {
		const run = runWithFakes(["-h"]);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("Usage: sdlcc");
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
					"sdlcc-branch",
					"--source",
					"sdlcc",
					"--shell",
					"/bin/bash",
				],
				options: { cwd: "/repo/slot-05", timeout: 10_000 },
			},
		]);
		expect(run.startCalls).toEqual([]);
	});

	test("reports cmux surface identity as JSON", async () => {
		const run = runWithFakes(["cmux", "report", "--json"], {
			cwd: "/repo/slot-05",
			env: reportEnv(),
			runCommand: successRunner(),
		});

		expect(await run.exit).toBe(0);
		expect(JSON.parse(run.stdout.join(""))).toEqual({
			ok: true,
			branch: "feature/report",
			worktree_path: "/repo/slot-05",
			workspace_id: "workspace:45",
			surface_id: "surface:117",
			kind: "sdlcc-branch",
			source: "sdlcc",
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

		expect(await run.exit).toBe(1);
		expect(run.stdout).toEqual([]);
		expect(run.stderr.join("")).toContain("CMUX_SURFACE_ID is not set");
		expect(calls).toEqual([]);
	});

	test("emits JSON failures on stdout", async () => {
		const run = runWithFakes(["cmux", "report", "--json"], {
			cwd: "/repo/slot-05",
			env: reportEnv({ CMUX_SURFACE_ID: undefined }),
			runCommand: successRunner(),
		});

		expect(await run.exit).toBe(1);
		expect(JSON.parse(run.stdout.join(""))).toEqual({
			ok: false,
			error: "sdlcc cmux report must run inside a cmux surface; CMUX_SURFACE_ID is not set.",
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
				return { code: 128, stdout: "", stderr: "fatal: not a git repository", killed: false };
			},
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toContain("must run inside a git worktree");
		expect(calls).toEqual([
			{
				command: "git",
				args: ["rev-parse", "--show-toplevel"],
				options: { cwd: "/tmp", timeout: 10_000 },
			},
		]);
	});

	test("fails before mutation on detached HEAD", async () => {
		const calls: CommandCall[] = [];
		const run = runWithFakes(["cmux", "report"], {
			cwd: "/repo/slot-05",
			env: reportEnv(),
			runCommand: async (command, args, options): Promise<CommandOutput> => {
				calls.push({ command, args: [...args], options });
				if (command === "git" && args[0] === "rev-parse")
					return { code: 0, stdout: "/repo/slot-05\n", stderr: "", killed: false };
				if (command === "git" && args[0] === "branch")
					return { code: 0, stdout: "\n", stderr: "", killed: false };
				return { code: 2, stdout: "", stderr: `unexpected command ${command}`, killed: false };
			},
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toContain("detached HEAD is not supported");
		expect(calls.map((call) => call.command)).toEqual(["git", "git"]);
	});

	test("reports cmux mutation failures", async () => {
		const run = runWithFakes(["cmux", "report"], {
			cwd: "/repo/slot-05",
			env: reportEnv(),
			runCommand: async (command, args): Promise<CommandOutput> => {
				if (command === "git" && args[0] === "rev-parse")
					return { code: 0, stdout: "/repo/slot-05\n", stderr: "", killed: false };
				if (command === "git" && args[0] === "branch")
					return { code: 0, stdout: "feature/report\n", stderr: "", killed: false };
				if (command === "cmux")
					return { code: 7, stdout: "", stderr: "no current surface", killed: false };
				return { code: 2, stdout: "", stderr: `unexpected command ${command}`, killed: false };
			},
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toContain("cmux surface resume set failed");
		expect(run.stderr.join("")).toContain("no current surface");
	});
});
