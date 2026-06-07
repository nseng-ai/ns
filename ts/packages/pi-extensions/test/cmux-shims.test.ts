import { describe, expect, test } from "bun:test";

import registerCmuxExtension from "../src/cmux.ts";
import registerCccCmuxExtension from "../../ccc/src/cmux.ts";
import { registerCmuxSlotOpenBranchCommand } from "../src/cmux/slot-open-branch.ts";
import { registerCmuxSlotOpenBranchCommand as registerCccCmuxSlotOpenBranchCommand } from "../../ccc/src/cmux/slot-open-branch.ts";

describe("cmux compatibility shims", () => {
	test("preserve legacy pi-extensions cmux import paths", () => {
		expect(registerCmuxExtension).toBe(registerCccCmuxExtension);
		expect(registerCmuxSlotOpenBranchCommand).toBe(registerCccCmuxSlotOpenBranchCommand);
	});
});
