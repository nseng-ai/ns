import { describe, expect, test } from "vitest";

import { listSdlCommands } from "@sdl/kernel/cli";

import { runCliWithFakes } from "./sdl-cli-fakes.ts";

function runUnavailableSubmitCli(args: readonly string[]) {
	return runCliWithFakes(
		{ args, state: { exec: [], textGeneration: [] } },
		{
			execResponses: () => [],
			textGenerationResults: () => [],
		},
	);
}

describe("sdl flow submit CLI availability", () => {
	test("submit is not registered as a built-in command after the kernel reset", () => {
		expect(listSdlCommands().some((command) => command.name === "submit")).toBe(false);
	});

	test("submit help and invocation are unavailable without a project extension", async () => {
		const help = runUnavailableSubmitCli(["flow", "submit", "--help"]);
		expect(await help.exit).toBe(0);
		expect(help.stdout.join("")).toContain("Usage: sdl");
		expect(help.stdout.join("")).not.toContain("Usage: sdl flow submit");

		for (const args of [
			["flow", "submit"],
			["flow", "submit", "--no-restack"],
		] as const) {
			const run = runUnavailableSubmitCli(args);

			expect(await run.exit).not.toBe(0);
			expect(run.stdout.join("")).toBe("");
			expect(run.stderr.join("")).toMatch(/too many arguments|unknown/i);
			expect(run.context.execCalls).toEqual([]);
			expect(run.context.textGeneratorCalls).toEqual([]);
		}
	});
});
