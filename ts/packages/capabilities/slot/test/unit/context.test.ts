import { describe, expect, test } from "vitest";

import { resolveSlotsRoot } from "../../src/core/context.ts";

describe("resolveSlotsRoot", () => {
	test("defaults to ns XDG state slots", () => {
		expect(resolveSlotsRoot({ HOME: "/home/tester", XDG_STATE_HOME: "/state" })).toBe(
			"/state/ns/slots",
		);
	});

	test("uses ns XDG state slots and ignores relative XDG_STATE_HOME", () => {
		expect(resolveSlotsRoot({ HOME: "/home/tester", XDG_STATE_HOME: "/state" })).toBe(
			"/state/ns/slots",
		);
		expect(resolveSlotsRoot({ HOME: "/home/tester", XDG_STATE_HOME: "relative/state" })).toBe(
			"/home/tester/.local/state/ns/slots",
		);
	});
});
