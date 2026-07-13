import { describe, expect, it } from "vitest";

import { resolveConfiguredHarnessInvocation } from "../../src/dispatch/harness-invocation.ts";

describe("resolveConfiguredHarnessInvocation", () => {
	it("reports harness-not-configured until the pi runner supplies the first real invocation", () => {
		// Deliberate: the ns-owned pi runner is the next steel-thread sub-slice.
		// A deployed dispatch workflow must fail its launch step cleanly as
		// dispatch-misconfigured rather than launch nothing.
		expect(resolveConfiguredHarnessInvocation()).toEqual({
			ok: false,
			code: "harness-not-configured",
		});
	});
});
