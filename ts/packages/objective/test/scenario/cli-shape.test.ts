import { describe, expect, test } from "vitest";

import { runScenario } from "../support/run-scenario.ts";

describe("objective CLI shape", () => {
	test("prints version and TypeScript runtime diagnostics", async () => {
		const version = runScenario(["--version"]);
		expect(await version.exit).toBe(0);
		expect(version.stdout.join("")).toBe("0.1.0\n");
		expect(version.stderr.join("")).toBe("");

		const runtime = runScenario(["--runtime"]);
		expect(await runtime.exit).toBe(0);
		expect(runtime.stdout.join("")).toBe("runtime: typescript\nentry_point: @asdl/objective bin objective -> ts/packages/objective/src/cli.ts\n");
		expect(runtime.stderr.join("")).toBe("");
	});

	test("top-level help hides exec while exec help exposes objective skill commands", async () => {
		const topLevel = runScenario(["--help"]);
		expect(await topLevel.exit).toBe(0);
		expect(topLevel.stderr.join("")).toBe("");
		const topLevelHelp = topLevel.stdout.join("");
		expect(topLevelHelp).toContain("Usage: objective");
		expect(topLevelHelp).toContain("Work with checked-in Objective records.");
		expect(topLevelHelp).toContain("--runtime");
		expect(topLevelHelp).not.toContain("exec");

		const execHelp = runScenario(["exec", "--help"]);
		expect(await execHelp.exit).toBe(0);
		expect(execHelp.stderr.join("")).toBe("");
		const execOutput = execHelp.stdout.join("");
		expect(execOutput).toContain("Usage: objective exec");
		expect(execOutput).toContain("Commands for use by objective skills.");
		expect(execOutput).toContain("list-candidates");
		expect(execOutput).toContain("read-objective");

		const readHelp = runScenario(["exec", "read-objective", "--help"]);
		expect(await readHelp.exit).toBe(0);
		expect(readHelp.stderr.join("")).toBe("");
		expect(readHelp.stdout.join("")).toContain("Usage: objective exec read-objective");
		expect(readHelp.stdout.join("")).toContain("Read one Objective record by explicit slug");
	});
});
