import { describe, expect, test } from "vitest";

import {
	ALL_HARNESS_IDS,
	isHarnessId,
	normalizeHarnessInvocationValue,
} from "../../src/project-config/harness-identity.ts";

describe("harness identity", () => {
	test("canonical ids are stable", () => {
		expect(ALL_HARNESS_IDS).toEqual(["claude-code", "codex", "pi"]);
	});

	test.each([
		["pi", "pi"],
		["pi-dev", "pi"],
		["claude-code", "claude-code"],
		["claude", "claude-code"],
		["codex", "codex"],
		["  Codex  ", "codex"],
		["CLAUDE", "claude-code"],
	] as const)("explicit invocation value %s normalizes to %s", (input, expected) => {
		expect(normalizeHarnessInvocationValue(input)).toBe(expected);
	});

	test.each(["", "  ", "browser", "pi2"])(
		"explicit invocation value %j does not normalize",
		(input) => {
			expect(normalizeHarnessInvocationValue(input)).toBeUndefined();
		},
	);

	test("isHarnessId accepts canonical ids only", () => {
		expect(isHarnessId("pi")).toBe(true);
		expect(isHarnessId("claude")).toBe(false);
		expect(isHarnessId("pi-dev")).toBe(false);
	});
});
