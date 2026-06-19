import { describe, expect, it } from "vitest";

import { runScenario } from "../support/run-scenario.ts";

describe("vibechk CLI shape", () => {
	it("prints version and TypeScript runtime diagnostics", async () => {
		const version = runScenario(["--version"]);
		expect(await version.exit).toBe(0);
		expect(version.stdout.join("")).toContain("0.1.0");

		const runtime = runScenario(["--runtime"]);
		expect(await runtime.exit).toBe(0);
		expect(runtime.stdout.join("")).toContain("runtime: typescript");
		expect(runtime.stdout.join("")).toContain("ts/packages/vibechk/src/cli.ts");
	});

	it("shows top-level help with read-only commands", async () => {
		const run = runScenario(["--help"]);
		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("vibechk");
		expect(help).toContain("Run lightweight agent context evals");
		for (const command of ["run", "runs", "show", "diff"]) {
			expect(help).toContain(command);
		}
	});

	it("rejects the run command as not yet implemented", async () => {
		const run = runScenario(["run", "plan.md"]);
		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("not yet implemented");
		expect(run.stderr.join("")).toContain("Use the Python version");
	});
});
