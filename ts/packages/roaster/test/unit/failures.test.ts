import { describe, expect, test } from "vitest";

import { failureMessage, isFailureOfType, type RoasterFailure, type RoasterResult } from "../../src/failures.ts";

describe("roaster failures", () => {
	test("narrows semantic failure variants by type", () => {
		const failure: RoasterFailure = { type: "git_diff_failed", message: "git diff failed", command: ["git", "diff"], stderr: "fatal", code: 128 };

		expect(isFailureOfType(failure, "git_diff_failed")).toBe(true);
		if (isFailureOfType(failure, "git_diff_failed")) {
			expect(failure.stderr).toBe("fatal");
		}
	});

	test("uses result unions for expected failures", () => {
		const result: RoasterResult<string> = { type: "error", error: { type: "base_ref_unavailable", message: "Pass --base-ref explicitly." } };

		expect(result.type).toBe("error");
		if (result.type === "error") {
			expect(failureMessage(result.error)).toContain("base-ref");
		}
	});
});
