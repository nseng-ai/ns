import { describe, expect, test } from "vitest";

import { FLOW_SUBMIT_CHECK_FAILURE_MARKER } from "../../src/api/index.ts";

describe("flow capability API", () => {
	test("exports the exact submit-check failure marker", () => {
		expect(FLOW_SUBMIT_CHECK_FAILURE_MARKER).toBe("NS_FLOW_SUBMIT_CHECK_FAILURE");
	});
});
