import { describe, expect, test } from "vitest";

import { VERSION } from "../../src/cli.ts";
import { CLI_REL_PATH } from "../support/cli-rel-path.ts";
import { runScenario } from "../support/run-scenario.ts";

describe("areg CLI shape", () => {
	test("prints version and TypeScript runtime diagnostics", async () => {
		const version = runScenario(["--version"]);
		expect(await version.exit).toBe(0);
		expect(version.stdout.join("")).toBe(`${VERSION}\n`);
		expect(version.stderr.join("")).toBe("");

		const runtime = runScenario(["--runtime"]);
		expect(await runtime.exit).toBe(0);
		expect(runtime.stdout.join("")).toBe(
			`runtime: typescript\nentry_point: @nseng-ai/areg bin areg -> ${CLI_REL_PATH}\n`,
		);
		expect(runtime.stderr.join("")).toBe("");
	});

	test("top-level help uses the areg command name and hides exec", async () => {
		const run = runScenario(["--help"]);

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toBe("");
		const help = run.stdout.join("");
		expect(help).toContain("Usage: areg");
		expect(help).toContain("Manage ns agent registry projects.");
		expect(help).toContain("--runtime");
		expect(help).not.toContain("init");
		expect(help).toContain("check");
		expect(help).not.toContain("update-skills");
		expect(help).toContain("skill");
		expect(help).not.toContain("exec");
		expect(help).not.toContain("skillx");
	});

	test("skill help exposes flattened find list show and apply commands", async () => {
		const run = runScenario(["skill", "--help"]);

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toBe("");
		const help = run.stdout.join("");
		expect(help).toContain("Usage: areg skill");
		expect(help).toContain("find");
		expect(help).toContain("list");
		expect(help).toContain("show");
		expect(help).toContain("apply");
		expect(help).toContain("apply [options] [kind] [skills...]");
	});
});
