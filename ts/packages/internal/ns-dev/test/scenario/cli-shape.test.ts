import { describe, expect, it } from "vitest";

import { VERSION } from "../../src/cli.ts";
import { runScenario } from "./run-scenario.ts";

describe("ns-dev CLI shape", () => {
	it("prints version and TypeScript runtime diagnostics", async () => {
		const version = runScenario(["--version"]);
		expect(await version.exit).toBe(0);
		expect(version.stdout.join("")).toContain(VERSION);

		const runtime = runScenario(["--runtime"]);
		expect(await runtime.exit).toBe(0);
		expect(runtime.stdout.join("")).toContain("runtime: typescript");
		expect(runtime.stdout.join("")).toContain("ts/packages/internal/ns-dev/src/cli.ts");
	});

	it("shows flat workflow commands in help", async () => {
		const help = runScenario(["--help"]);
		expect(await help.exit).toBe(0);
		const stdout = help.stdout.join("");
		expect(stdout).toContain("create-local-ns-project");
		expect(stdout).toContain("install-local-ns-extension");

		const shortHelp = runScenario(["-h"]);
		expect(await shortHelp.exit).toBe(0);
		expect(shortHelp.stdout.join("")).toContain("Project-local development workflows");
	});

	it("shows command help", async () => {
		const createHelp = runScenario(["create-local-ns-project", "--help"]);
		expect(await createHelp.exit).toBe(0);
		expect(createHelp.stdout.join("")).toContain("--ns-worktree");

		const installHelp = runScenario(["install-local-ns-extension", "--help"]);
		expect(await installHelp.exit).toBe(0);
		expect(installHelp.stdout.join("")).toContain("--target");
	});
});
