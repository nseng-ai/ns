import { describe, expect, test } from "vitest";

import { listSdlCommands } from "@sdl/kernel/cli";

import { runCliWithFakes } from "./sdl-cli-fakes.ts";

function runUnavailableChangesCli(args: readonly string[]) {
	return runCliWithFakes(
		{ args, state: { exec: [], textGeneration: [] } },
		{
			execResponses: () => [],
			textGenerationResults: () => [],
		},
	);
}

describe("sdl flow changes CLI availability", () => {
	test("static SDL command metadata is empty after the kernel reset", async () => {
		expect(listSdlCommands()).toEqual([]);

		const topHelp = runUnavailableChangesCli(["--help"]);
		expect(await topHelp.exit).toBe(0);
		const help = topHelp.stdout.join("");
		expect(help).toContain("Usage: sdl");
		expect(help).not.toContain("changes");
		expect(help).not.toContain("cp");
		expect(help).not.toContain("submit");
		expect(help).not.toContain("regenerate-pr");
		expect(topHelp.stderr.join("")).toBe("");
	});

	test("changes help and invocation are unavailable without a project extension", async () => {
		const help = runUnavailableChangesCli(["flow", "changes", "--help"]);
		expect(await help.exit).toBe(0);
		expect(help.stdout.join("")).toContain("Usage: sdl");
		expect(help.stdout.join("")).not.toContain("Usage: sdl flow changes");

		const run = runUnavailableChangesCli(["flow", "changes"]);
		expect(await run.exit).not.toBe(0);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toMatch(/too many arguments|unknown/i);
		expect(run.context.execCalls).toEqual([]);
		expect(run.context.textGeneratorCalls).toEqual([]);
	});
});
