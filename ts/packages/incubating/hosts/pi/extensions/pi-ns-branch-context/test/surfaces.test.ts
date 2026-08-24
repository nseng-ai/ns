import { describe, expect, test } from "vitest";

import { SESSION_PLAN_DISCOVERY_SKILL_NAME } from "@nseng-ai/pi-ns-branch-context/session-plan-discovery";
import {
	BRANCH_CONTEXT_FROM_PLAN_COMMAND_NAME,
	IMPL_BRANCH_CONTEXT_COMMAND_NAME,
	IMPL_SAVED_PLAN_COMMAND_NAME,
	WRITE_GRILLED_PLAN_COMMAND_NAME,
	WRITE_PLAN_COMMAND_NAME,
	formatImplBranchContextCommand,
} from "@nseng-ai/branch-context/api";

describe("branch-context Pi command surfaces", () => {
	test("owns concrete branch-context and saved-plan command constants", () => {
		expect(BRANCH_CONTEXT_FROM_PLAN_COMMAND_NAME).toBe("ns:branch-context:from-plan");
		expect(IMPL_BRANCH_CONTEXT_COMMAND_NAME).toBe("ns:branch-context:impl-attached-plan");
		expect(IMPL_SAVED_PLAN_COMMAND_NAME).toBe("ns:plan:impl-saved-plan");
		expect(WRITE_PLAN_COMMAND_NAME).toBe("ns:plan:save");
		expect(WRITE_GRILLED_PLAN_COMMAND_NAME).toBe("ns:plan:grill-and-save");
	});

	test("exposes session plan discovery through its curated subpath", () => {
		expect(SESSION_PLAN_DISCOVERY_SKILL_NAME).toBe("session-plan-discovery");
	});

	test("formats attached branch-context implementation commands", () => {
		expect(
			formatImplBranchContextCommand("provider-owned-command-backed-skill-registry-remediation.md"),
		).toBe(
			"/ns:branch-context:impl-attached-plan provider-owned-command-backed-skill-registry-remediation.md",
		);
	});
});
