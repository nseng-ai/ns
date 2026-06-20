import { describe, expect, test } from "vitest";

import {
	availableResult,
	FakeNpmPublishGateway,
	FakePackageRegistryGateway,
	FakePypiPublishGateway,
	takenResult,
} from "../../src/index.ts";
import { runPackagechk } from "./support.ts";

const SAMPLE = "sample-name";

describe("packagechk claim commands", () => {
	test("claim-pypi dry-run avoids external effects", async () => {
		const registry = new FakePackageRegistryGateway();
		const publisher = new FakePypiPublishGateway({
			artifacts: ["dist/sample-0.0.1.tar.gz", "dist/sample-0.0.1-py3-none-any.whl"],
		});

		const run = await runPackagechk(["claim-pypi", "Foo_Bar", "--dry-run"], {
			registryGateway: registry,
			pypiPublishGateway: publisher,
		});

		expect(run.code).toBe(0);
		expect(run.stderr).toContain("[DRY RUN]");
		expect(run.stderr).toContain("PyPI lookup name: foo-bar");
		expect(run.stderr).toContain("Module name: foo_bar");
		expect(registry.pypiCheckedNames).toEqual([]);
		expect(publisher.toolChecks).toBe(0);
		expect(publisher.builtProjectDirs).toEqual([]);
		expect(publisher.publishedArtifacts).toEqual([]);
	});

	test("claim-pypi gates taken names before publish effects", async () => {
		const registry = new FakePackageRegistryGateway({
			pypiResults: {
				[SAMPLE]: takenResult("pypi", {
					inputName: SAMPLE,
					lookupName: SAMPLE,
					packageUrl: "https://pypi.org/project/sample-name/",
				}),
			},
		});
		const publisher = new FakePypiPublishGateway({ artifacts: ["dist/sample.tar.gz"] });

		const run = await runPackagechk(["claim-pypi", SAMPLE, "--force"], {
			registryGateway: registry,
			pypiPublishGateway: publisher,
		});

		expect(run.code).toBe(1);
		expect(run.stderr).toContain("pypi: taken");
		expect(registry.pypiCheckedNames).toEqual([SAMPLE]);
		expect(publisher.toolChecks).toBe(0);
		expect(publisher.builtProjectDirs).toEqual([]);
	});

	test("claim-pypi publishes after successful precheck", async () => {
		const registry = new FakePackageRegistryGateway({
			pypiResults: { [SAMPLE]: availableResult("pypi", { inputName: SAMPLE, lookupName: SAMPLE }) },
		});
		const artifacts = ["dist/sample-0.0.1.tar.gz", "dist/sample-0.0.1-py3-none-any.whl"];
		const publisher = new FakePypiPublishGateway({ artifacts });

		const run = await runPackagechk(["claim-pypi", SAMPLE, "--force"], {
			registryGateway: registry,
			pypiPublishGateway: publisher,
		});

		expect(run.code).toBe(0);
		expect(run.stderr).toContain("✓ Claimed PyPI package name 'sample-name'.");
		expect(registry.pypiCheckedNames).toEqual([SAMPLE]);
		expect(publisher.toolChecks).toBe(1);
		expect(publisher.builtProjectDirs).toHaveLength(1);
		expect(publisher.publishedArtifacts).toEqual([artifacts]);
	});

	test("claim-pypi confirmation decline aborts before build", async () => {
		const registry = new FakePackageRegistryGateway({
			pypiResults: { [SAMPLE]: availableResult("pypi", { inputName: SAMPLE, lookupName: SAMPLE }) },
		});
		const publisher = new FakePypiPublishGateway({ artifacts: ["dist/sample.tar.gz"] });

		const run = await runPackagechk(["claim-pypi", SAMPLE], {
			registryGateway: registry,
			pypiPublishGateway: publisher,
			stdin: async () => "n\n",
		});

		expect(run.code).toBe(1);
		expect(run.stderr).toContain("Warning: this will publish a real package to PyPI.");
		expect(run.stderr).toContain("Aborted by user.");
		expect(publisher.toolChecks).toBe(1);
		expect(publisher.builtProjectDirs).toEqual([]);
	});

	test("claim-npm dry-run and scoped publish preserve package names", async () => {
		const registry = new FakePackageRegistryGateway({
			npmResults: {
				"@asdl-io/aretro": availableResult("npm", {
					inputName: "@asdl-io/aretro",
					lookupName: "@asdl-io/aretro",
				}),
			},
		});
		const publisher = new FakeNpmPublishGateway();

		const dryRun = await runPackagechk(["claim-npm", "@asdl-io/aretro", "--dry-run"], {
			registryGateway: registry,
			npmPublishGateway: publisher,
		});
		expect(dryRun.code).toBe(0);
		expect(dryRun.stderr).toContain("Package name: @asdl-io/aretro");
		expect(dryRun.stderr).toContain("npm URL: https://www.npmjs.com/package/@asdl-io/aretro");
		expect(publisher.toolChecks).toBe(0);

		const published = await runPackagechk(["claim-npm", "@asdl-io/aretro", "--force"], {
			registryGateway: registry,
			npmPublishGateway: publisher,
		});
		expect(published.code).toBe(0);
		expect(published.stderr).toContain("✓ Claimed npm package name '@asdl-io/aretro'.");
		expect(registry.npmCheckedNames).toEqual(["@asdl-io/aretro"]);
		expect(publisher.toolChecks).toBe(1);
		expect(publisher.publishedProjectDirs).toHaveLength(1);
	});
});
