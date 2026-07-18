import { describe, expect, test } from "vitest";

import { reviewDisplayRole, reviewRoleLabel } from "../../src/core/review-display.ts";

describe("review display roles", () => {
	test("derives tripwire display from the review name suffix", () => {
		expect(reviewDisplayRole("ns-typescript-style-tripwire")).toBe("tripwire");
		expect(reviewRoleLabel("ns-typescript-style-tripwire")).toBe("Tripwire");
	});

	test("does not give the fast profile alias behavioral meaning", () => {
		expect(reviewDisplayRole("fast")).toBe("deep_review");
		expect(reviewRoleLabel("code-smell-review")).toBe("Deep review");
	});
});
