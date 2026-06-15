import { describe, expect, test } from "vitest";

import { runScenario } from "../support/run-scenario.ts";

describe("areg CLI shape", () => {
	test("prints version and TypeScript runtime diagnostics", async () => {
		const version = runScenario(["--version"]);
		expect(await version.exit).toBe(0);
		expect(version.stdout.join("")).toBe("0.1.0\n");
		expect(version.stderr.join("")).toBe("");

		const runtime = runScenario(["--runtime"]);
		expect(await runtime.exit).toBe(0);
		expect(runtime.stdout.join("")).toBe("runtime: typescript\nentry_point: @asdl/areg bin areg -> ts/packages/areg/src/cli.ts\n");
		expect(runtime.stderr.join("")).toBe("");
	});

	test("top-level help uses the areg command name and hides exec", async () => {
		const run = runScenario(["--help"]);

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toBe("");
		const help = run.stdout.join("");
		expect(help).toContain("Usage: areg");
		expect(help).toContain("Manage ASDL agent registry projects.");
		expect(help).toContain("--runtime");
		expect(help).toContain("init");
		expect(help).toContain("check");
		expect(help).toContain("update-skills");
		expect(help).toContain("skill");
		expect(help).not.toContain("exec");
		expect(help).not.toContain("skillx");
	});

	test("skill help exposes flattened list show and apply commands", async () => {
		const run = runScenario(["skill", "--help"]);

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toBe("");
		const help = run.stdout.join("");
		expect(help).toContain("Usage: areg skill");
		expect(help).toContain("list");
		expect(help).toContain("show");
		expect(help).toContain("apply");
		expect(help).toContain("apply [options] [kind] [skills...]");
	});

	test("init help exposes repeatable agent flag and no accidental agents flag", async () => {
		const run = runScenario(["init", "--help"]);

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toBe("");
		const help = run.stdout.join("");
		expect(help).toContain("Usage: areg init");
		expect(help).toContain("[target]");
		expect(help).toContain("--agent <value>");
		expect(help).toContain("--yes");
		expect(help).toContain("--no-append");
		expect(help).not.toContain("--agents");
	});

	test("keeps the hidden exec and skillx shell explicitly reachable", async () => {
		const execHelp = runScenario(["exec", "--help"]);
		expect(await execHelp.exit).toBe(0);
		expect(execHelp.stderr.join("")).toBe("");
		expect(execHelp.stdout.join("")).toContain("Usage: areg exec");
		expect(execHelp.stdout.join("")).toContain("skillx");

		const skillxHelp = runScenario(["exec", "skillx", "--help"]);
		expect(await skillxHelp.exit).toBe(0);
		expect(skillxHelp.stderr.join("")).toBe("");
		expect(skillxHelp.stdout.join("")).toContain("Usage: areg exec skillx");
		const skillxOutput = skillxHelp.stdout.join("");
		expect(skillxOutput).toContain("Skillx helper operations.");
		expect(skillxOutput).toContain("parse");
		expect(skillxOutput).toContain("list");
		expect(skillxOutput).toContain("fetch");
		expect(skillxOutput).toContain("cleanup");
	});
});
