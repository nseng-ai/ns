import { describe, expect, test } from "vitest";

import {
	loadPreinstalledNsCommandSources,
	preinstalledCommandSources,
} from "../src/cli/preinstalled-command-catalog.ts";

describe("preinstalled ns command sources", () => {
	test("registers the host-owned init built-in source", () => {
		expect(preinstalledCommandSources).toHaveLength(1);
		expect(preinstalledCommandSources[0]).toMatchObject({
			label: "host:@nseng-ai/ns:init",
			kind: "built-in",
			helpClassification: "built-in",
			compose: expect.any(Function),
			package: {
				name: "@nseng-ai/ns",
				descriptorPath: "@nseng-ai/ns/init/ns-extension",
			},
		});
		expect(preinstalledCommandSources[0]).not.toHaveProperty("commandDirectory");
	});

	test("returns the stable source inventory without route enumeration", () => {
		expect(loadPreinstalledNsCommandSources()).toBe(preinstalledCommandSources);
	});
});
