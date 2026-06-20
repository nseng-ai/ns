import { describe, expect, test } from "vitest";

import {
	availableResult,
	FakePackageRegistryGateway,
	RealPackageRegistryGateway,
	takenResult,
} from "../../src/index.ts";
import { runPackagechk } from "./support.ts";

const SAMPLE = "sample-name";

describe("packagechk CLI", () => {
	test("shows help and runtime diagnostics", async () => {
		const help = await runPackagechk(["--help"]);
		expect(help.code).toBe(0);
		expect(help.stdout).toContain("Usage: packagechk");
		expect(help.stdout).toContain("Check whether a package name is available to claim.");
		expect(help.stdout).toContain("--registry");
		expect(help.stdout).toContain("--json");
		expect(help.stdout).toContain("claim-pypi");
		expect(help.stdout).toContain("claim-npm");

		const runtime = await runPackagechk(["--runtime"]);
		expect(runtime).toEqual({
			code: 0,
			stdout:
				"runtime: typescript\nentry_point: @asdl/packagechk bin packagechk -> ts/packages/packagechk/src/cli.ts\n",
			stderr: "",
		});
	});

	test("checks default registries with injected gateway", async () => {
		const gateway = new FakePackageRegistryGateway({
			pypiResults: { [SAMPLE]: availableResult("pypi", { inputName: SAMPLE, lookupName: SAMPLE }) },
			npmResults: { [SAMPLE]: takenResult("npm", { inputName: SAMPLE, lookupName: SAMPLE }) },
			brewResults: { [SAMPLE]: availableResult("brew", { inputName: SAMPLE, lookupName: SAMPLE }) },
		});

		const run = await runPackagechk([SAMPLE], { registryGateway: gateway });

		expect(run.code).toBe(1);
		expect(splitLines(run.stdout)).toEqual(["pypi: available", "npm: taken", "brew: available"]);
		expect(run.stderr).toBe("");
		expect(gateway.pypiCheckedNames).toEqual([SAMPLE]);
		expect(gateway.npmCheckedNames).toEqual([SAMPLE]);
		expect(gateway.brewCheckedNames).toEqual([SAMPLE]);
	});

	test("emits schema-versioned JSON", async () => {
		const gateway = new FakePackageRegistryGateway({
			pypiResults: {
				[SAMPLE]: takenResult("pypi", {
					inputName: SAMPLE,
					lookupName: SAMPLE,
					packageUrl: "https://pypi.org/project/sample-name/",
					latestVersion: "1.2.3",
					description: "Sample PyPI package",
				}),
			},
		});

		const run = await runPackagechk([SAMPLE, "--registry", "pypi", "--json"], {
			registryGateway: gateway,
		});

		expect(run.code).toBe(1);
		expect(JSON.parse(run.stdout)).toEqual({
			exit_code: 1,
			name: SAMPLE,
			schema_version: 1,
			results: [
				{
					description: "Sample PyPI package",
					input_name: SAMPLE,
					latest_version: "1.2.3",
					lookup_name: SAMPLE,
					message: "pypi package name is already taken",
					package_url: "https://pypi.org/project/sample-name/",
					registry: "pypi",
					status: "taken",
				},
			],
		});
	});

	test("supports root options before the package name", async () => {
		const gateway = new FakePackageRegistryGateway({
			pypiResults: { [SAMPLE]: availableResult("pypi", { inputName: SAMPLE, lookupName: SAMPLE }) },
		});

		const run = await runPackagechk(["--registry", "pypi", SAMPLE], { registryGateway: gateway });

		expect(run).toMatchObject({ code: 0, stdout: "pypi: available\n", stderr: "" });
		expect(gateway.pypiCheckedNames).toEqual([SAMPLE]);
		expect(gateway.npmCheckedNames).toEqual([]);
	});

	test("invalid registry uses packagechk validation", async () => {
		const run = await runPackagechk([SAMPLE, "--registry", "gems"]);

		expect(run.code).toBe(2);
		expect(run.stderr).toContain("expected one of pypi, npm, brew");
	});

	test("scoped npm lookup preserves registry and page URL encoding", async () => {
		const requestedUrls: string[] = [];
		const gateway = new RealPackageRegistryGateway({
			responseFetcher: async (url) => {
				requestedUrls.push(url);
				return {
					statusCode: 200,
					jsonBody: { "dist-tags": { latest: "1.0.0" }, description: "Scoped package" },
				};
			},
		});

		const run = await runPackagechk(["@asdl-io/aretro", "--registry", "npm"], {
			registryGateway: gateway,
		});

		expect(run.code).toBe(1);
		expect(requestedUrls).toEqual(["https://registry.npmjs.org/@asdl-io%2Faretro"]);
		expect(run.stdout).toContain("https://www.npmjs.com/package/@asdl-io/aretro");
	});

	test("real gateway preserves validation and metadata behavior", async () => {
		const available = new RealPackageRegistryGateway({
			responseFetcher: async () => ({ statusCode: 404 }),
		});
		expect(
			await runPackagechk(["Foo_Bar", "--registry", "pypi"], { registryGateway: available }),
		).toMatchObject({
			code: 0,
			stdout: "pypi: available as 'foo-bar'\n",
		});

		const taken = new RealPackageRegistryGateway({
			responseFetcher: async () => ({
				statusCode: 200,
				jsonBody: { info: { version: "1.2.3", summary: "Sample PyPI package" } },
			}),
		});
		expect(
			await runPackagechk([SAMPLE, "--registry", "pypi"], { registryGateway: taken }),
		).toMatchObject({
			code: 1,
			stdout:
				"pypi: taken — latest 1.2.3 — Sample PyPI package — https://pypi.org/project/sample-name/\n",
		});

		const invalid = await runPackagechk(["bad!name", "--registry", "pypi"], {
			registryGateway: available,
		});
		expect(invalid.code).toBe(2);
		expect(invalid.stderr).toContain("pypi: invalid");
		expect(invalid.stderr).toContain("must start and end");
	});
});

function splitLines(text: string): string[] {
	return text.trimEnd().split("\n");
}
