import { describe, expect, test } from "vitest";

import { nsCommandSurface } from "../src/primitives/command.ts";

describe("ns command surfaces", () => {
	test("formats ns extension command surfaces", () => {
		expect(nsCommandSurface("objective", "list")).toBe("ns:objective:list");
		expect(nsCommandSurface("cmux", "workspace:dispatch-plan")).toBe(
			"ns:cmux:workspace:dispatch-plan",
		);
		expect(nsCommandSurface("cmux", "sidebar:session-summary")).toBe(
			"ns:cmux:sidebar:session-summary",
		);
	});

	test("rejects invalid ns extension command surface parts", () => {
		expect(() => nsCommandSurface("Objective", "list")).toThrow("Invalid ns command surface");
		expect(() => nsCommandSurface("objective", "list/all")).toThrow("Invalid ns command surface");
		expect(() => nsCommandSurface("objective", "list:all:")).toThrow("Invalid ns command surface");
	});
});
