import { describe, expect, test } from "vitest";

import {
	GT_IMPL_BRANCH_FROM_PLAN_COMMAND_NAME,
	GT_NEW_BRANCH_FROM_PLAN_COMMAND_NAME,
} from "@nseng-ai/branch-context/api";
import { parseCreateBranchContextArgs } from "../src/from-plan-commands.ts";

describe("GT command surfaces", () => {
	test("owns GT-namespaced commands", () => {
		expect(GT_NEW_BRANCH_FROM_PLAN_COMMAND_NAME).toBe("ns:gt:new-branch-from-plan");
		expect(GT_IMPL_BRANCH_FROM_PLAN_COMMAND_NAME).toBe("ns:gt:impl-branch-from-plan");
	});

	test("rejects provider-selection flags", () => {
		expect(() => parseCreateBranchContextArgs("--graphite")).toThrow("not supported");
		expect(() => parseCreateBranchContextArgs("--plain-git")).toThrow("not supported");
	});
});
