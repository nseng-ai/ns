import { describe, expect, test } from "vitest";

import { visibleWidth } from "@earendil-works/pi-tui";
import { clamp, fitToWidth, padRight, reconcileScroll } from "../src/shared/render-helpers.ts";

describe("fitToWidth", () => {
	test("truncates then pads to the exact display width", () => {
		expect(visibleWidth(fitToWidth("abcdef", 4))).toBe(4);
		expect(fitToWidth("abcdef", 4)).toContain("…");
		expect(fitToWidth("ab", 5)).toBe("ab   ");
	});
});

describe("padRight", () => {
	test("pads by display width", () => {
		expect(padRight("ab", 5)).toBe("ab   ");
		expect(visibleWidth(padRight("界", 4))).toBe(4);
	});
});

describe("reconcileScroll", () => {
	test("keeps the anchor visible at the top and bottom of the viewport", () => {
		expect(reconcileScroll({ scroll: 0, anchor: 9, areaHeight: 5, totalLines: 20 })).toBe(5);
		expect(reconcileScroll({ scroll: 12, anchor: 9, areaHeight: 5, totalLines: 20 })).toBe(9);
	});

	test("handles area taller than content", () => {
		expect(reconcileScroll({ scroll: 10, anchor: 2, areaHeight: 20, totalLines: 3 })).toBe(0);
	});

	test("clamps scroll past the end", () => {
		expect(reconcileScroll({ scroll: 99, anchor: 99, areaHeight: 5, totalLines: 12 })).toBe(7);
	});
});

describe("clamp", () => {
	test("bounds values and treats inverted ranges as the minimum", () => {
		expect(clamp(5, 0, 3)).toBe(3);
		expect(clamp(-1, 0, 3)).toBe(0);
		expect(clamp(2, 0, 3)).toBe(2);
		expect(clamp(2, 4, 3)).toBe(4);
	});
});
