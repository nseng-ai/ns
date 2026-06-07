import { describe, expect, test } from "bun:test";

import { registerCmuxSlotOpenBranchCommand as registerCccCmuxSlotOpenBranchCommand } from "@asdl/ccc/cmux/slot-open-branch";
import { registerCmuxExtension as registerCccCmuxExtension } from "@asdl/ccc";

import registerCmuxExtension from "../src/cmux.ts";
import { registerCmuxSlotOpenBranchCommand } from "../src/cmux/slot-open-branch.ts";

describe("cmux compatibility shims", () => {
	test("preserve legacy pi-extensions cmux import paths", () => {
		expect(registerCmuxExtension).toBe(registerCccCmuxExtension);
		expect(registerCmuxSlotOpenBranchCommand).toBe(registerCccCmuxSlotOpenBranchCommand);
	});
});
