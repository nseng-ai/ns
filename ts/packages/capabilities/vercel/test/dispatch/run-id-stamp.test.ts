import { describe, expect, test } from "vitest";

import {
	buildDispatchRunIdStamp,
	composeAnchorPrDescriptionWithRunIdStamp,
	isValidDispatchRunId,
	parseDispatchRunIdStamp,
} from "../../src/dispatch/run-id-stamp.ts";

describe("dispatch run-id stamp", () => {
	test("round-trips a stamped run id through a PR description", () => {
		const body = composeAnchorPrDescriptionWithRunIdStamp(
			"Anchor PR body.\n\n## Dispatched prompt\n\ntext",
			"wf_run_0123:abc-DEF.9",
		);
		expect(parseDispatchRunIdStamp(body)).toBe("wf_run_0123:abc-DEF.9");
		expect(body).toContain("**Workflow run id:** `wf_run_0123:abc-DEF.9`");
	});

	test("stamping is idempotent and replaces a previous stamp in place", () => {
		const first = composeAnchorPrDescriptionWithRunIdStamp("Body.", "run-one");
		const second = composeAnchorPrDescriptionWithRunIdStamp(first, "run-one");
		expect(second).toBe(first);
		const replaced = composeAnchorPrDescriptionWithRunIdStamp(first, "run-two");
		expect(parseDispatchRunIdStamp(replaced)).toBe("run-two");
		expect(replaced).not.toContain("run-one");
		expect(replaced.split("\n").length).toBe(first.split("\n").length);
	});

	test("stamps an empty or null body as the stamp alone", () => {
		expect(composeAnchorPrDescriptionWithRunIdStamp(null, "run-x")).toBe(
			buildDispatchRunIdStamp("run-x"),
		);
		expect(composeAnchorPrDescriptionWithRunIdStamp("   \n", "run-x")).toBe(
			buildDispatchRunIdStamp("run-x"),
		);
	});

	test("parse returns null for absent or malformed stamps", () => {
		expect(parseDispatchRunIdStamp(null)).toBeNull();
		expect(parseDispatchRunIdStamp("no stamp here")).toBeNull();
		expect(parseDispatchRunIdStamp("<!-- ns-dispatch:run-id:bad id -->")).toBeNull();
		expect(parseDispatchRunIdStamp("<!-- ns-dispatch:run-id:unterminated")).toBeNull();
	});

	test("parse skips an invalid marker and finds a later valid one", () => {
		const body = [
			"<!-- ns-dispatch:run-id:has space -->",
			"<!-- ns-dispatch:run-id:valid-run -->",
		].join("\n");
		expect(parseDispatchRunIdStamp(body)).toBe("valid-run");
	});

	test("run-id validation bounds length and charset", () => {
		expect(isValidDispatchRunId("wf_run_1")).toBe(true);
		expect(isValidDispatchRunId("")).toBe(false);
		expect(isValidDispatchRunId("a".repeat(257))).toBe(false);
		expect(isValidDispatchRunId("has space")).toBe(false);
		expect(isValidDispatchRunId("closes-->comment")).toBe(false);
		expect(isValidDispatchRunId("back`tick")).toBe(false);
	});
});
