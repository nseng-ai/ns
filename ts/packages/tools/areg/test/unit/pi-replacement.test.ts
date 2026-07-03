import { describe, expect, test } from "vitest";

import {
	derivePiReplacementCommand,
	formatReplacementLabel,
	verifyPiReplacement,
} from "../../src/operations/pi-replacement.ts";

describe("Pi replacement helpers", () => {
	test("looks up replacements from the command-backed skill registry", () => {
		expect(verifyPiReplacement("branch-context-from-plan", { verifiedSurfaces: [] })).toEqual({
			verified: false,
			surface: "ji:branch-context:from-plan",
		});
		expect(
			verifyPiReplacement("branch-context-from-plan", {
				verifiedSurfaces: ["ji:branch-context:from-plan"],
			}),
		).toEqual({
			verified: true,
			surface: "ji:branch-context:from-plan",
		});
	});

	test("does not derive fallback replacements for unknown skills", () => {
		expect(derivePiReplacementCommand("objective-stack-impl")).toBe("sdl:objective:stack-impl");
		expect(derivePiReplacementCommand("branch-context-impl-extra")).toBeUndefined();
		expect(derivePiReplacementCommand("foo-bar-baz")).toBeUndefined();
		expect(derivePiReplacementCommand("plain")).toBeUndefined();
	});

	test("verifies registry replacements against the explicit surface inventory", () => {
		expect(verifyPiReplacement("code-workflows", { verifiedSurfaces: [] })).toEqual({
			verified: false,
			surface: "code:workflows",
		});
		expect(verifyPiReplacement("code-workflows", { verifiedSurfaces: ["code:workflows"] })).toEqual(
			{
				verified: true,
				surface: "code:workflows",
			},
		);
		expect(verifyPiReplacement("foo-bar", { verifiedSurfaces: ["foo:bar"] })).toEqual({
			verified: false,
		});
		expect(formatReplacementLabel({ verified: true, surface: "code:workflows" })).toBe(
			"replacement-verified:code:workflows",
		);
		expect(formatReplacementLabel({ verified: false })).toBe("replacement-missing");
	});
});
