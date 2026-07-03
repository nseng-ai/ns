import { describe, expect, test } from "vitest";

import {
	BRANCH_CONTEXT_FROM_PLAN_COMMAND_NAME,
	derivePiReplacementSurface,
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

	test("derives specialized replacements before namespace and first-hyphen fallback", () => {
		expect(derivePiReplacementSurface("branch-context-from-plan")).toBe(
			BRANCH_CONTEXT_FROM_PLAN_COMMAND_NAME,
		);
		expect(derivePiReplacementSurface("branch-context-impl-extra")).toBe(
			`${IMPL_BRANCH_CONTEXT_COMMAND_NAME}-extra`,
		);
		expect(derivePiReplacementSurface("objective-close")).toBe("objective:close");
		expect(derivePiReplacementSurface("objective-stack-impl")).toBe("objective:stack-impl");
		expect(derivePiReplacementSurface("ns-flow-branch-latest-commit")).toBe(
			"ns:flow:branch-latest-commit",
		);
		expect(derivePiReplacementSurface("ns-flow-cp")).toBe("ns:flow:cp");
		expect(derivePiReplacementSurface("ns-flow-submit")).toBe("ns:flow:submit");
		expect(derivePiReplacementSurface("pytest")).toBe("python:pytest");
		expect(derivePiReplacementSurface("skillx")).toBe("skill:x");
		expect(derivePiReplacementSurface("foo-bar-baz")).toBe("foo:bar-baz");
		expect(derivePiReplacementSurface("plain")).toBeUndefined();
	});

	test("formats attached branch-context implementation commands", () => {
		expect(
			formatImplBranchContextCommand("provider-owned-command-backed-skill-registry-remediation.md"),
		).toBe(
			"/ns:branch-context:impl-attached-plan provider-owned-command-backed-skill-registry-remediation.md",
		);
	});
});
