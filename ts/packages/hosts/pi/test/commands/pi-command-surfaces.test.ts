import { describe, expect, test } from "vitest";

import {
	BRANCH_CONTEXT_FROM_PLAN_COMMAND_NAME,
	formatImplBranchContextCommand,
	IMPL_BRANCH_CONTEXT_COMMAND_NAME,
	WRITE_GRILLED_PLAN_COMMAND_NAME,
	WRITE_PLAN_COMMAND_NAME,
} from "../../src/commands/surfaces.ts";

describe("Pi command surfaces", () => {
	test("keeps neutral command surface constants", () => {
		expect(BRANCH_CONTEXT_FROM_PLAN_COMMAND_NAME).toBe("ns:branch-context:from-plan");
		expect(IMPL_BRANCH_CONTEXT_COMMAND_NAME).toBe("ns:branch-context:impl-attached-plan");
		expect(WRITE_PLAN_COMMAND_NAME).toBe("ns:plan:save");
		expect(WRITE_GRILLED_PLAN_COMMAND_NAME).toBe("ns:plan:grill-and-save");
	});

	test("formats attached branch-context implementation commands", () => {
		expect(
			formatImplBranchContextCommand("provider-owned-command-backed-skill-registry-remediation.md"),
		).toBe(
			"/ns:branch-context:impl-attached-plan provider-owned-command-backed-skill-registry-remediation.md",
		);
	});
});
