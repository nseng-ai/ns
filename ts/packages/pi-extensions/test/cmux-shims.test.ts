import { describe, expect, test } from "vitest";

import { createCmuxSurface as createCccCmuxSurface, identifyCmuxCaller as identifyCccCmuxCaller } from "@asdl/ccc/cmux/focused-terminal-tab";

import { createCmuxSurface, identifyCmuxCaller } from "../src/cmux/focused-terminal-tab.ts";

describe("cmux compatibility shims", () => {
	test("preserve legacy focused terminal-tab import path", () => {
		expect(identifyCmuxCaller).toBe(identifyCccCmuxCaller);
		expect(createCmuxSurface).toBe(createCccCmuxSurface);
	});
});
