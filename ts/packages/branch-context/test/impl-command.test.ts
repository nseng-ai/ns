import { describe, expect, test } from "vitest";

import { BRANCH_CONTEXT_PLAN_KEY, IMPL_BRANCH_CONTEXT_COMMAND_NAME, formatImplBranchContextCommand } from "@asdl/branch-context";

describe("branch-context impl command contract", () => {
	test("exports the Pi command name", () => {
		expect(IMPL_BRANCH_CONTEXT_COMMAND_NAME).toBe("branch-context:impl");
	});

	test("formats default and keyed impl commands", () => {
		expect(formatImplBranchContextCommand(BRANCH_CONTEXT_PLAN_KEY)).toBe(`/${IMPL_BRANCH_CONTEXT_COMMAND_NAME}`);
		expect(formatImplBranchContextCommand("custom-plan.md")).toBe(`/${IMPL_BRANCH_CONTEXT_COMMAND_NAME} custom-plan.md`);
	});
});
