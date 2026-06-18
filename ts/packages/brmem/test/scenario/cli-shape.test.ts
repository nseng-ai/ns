import { describe, expect, it } from "vitest";

import { runScenario } from "../support/run-scenario.ts";

describe("brmem CLI shape", () => {
	it("prints version and TypeScript runtime diagnostics", async () => {
		const version = runScenario(["--version"]);
		expect(await version.exit).toBe(0);
		expect(version.stdout.join("")).toContain("0.1.0");

		const runtime = runScenario(["--runtime"]);
		expect(await runtime.exit).toBe(0);
		expect(runtime.stdout.join("")).toContain("runtime: typescript");
		expect(runtime.stdout.join("")).toContain("ts/packages/brmem/src/cli.ts");
	});

	it("shows visible commands while hiding exec from top-level help", async () => {
		const run = runScenario(["--help"]);
		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		for (const command of [
			"put",
			"get",
			"delete",
			"list",
			"check",
			"copy",
			"export",
			"setup-git",
		]) {
			expect(help).toContain(command);
		}
		expect(help).not.toContain("resolve-prompt");
	});

	it("keeps hidden exec resolve-prompt invocable", async () => {
		const run = runScenario(["exec", "resolve-prompt", "some", "--format", "json"]);
		expect(await run.exit).toBe(2);
		expect(JSON.parse(run.stdout.join(""))).toMatchObject({
			exit_code: 2,
			error_type: "prompt-not-found",
		});
	});
});
