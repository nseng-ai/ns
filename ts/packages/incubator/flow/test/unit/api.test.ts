import { describe, expect, test } from "vitest";

import { FLOW_SUBMIT_CHECK_FAILURE_MARKER, runTrunkPullDetailed } from "../../src/api/index.ts";

describe("flow extension API", () => {
	test("exports the exact submit-check failure marker", () => {
		expect(FLOW_SUBMIT_CHECK_FAILURE_MARKER).toBe("NS_FLOW_SUBMIT_CHECK_FAILURE");
	});

	test("retains the trunk-pull extension function export", () => {
		expect(runTrunkPullDetailed).toBeTypeOf("function");
	});
});
