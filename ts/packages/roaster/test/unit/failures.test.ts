import { describe, expect, test } from "vitest";

import type { RoasterFailure, RoasterResult } from "../../src/failures.ts";

describe("roaster failures", () => {
	test("carry the consumed failure shape", () => {
		const failure: RoasterFailure = {
			type: "git_diff_failed",
			message: "git diff failed",
		};

		expect(failure).toEqual({ type: "git_diff_failed", message: "git diff failed" });
	});

	test("uses result unions for expected failures", () => {
		const result: RoasterResult<string> = {
			type: "error",
			error: { type: "base_ref_unavailable", message: "Pass --base-ref explicitly." },
		};

		expect(result.type).toBe("error");
		if (result.type === "error") {
			expect(result.error.message).toContain("base-ref");
		}
	});
});
