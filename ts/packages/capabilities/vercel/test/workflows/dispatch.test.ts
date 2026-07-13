import { describe, expect, it } from "vitest";

import { dispatchWorkflowId } from "../../workflows/dispatch-id.ts";
import { dispatchWorkflow, launchDispatchStep } from "../../workflows/dispatch.ts";

describe("dispatchWorkflow", () => {
	it("derives its metadata id from the module path and export name", () => {
		expect(dispatchWorkflowId).toBe(`workflow//./workflows/dispatch//${dispatchWorkflow.name}`);
	});

	it("caps the launch step at a single attempt so a retry can never start a second run", () => {
		expect(launchDispatchStep.maxRetries).toBe(0);
	});

	it("fails safe on invalid input before launching anything (directives are inert outside the workflow runtime)", async () => {
		// Invalid input returns before the launch step and before the first
		// sleep — no sandbox, no network, no anchor-PR reporting, regardless of
		// the ambient test environment.
		const result = await dispatchWorkflow({
			revision: "main",
			anchorBranch: "dispatch/widget",
			anchorPrNumber: 421,
			prompt: "p",
		});

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected invalid input.");
		expect(result.code).toBe("invalid-input");
		expect(result.failureReported).toBe(false);
	});
});
