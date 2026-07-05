import { describe, expect, test } from "vitest";

import { nsCommandSurface } from "../src/primitives/command.ts";

describe("ns command surfaces", () => {
	test("formats ns extension command surfaces", () => {
		expect(nsCommandSurface("objective", "list")).toBe("ns:objective:list");
		expect(nsCommandSurface("ccc", "workspace:dispatch-plan")).toBe(
			"ns:ccc:workspace:dispatch-plan",
		);
		expect(nsCommandSurface("ccc", "sidebar:session-summary")).toBe(
			"ns:ccc:sidebar:session-summary",
		);
	});

	test("rejects invalid ns extension command surface parts", () => {
		expect(() => nsCommandSurface("Objective", "list")).toThrow("Invalid ns command surface");
		expect(() => nsCommandSurface("objective", "list/all")).toThrow("Invalid ns command surface");
		expect(() => nsCommandSurface("objective", "list:all:")).toThrow("Invalid ns command surface");
	});
});
