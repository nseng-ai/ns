import { describe, expect, test } from "vitest";

import { resolveSlotsRoot } from "../../src/context.ts";

describe("resolveSlotsRoot", () => {
	test("uses SLOTS_ROOT as an absolute override with optional tilde expansion", () => {
		expect(resolveSlotsRoot({ HOME: "/home/tester", SLOTS_ROOT: "/slots" })).toBe("/slots");
		expect(resolveSlotsRoot({ HOME: "/home/tester", SLOTS_ROOT: "~/slots" })).toBe(
			"/home/tester/slots",
		);
	});

	test("rejects relative SLOTS_ROOT instead of resolving it under cwd", () => {
		expect(() => resolveSlotsRoot({ HOME: "/home/tester", SLOTS_ROOT: "relative/slots" })).toThrow(
			"SLOTS_ROOT must be an absolute path",
		);
	});

	test("defaults to SDL XDG state slots and ignores relative XDG_STATE_HOME", () => {
		expect(resolveSlotsRoot({ HOME: "/home/tester", XDG_STATE_HOME: "/state" })).toBe(
			"/state/sdl/slots",
		);
		expect(resolveSlotsRoot({ HOME: "/home/tester", XDG_STATE_HOME: "relative/state" })).toBe(
			"/home/tester/.local/state/sdl/slots",
		);
	});
});
