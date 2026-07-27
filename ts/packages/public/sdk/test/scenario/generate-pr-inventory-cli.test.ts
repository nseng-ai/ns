import { describe, expect, test } from "vitest";

import { listNsCommands } from "@nseng-ai/sdk/cli";

import { runCliWithFakes } from "./ns-cli-fakes.ts";

function runUnavailableGeneratePrInventoryCli(args: readonly string[]) {
	return runCliWithFakes(
		{ args, state: { exec: [], textGeneration: [] } },
		{
			execResponses: () => [],
			textGenerationResults: () => [],
		},
	);
}

describe("ns flow generate-pr-inventory CLI availability", () => {
	test("focused command is not registered as an SDK built-in", () => {
		expect(listNsCommands().some((command) => command.name === "generate-pr-inventory")).toBe(
			false,
		);
		expect(listNsCommands().some((command) => command.name === "regenerate-pr")).toBe(false);
	});

	test("focused command is unavailable without a project extension", async () => {
		const help = runUnavailableGeneratePrInventoryCli(["flow", "generate-pr-inventory", "--help"]);
		expect(await help.exit).toBe(0);
		expect(help.stdout.join("")).toContain("Usage: ns");
		expect(help.stdout.join("")).not.toContain("Usage: ns flow generate-pr-inventory");

		for (const args of [
			["flow", "generate-pr-inventory"],
			["flow", "generate-pr-inventory", "--force"],
		] as const) {
			const run = runUnavailableGeneratePrInventoryCli(args);

			expect(await run.exit).not.toBe(0);
			expect(run.stdout.join("")).toBe("");
			expect(run.stderr.join("")).toMatch(/too many arguments|unknown/i);
			expect(run.context.execCalls).toEqual([]);
			expect(run.context.textGeneratorCalls).toEqual([]);
		}
	});
});
