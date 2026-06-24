import { describe, expect, test } from "vitest";

import { buildCheckRowLabel } from "../src/pr-preview-checks-model.ts";
import { checkListRows } from "../src/pr-preview-checks-view.ts";

describe("PR checks preview vertical layout", () => {
	test("allocates rows for a full-width check list above selected details", () => {
		expect(checkListRows({ totalRows: 20, checkCount: 12 })).toBe(11);
		expect(checkListRows({ totalRows: 8, checkCount: 12 })).toBe(4);
		expect(checkListRows({ totalRows: 8, checkCount: 1 })).toBe(1);
	});

	test("keeps long check names available for full-width row rendering", () => {
		const label = buildCheckRowLabel({
			bucket: "failing",
			kind: "check_run",
			name: "very long integration test name that should not be pre-truncated by the model",
			workflow_name: "CI",
			status: "COMPLETED",
			conclusion: "FAILURE",
			state: null,
			started_at: null,
			completed_at: null,
			created_at: null,
			details_url: null,
			target_url: null,
			identity: null,
		});

		expect(label).toContain("very long integration test name that should not be pre-truncated");
		expect(label).not.toContain("…");
	});
});
