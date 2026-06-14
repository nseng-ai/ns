import { describe, expect, test } from "vitest";

import { runSdlccCli } from "../../src/cli.ts";

interface CliRun {
	readonly stdout: string[];
	readonly stderr: string[];
	readonly startCalls: string[];
	readonly exit: Promise<number>;
}

function runWithFakes(args: readonly string[]): CliRun {
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
		}),
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
		expect(run.stdout.join("")).toContain("Open a full-screen OpenTUI hello-world screen.");
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

	test("rejects unknown arguments without starting the TUI", async () => {
		const run = runWithFakes(["status"]);

		expect(await run.exit).toBe(2);
		expect(run.stdout).toEqual([]);
		expect(run.stderr.join("")).toContain("error: too many arguments");
		expect(run.startCalls).toEqual([]);
	});
});
