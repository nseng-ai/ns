import { describe, expect, test } from "vitest";

import { defaultPlanStoreRoot } from "../src/index.ts";

describe("defaultPlanStoreRoot", () => {
	test("uses XDG state root and ignores relative XDG values", () => {
		expect(defaultPlanStoreRoot({ HOME: "/home/tester", XDG_STATE_HOME: "/state" })).toBe(
			"/state/ns/enriched-plan",
		);
		expect(defaultPlanStoreRoot({ HOME: "/home/tester", XDG_STATE_HOME: "relative" })).toBe(
			"/home/tester/.local/state/ns/enriched-plan",
		);
	});
});
