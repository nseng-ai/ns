import { describe, expect, test } from "vitest";

import type { ReviewFailure, ReviewResult } from "../../src/core/failures.ts";

describe("reviews failures", () => {
	test("carry the consumed failure shape", () => {
		const failure: ReviewFailure = {
			code: "git-diff-failed",
			message: "git diff failed",
		};

		expect(failure).toEqual({ code: "git-diff-failed", message: "git diff failed" });
	});

	test("uses result unions for expected failures", () => {
		const result: ReviewResult<string> = {
			ok: false,
			error: { code: "base-ref-unavailable", message: "Pass --base-ref explicitly." },
		};

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.message).toContain("base-ref");
		}
	});
});
