import { describe, expect, test } from "vitest";

import { decideUserExtensionLayer } from "../../src/extensions/user-extension-layer.ts";

describe("user extension layer decision", () => {
	test.each([
		[{}, { type: "configured", harnesses: ["pi"] }, "active-harness-unset"],
		[
			{ NS_HARNESS: "browser" },
			{ type: "configured", harnesses: ["pi"] },
			"active-harness-unknown",
		],
		[{ NS_HARNESS: "pi" }, { type: "missing" }, "supported-harnesses-missing"],
		[{ NS_HARNESS: "pi" }, { type: "invalid" }, "supported-harnesses-invalid"],
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
});
