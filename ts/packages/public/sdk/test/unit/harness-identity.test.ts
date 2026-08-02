import { describe, expect, test } from "vitest";

import {
	ALL_HARNESS_IDS,
	isHarnessId,
	normalizeHarnessInvocationValue,
	NS_HARNESS_ENV_VAR,
	resolveActiveHarness,
	validateSupportedHarnesses,
} from "../../src/project-config/harness-identity.ts";

describe("harness identity", () => {
	test("canonical ids are stable", () => {
		expect(ALL_HARNESS_IDS).toEqual(["claude-code", "codex", "pi"]);
		expect(NS_HARNESS_ENV_VAR).toBe("NS_HARNESS");
	});

	test.each([
		["pi", "pi"],
		["pi-dev", "pi"],
		["claude-code", "claude-code"],
		["claude", "claude-code"],
		["codex", "codex"],
		["  Codex  ", "codex"],
		["CLAUDE", "claude-code"],
	] as const)("invocation value %s normalizes to %s", (input, expected) => {
		expect(normalizeHarnessInvocationValue(input)).toBe(expected);
	});

	test.each(["", "  ", "browser", "pi2"])("invocation value %j does not normalize", (input) => {
		expect(normalizeHarnessInvocationValue(input)).toBeUndefined();
	});

	test("isHarnessId accepts canonical ids only", () => {
		expect(isHarnessId("pi")).toBe(true);
		expect(isHarnessId("claude")).toBe(false);
		expect(isHarnessId("pi-dev")).toBe(false);
	});

	test.each([
		["missing env", undefined, { type: "unset" }],
		["missing variable", {}, { type: "unset" }],
		["blank", { NS_HARNESS: "   " }, { type: "unset" }],
		["unknown", { NS_HARNESS: "browser" }, { type: "unknown", value: "browser" }],
		["canonical", { NS_HARNESS: "pi" }, { type: "resolved", harness: "pi" }],
		["alias", { NS_HARNESS: "claude" }, { type: "resolved", harness: "claude-code" }],
	] as const)("resolveActiveHarness handles %s", (_name, env, expected) => {
		expect(resolveActiveHarness(env)).toEqual(expected);
	});

	test("persisted supported harnesses accept canonical ids and deduplicate", () => {
		expect(validateSupportedHarnesses(["pi", "claude-code", "pi"])).toEqual({
			type: "ok",
			harnesses: ["pi", "claude-code"],
		});
	});

	test.each([
		["alias", ["claude"]],
		["unknown", ["browser"]],
		["empty", []],
	] as const)("persisted supported harnesses reject %s lists", (_name, values) => {
		expect(validateSupportedHarnesses(values).type).toBe("invalid");
	});
});
