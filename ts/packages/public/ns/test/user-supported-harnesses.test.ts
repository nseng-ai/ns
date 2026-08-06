import { describe, expect, test } from "vitest";

import {
	decideUserExtensionLifecycleGate,
	parseUserSupportedHarnessesFacts,
} from "../src/init/user-extension-lifecycle.ts";

const configPath = "/home/test/.config/ns/ns.toml";

describe("user lifecycle supported harness facts", () => {
	test("missing configuration is an explicit empty configured set", () => {
		expect(parseUserSupportedHarnessesFacts('extensions = ["/tools"]\n', configPath)).toEqual({
			type: "missing",
			harnesses: [],
		});
	});

	test("valid canonical ids are validated and deduplicated", () => {
		expect(
			parseUserSupportedHarnessesFacts('supported_harnesses = ["pi", "codex", "pi"]\n', configPath),
		).toEqual({ type: "configured", harnesses: ["pi", "codex"] });
	});

	test("reports gate state from parsed facts without requiring NS_HARNESS for administration", () => {
		const supportedHarnesses = parseUserSupportedHarnessesFacts(
			'supported_harnesses = ["pi"]\n',
			configPath,
		);

		expect(decideUserExtensionLifecycleGate({ env: {}, supportedHarnesses })).toEqual({
			enabled: false,
			reason: { type: "active-harness-unset" },
		});
		expect(
			decideUserExtensionLifecycleGate({ env: { NS_HARNESS: "pi" }, supportedHarnesses }),
		).toEqual({ enabled: true, activeHarness: "pi", supportedHarnesses: ["pi"] });
	});

	test.each([
		["malformed", 'supported_harnesses = "pi"\n'],
		["empty", "supported_harnesses = []\n"],
		["alias", 'supported_harnesses = ["claude"]\n'],
	] as const)("%s values fail with the user config source", (_label, content) => {
		const result = parseUserSupportedHarnessesFacts(content, configPath);

		expect(result).toMatchObject({
			type: "invalid",
			harnesses: [],
			error: { code: "user-supported-harnesses-invalid", path: configPath },
		});
		if (result.type === "invalid") expect(result.error.message).toContain(configPath);
	});
});
