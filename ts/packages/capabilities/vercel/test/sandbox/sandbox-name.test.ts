import { describe, expect, it } from "vitest";

import { isSafeSandboxName } from "../../src/sandbox/sandbox-name.ts";

describe("isSafeSandboxName", () => {
	it.each([
		["one character", "a"],
		["allowed punctuation", "sandbox.name_with-punctuation"],
		["the 128-character maximum", `a${"-".repeat(127)}`],
	])("accepts %s", (_case, name) => {
		expect(isSafeSandboxName(name)).toBe(true);
	});

	it.each([
		["an empty name", ""],
		["leading punctuation", "-sandbox"],
		["whitespace", "sandbox name"],
		["a slash", "sandbox/name"],
		["Unicode", "sandbox-é"],
		["a 129-character name", `a${"-".repeat(128)}`],
	])("rejects %s", (_case, name) => {
		expect(isSafeSandboxName(name)).toBe(false);
	});
});
