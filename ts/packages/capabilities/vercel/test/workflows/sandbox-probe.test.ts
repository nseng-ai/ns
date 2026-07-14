import { describe, expect, it, vi } from "vitest";

import { sandboxProbeWorkflowId } from "../../workflows/sandbox-probe-id.ts";
import { sandboxProbeWorkflow } from "../../workflows/sandbox-probe.ts";

const revision = "0123456789abcdef0123456789abcdef01234567";

describe("sandboxProbeWorkflow", () => {
	it("derives its metadata id from the module path and export name", () => {
		expect(sandboxProbeWorkflowId).toBe(
			`workflow//./workflows/sandbox-probe//${sandboxProbeWorkflow.name}`,
		);
	});

	it("fails safe on invalid step configuration (directives are inert outside the workflow runtime)", async () => {
		// Force the step's runtime-config parse to fail deterministically so the
		// probe returns before any gateway is built — no mint, no Sandbox, no
		// network, regardless of the ambient test environment.
		vi.stubEnv("NS_DISPATCH_GITHUB_APP_ID", "not-a-github-app-id");

		expect(await sandboxProbeWorkflow(revision)).toEqual({
			ok: false,
			code: "probe-misconfigured",
			message: "Sandbox probe configuration is invalid: NS_DISPATCH_GITHUB_APP_ID.",
		});
	});
});
