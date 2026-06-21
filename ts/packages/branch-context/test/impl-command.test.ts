import { describe, expect, test } from "vitest";

import {
	IMPL_BRANCH_CONTEXT_COMMAND_NAME,
	formatImplBranchContextCommand,
} from "@sdl/branch-context";

describe("branch-context impl command contract", () => {
	test("exports the Pi command name", () => {
		expect(IMPL_BRANCH_CONTEXT_COMMAND_NAME).toBe("sdl:branch-context:impl-attached-plan");
	});

	test("formats impl commands with explicit named keys", () => {
		expect(formatImplBranchContextCommand("branch-scoped-plan.md")).toBe(
			`/${IMPL_BRANCH_CONTEXT_COMMAND_NAME} branch-scoped-plan.md`,
		);
		expect(formatImplBranchContextCommand("custom-plan.md")).toBe(
			`/${IMPL_BRANCH_CONTEXT_COMMAND_NAME} custom-plan.md`,
		);
	});
});
