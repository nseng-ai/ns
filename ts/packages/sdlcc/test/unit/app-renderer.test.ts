import { describe, expect, test } from "vitest";

import { interpretAppKey } from "../../src/app-renderer.ts";

describe("app renderer key handling", () => {
	test("maps dashboard movement keys", () => {
		expect(interpretAppKey({ name: "down" })).toEqual({ type: "move-selection", delta: 1 });
		expect(interpretAppKey({ sequence: "j" })).toEqual({ type: "move-selection", delta: 1 });
		expect(interpretAppKey({ name: "up" })).toEqual({ type: "move-selection", delta: -1 });
		expect(interpretAppKey({ sequence: "k" })).toEqual({ type: "move-selection", delta: -1 });
	});

	test("maps activation, refresh, tabs, and quit", () => {
		expect(interpretAppKey({ name: "enter" })).toEqual({ type: "activate" });
		expect(interpretAppKey({ sequence: "r" })).toEqual({ type: "refresh" });
		expect(interpretAppKey({ name: "tab" })).toEqual({ type: "stack-map" });
		expect(interpretAppKey({ name: "tab", shift: true })).toEqual({ type: "dashboard" });
		expect(interpretAppKey({ sequence: "q" })).toEqual({ type: "quit" });
	});
});
