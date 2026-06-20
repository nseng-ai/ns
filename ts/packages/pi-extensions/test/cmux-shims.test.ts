import { describe, expect, test } from "vitest";

import { createCmuxSurface, identifyCmuxCaller } from "@asdl/ccc/cmux/focused-terminal-tab";

describe("cmux compatibility shims", () => {
	test("preserve legacy focused terminal-tab import path", async () => {
		const focusedTerminalTabShim = await import("../src/cmux/focused-terminal-tab.ts");
		expect(focusedTerminalTabShim.identifyCmuxCaller).toBe(identifyCmuxCaller);
		expect(focusedTerminalTabShim.createCmuxSurface).toBe(createCmuxSurface);
	});
});
