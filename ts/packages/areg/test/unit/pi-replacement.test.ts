import { describe, expect, test } from "vitest";

import { derivePiReplacementCommand, formatReplacementLabel, verifyPiReplacement } from "../../src/operations/pi-replacement.ts";

describe("Pi replacement helpers", () => {
	test("uses specialized replacements before derived names", () => {
		expect(verifyPiReplacement("branch-context-from-plan", { verifiedSurfaces: [] })).toEqual({
			verified: false,
			surface: "branch-context:from-plan",
		});
		expect(verifyPiReplacement("branch-context-from-plan", { verifiedSurfaces: ["branch-context:from-plan"] })).toEqual({
			verified: true,
			surface: "branch-context:from-plan",
		});
	});

	test("derives replacements with longest namespace prefixes and first-hyphen fallback", () => {
		expect(derivePiReplacementCommand("objective-stack-impl")).toBe("objective:stack-impl");
		expect(derivePiReplacementCommand("branch-context-impl-extra")).toBe("branch-context:impl-extra");
		expect(derivePiReplacementCommand("foo-bar-baz")).toBe("foo:bar-baz");
		expect(derivePiReplacementCommand("plain")).toBeUndefined();
	});

	test("verifies derived replacements against the explicit surface inventory", () => {
		expect(verifyPiReplacement("foo-bar", { verifiedSurfaces: [] })).toEqual({ verified: false, surface: "foo:bar" });
		expect(verifyPiReplacement("foo-bar", { verifiedSurfaces: ["foo:bar"] })).toEqual({ verified: true, surface: "foo:bar" });
		expect(verifyPiReplacement("plain", { verifiedSurfaces: ["plain"] })).toEqual({ verified: false });
		expect(formatReplacementLabel({ verified: true, surface: "foo:bar" })).toBe("replacement-verified:foo:bar");
		expect(formatReplacementLabel({ verified: false })).toBe("replacement-missing");
	});
});
