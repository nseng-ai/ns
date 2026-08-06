import { describe, expect, test } from "vitest";

import {
	decideUserExtensionLayer,
	parseUserSupportedHarnessesFacts,
	userSupportedHarnessesFactsFromSetting,
} from "../../src/extensions/user-extension-layer.ts";

describe("user extension layer decision", () => {
	test.each([
		[{}, { type: "configured", harnesses: ["pi"] }, "active-harness-unset"],
		[
			{ NS_HARNESS: "browser" },
			{ type: "configured", harnesses: ["pi"] },
			"active-harness-unknown",
		],
		[{ NS_HARNESS: "pi" }, { type: "missing", harnesses: [] }, "supported-harnesses-missing"],
		[
			{ NS_HARNESS: "pi" },
			{
				type: "invalid",
				harnesses: [],
				error: { code: "user-supported-harnesses-invalid", message: "invalid", path: "ns.toml" },
			},
			"supported-harnesses-invalid",
		],
		[
			{ NS_HARNESS: "codex" },
			{ type: "configured", harnesses: ["pi"] },
			"active-harness-unsupported",
		],
	] as const)("returns shared disabled reason %s", (env, supportedHarnesses, reason) => {
		const decision = decideUserExtensionLayer({ env, supportedHarnesses });
		expect(decision).toMatchObject({ enabled: false, reason: { type: reason } });
	});

	test("normalizes invocation aliases but reports canonical enabled facts", () => {
		expect(
			decideUserExtensionLayer({
				env: { NS_HARNESS: "claude" },
				supportedHarnesses: { type: "configured", harnesses: ["claude-code", "pi"] },
			}),
		).toEqual({
			enabled: true,
			activeHarness: "claude-code",
			supportedHarnesses: ["claude-code", "pi"],
		});
	});

	test("converts decoded settings into explicit canonical facts", () => {
		expect(userSupportedHarnessesFactsFromSetting(undefined, "/user/ns.toml")).toEqual({
			type: "missing",
			harnesses: [],
		});
		expect(
			userSupportedHarnessesFactsFromSetting(["pi", "claude-code", "pi"], "/user/ns.toml"),
		).toEqual({ type: "configured", harnesses: ["pi", "claude-code"] });
		expect(userSupportedHarnessesFactsFromSetting([], "/user/ns.toml")).toEqual({
			type: "invalid",
			harnesses: [],
			error: {
				code: "user-supported-harnesses-invalid",
				message: "/user/ns.toml: supported_harnesses must select at least one harness.",
				path: "/user/ns.toml",
			},
		});
	});

	test("parses TOML through the same canonical conversion", () => {
		expect(
			parseUserSupportedHarnessesFacts(
				'supported_harnesses = ["pi", "pi", "codex"]\n',
				"/user/ns.toml",
			),
		).toEqual({ type: "configured", harnesses: ["pi", "codex"] });
		expect(parseUserSupportedHarnessesFacts("extensions = []\n", "/user/ns.toml")).toEqual({
			type: "missing",
			harnesses: [],
		});
	});
});
