import { describe, expect, test } from "vitest";

import { listSdlCommands } from "@sdl/sdl/cli";

import { runCliWithFakes } from "./sdl-cli-fakes.ts";

function runWithFakes(args: readonly string[]) {
	return runCliWithFakes(
		{ args, state: { exec: [], textGeneration: [] } },
		{
			execResponses: () => [],
			textGenerationResults: () => [],
		},
	);
}

describe("sdl regenerate-pr CLI", () => {
	test("regenerate-pr is not registered as a built-in command after the kernel reset", () => {
		expect(listSdlCommands().some((command) => command.name === "regenerate-pr")).toBe(false);
	});

	test("regenerate-pr help and invocation are unavailable rather than stubbed", async () => {
		const help = runWithFakes(["regenerate-pr", "--help"]);
		expect(await help.exit).toBe(0);
		expect(help.stdout.join("")).toContain("Usage: sdl");
		expect(help.stdout.join("")).not.toContain("Usage: sdl regenerate-pr");

		for (const args of [["regenerate-pr"], ["regenerate-pr", "--force"]] as const) {
			const run = runWithFakes(args);

			expect(await run.exit).not.toBe(0);
			expect(run.stdout.join("")).toBe("");
			expect(run.stderr.join("")).toMatch(/too many arguments|unknown/i);
			expect(run.context.execCalls).toEqual([]);
			expect(run.context.modelCalls).toEqual([]);
		}
	});
});
