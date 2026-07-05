import { describe, expect, test } from "vitest";

import {
	BRANCH_CONTEXT_FROM_PLAN_COMMAND_NAME,
	formatImplBranchContextCommand,
	IMPL_BRANCH_CONTEXT_COMMAND_NAME,
	nsCommandSurface,
	WRITE_GRILLED_PLAN_COMMAND_NAME,
	WRITE_PLAN_COMMAND_NAME,
} from "../src/primitives/command.ts";

describe("ns command surfaces", () => {
	test("keeps neutral command surface constants", () => {
		expect(BRANCH_CONTEXT_FROM_PLAN_COMMAND_NAME).toBe("ns:branch-context:from-plan");
		expect(IMPL_BRANCH_CONTEXT_COMMAND_NAME).toBe("ns:branch-context:impl-attached-plan");
		expect(WRITE_PLAN_COMMAND_NAME).toBe("ns:plan:save");
		expect(WRITE_GRILLED_PLAN_COMMAND_NAME).toBe("ns:plan:grill-and-save");
	});

	test("formats ns extension command surfaces", () => {
		expect(nsCommandSurface("objective", "list")).toBe("ns:objective:list");
		expect(nsCommandSurface("ccc", "workspace:dispatch-plan")).toBe(
			"ns:ccc:workspace:dispatch-plan",
		);
		expect(nsCommandSurface("ccc", "sidebar:session-summary")).toBe(
			"ns:ccc:sidebar:session-summary",
		);
	});

	test("rejects invalid ns extension command surface parts", () => {
		expect(() => nsCommandSurface("Objective", "list")).toThrow("Invalid ns command surface");
		expect(() => nsCommandSurface("objective", "list/all")).toThrow("Invalid ns command surface");
		expect(() => nsCommandSurface("objective", "list:all:")).toThrow("Invalid ns command surface");
	});

	test("formats attached branch-context implementation commands", () => {
		expect(
			formatImplBranchContextCommand("provider-owned-command-backed-skill-registry-remediation.md"),
		).toBe(
			"/ns:branch-context:impl-attached-plan provider-owned-command-backed-skill-registry-remediation.md",
		);
	});
});
