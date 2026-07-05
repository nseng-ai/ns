import { describe, expect, test } from "vitest";

import { listNsCommands } from "@ns/kernel/cli";

import { runCliWithFakes } from "./ns-cli-fakes.ts";

function runUnavailableRegeneratePrCli(args: readonly string[]) {
	return runCliWithFakes(
		{ args, state: { exec: [], textGeneration: [] } },
		{
			execResponses: () => [],
			textGenerationResults: () => [],
		},
	);
}

describe("ns flow regenerate-pr CLI availability", () => {
	test("regenerate-pr is not registered as a built-in command after the kernel reset", () => {
		expect(listNsCommands().some((command) => command.name === "regenerate-pr")).toBe(false);
	});

	test("regenerate-pr help and invocation are unavailable without a project extension", async () => {
		const help = runUnavailableRegeneratePrCli(["flow", "regenerate-pr", "--help"]);
		expect(await help.exit).toBe(0);
		expect(help.stdout.join("")).toContain("Usage: ns");
		expect(help.stdout.join("")).not.toContain("Usage: ns flow regenerate-pr");

		for (const args of [
			["flow", "regenerate-pr"],
			["flow", "regenerate-pr", "--force"],
		] as const) {
			const run = runUnavailableRegeneratePrCli(args);

			expect(await run.exit).not.toBe(0);
			expect(run.stdout.join("")).toBe("");
			expect(run.stderr.join("")).toMatch(/too many arguments|unknown/i);
			expect(run.context.execCalls).toEqual([]);
			expect(run.context.textGeneratorCalls).toEqual([]);
		}
	});
});
