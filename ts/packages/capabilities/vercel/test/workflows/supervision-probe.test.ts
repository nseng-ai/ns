import { describe, expect, it } from "vitest";

import { supervisionProbeWorkflowId } from "../../workflows/supervision-probe-id.ts";
import {
	launchSupervisionStep,
	supervisionProbeWorkflow,
} from "../../workflows/supervision-probe.ts";

describe("supervisionProbeWorkflow", () => {
	it("derives its metadata id from the module path and export name", () => {
		expect(supervisionProbeWorkflowId).toBe(
			`workflow//./workflows/supervision-probe//${supervisionProbeWorkflow.name}`,
		);
	});

	it("caps the launch step at a single attempt so a retry can never start a second run", () => {
		expect(launchSupervisionStep.maxRetries).toBe(0);
	});

	it("fails safe on invalid parameters before launching anything (directives are inert outside the workflow runtime)", async () => {
		// Out-of-bounds parameters return before the launch step and before the
		// first sleep — no sandbox, no network, regardless of the ambient test
		// environment.
		const result = await supervisionProbeWorkflow({ runSeconds: 5, pollSeconds: 30 });

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected invalid parameters.");
		expect(result.code).toBe("invalid-parameters");
	});
});
