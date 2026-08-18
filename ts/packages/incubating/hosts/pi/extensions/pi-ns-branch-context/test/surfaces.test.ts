import { describe, expect, test } from "vitest";

import {
	GIT_BRANCH_FROM_PLAN_COMMAND_NAME,
	IMPL_BRANCH_CONTEXT_COMMAND_NAME,
	IMPL_SAVED_PLAN_COMMAND_NAME,
	WRITE_GRILLED_PLAN_COMMAND_NAME,
	WRITE_PLAN_COMMAND_NAME,
	formatImplBranchContextCommand,
} from "@nseng-ai/branch-context/api";

describe("branch-context Pi command surfaces", () => {
	test("owns concrete branch-context and saved-plan command constants", () => {
		expect(GIT_BRANCH_FROM_PLAN_COMMAND_NAME).toBe("ns:git:branch-from-plan");
		expect(IMPL_BRANCH_CONTEXT_COMMAND_NAME).toBe("ns:branch-context:impl-attached-plan");
		expect(IMPL_SAVED_PLAN_COMMAND_NAME).toBe("ns:plan:impl-saved-plan");
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
