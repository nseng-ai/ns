import { describe, expect, test } from "vitest";

import {
	loadPreinstalledNsCommandSources,
	preinstalledCommandSources,
} from "../src/cli/preinstalled-command-catalog.ts";

const expectedLabels = ["host:@nseng-ai/ns:init", "host:@nseng-ai/ns:harness-artifacts"] as const;

describe("preinstalled ns command sources", () => {
	test("registers exactly the two host-owned built-in sources", () => {
		expect(preinstalledCommandSources.map(({ label }) => label)).toEqual(expectedLabels);
		expect(preinstalledCommandSources.map(({ kind }) => kind)).toEqual(["built-in", "built-in"]);
		expect(preinstalledCommandSources.map(({ helpClassification }) => helpClassification)).toEqual([
			"built-in",
			"built-in",
		]);
		expect(preinstalledCommandSources.map(({ package: facts }) => facts?.name)).toEqual([
			"@nseng-ai/ns",
			"@nseng-ai/ns",
		]);
	});

	test("gives init one programmatic composition owner for lifecycle and point routes", () => {
		const [init, harnessArtifacts] = preinstalledCommandSources;

		expect(init).toMatchObject({
			label: "host:@nseng-ai/ns:init",
			compose: expect.any(Function),
			package: { descriptorPath: "@nseng-ai/ns/init/ns-extension" },
		});
		expect(init).not.toHaveProperty("commandDirectory");
		expect(harnessArtifacts).toMatchObject({
			label: "host:@nseng-ai/ns:harness-artifacts",
			commandDirectory: expect.any(String),
			package: { descriptorPath: "@nseng-ai/ns/harness-artifacts/ns-extension" },
		});
		expect(harnessArtifacts).not.toHaveProperty("compose");
	});

	test("returns the stable source inventory without route enumeration", () => {
		expect(loadPreinstalledNsCommandSources()).toBe(preinstalledCommandSources);
	});
});
