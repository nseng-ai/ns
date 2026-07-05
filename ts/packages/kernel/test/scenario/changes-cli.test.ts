import { describe, expect, test } from "vitest";

import { listNsCommands } from "@ns/kernel/cli";

import { runCliWithFakes } from "./ns-cli-fakes.ts";

function runUnavailableChangesCli(args: readonly string[]) {
	return runCliWithFakes(
		{ args, state: { exec: [], textGeneration: [] } },
		{
			execResponses: () => [],
			textGenerationResults: () => [],
		},
	);
}

describe("ns flow changes CLI availability", () => {
	test("static ns command metadata is empty after the kernel reset", async () => {
		expect(listNsCommands()).toEqual([]);

		const topHelp = runUnavailableChangesCli(["--help"]);
		expect(await topHelp.exit).toBe(0);
		const help = topHelp.stdout.join("");
		expect(help).toContain("Usage: ns");
		expect(help).not.toContain("changes");
		expect(help).not.toContain("cp");
		expect(help).not.toContain("submit");
		expect(help).not.toContain("regenerate-pr");
		expect(topHelp.stderr.join("")).toBe("");
	});

	test("changes help and invocation are unavailable without a project extension", async () => {
		const help = runUnavailableChangesCli(["flow", "changes", "--help"]);
		expect(await help.exit).toBe(0);
		expect(help.stdout.join("")).toContain("Usage: ns");
		expect(help.stdout.join("")).not.toContain("Usage: ns flow changes");

		const run = runUnavailableChangesCli(["flow", "changes"]);
		expect(await run.exit).not.toBe(0);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toMatch(/too many arguments|unknown/i);
		expect(run.context.execCalls).toEqual([]);
		expect(run.context.textGeneratorCalls).toEqual([]);
	});
});
