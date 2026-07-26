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
		expect(runtime.stdout.join("")).toContain("ts/packages/internal/dev/ns-dev/src/cli.ts");
	});

	it("shows flat workflow commands in help", async () => {
		const help = runScenario(["--help"]);
		expect(await help.exit).toBe(0);
		const stdout = help.stdout.join("");
		expect(stdout).toContain("create-local-ns-project");
		expect(stdout).toContain("install-local-ns-extension");
		for (const command of [
			"bump-public-package-version",
			"prepare-source-publish-package",
			"publish-public-package-set",
			"qualify-public-package-set",
			"release-public-package-set",
			"reset-public-package-release",
			"render-cli-shim",
			"smoke-sdk-consumer-resolution",
			"verify-public-package-set",
		])
			expect(stdout).toContain(command);

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

		const releaseHelp = runScenario(["release-public-package-set", "--help"]);
		expect(await releaseHelp.exit).toBe(0);
		expect(releaseHelp.stdout.join("")).toContain("--plan");

		const resetHelp = runScenario(["reset-public-package-release", "--help"]);
		expect(await resetHelp.exit).toBe(0);
		const resetHelpText = resetHelp.stdout.join("");
		expect(resetHelpText).toContain("<version>");
		expect(resetHelpText).toContain("--dry-run");
		expect(resetHelpText).toContain("-n");
		expect(resetHelpText).toContain("--yes");
		expect(resetHelpText).toContain("-y");

		const resetSchema = runScenario(["reset-public-package-release", "--json-schema"]);
		expect(await resetSchema.exit).toBe(0);
		expect(JSON.parse(resetSchema.stdout.join(""))).toMatchObject({
			machineEnvelopeJsonSchema: { oneOf: expect.any(Array) },
		});

		const publishHelp = runScenario(["publish-public-package-set", "--help"]);
		expect(await publishHelp.exit).toBe(0);
		expect(publishHelp.stdout.join("")).toContain("--verify-delay-ms");
		expect(publishHelp.stdout.join("")).toContain("--verify-delay-seconds");

		const schema = runScenario(["verify-public-package-set", "--json-schema"]);
		expect(await schema.exit).toBe(0);
		expect(JSON.parse(schema.stdout.join(""))).toMatchObject({
			machineEnvelopeJsonSchema: { oneOf: expect.any(Array) },
		});
	});
});
