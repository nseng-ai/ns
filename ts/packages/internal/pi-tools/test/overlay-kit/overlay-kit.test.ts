import { describe, expect, test } from "vitest";

import {
	overlayChromeRows,
	overlayInnerWidth,
	overlayModalRows,
	overlayTerminalRows,
	renderOverlayFrame,
} from "../../src/overlay-kit/frame.ts";
import {
	sliceWrappedDetailLinesForViewport,
	wrapDetailLines,
} from "../../src/overlay-kit/viewport.ts";

describe("renderOverlayFrame", () => {
	test("assembles the bordered box around header/body/footer", () => {
		const lines = renderOverlayFrame({
			header: ["H"],
			body: ["B"],
			footer: "F",
			width: 40,
			colorizeBorder: (text) => text,
		});

		expect(lines).toHaveLength(7);
		expect(lines[0]).toBe(`┌${"─".repeat(38)}┐`);
		expect(lines[1]).toBe(`│H${" ".repeat(37)}│`);
		expect(lines[2]).toBe(`├${"─".repeat(38)}┤`);
		expect(lines[3]).toBe(`│B${" ".repeat(37)}│`);
		expect(lines[4]).toBe(`├${"─".repeat(38)}┤`);
		expect(lines[5]).toBe(`│F${" ".repeat(37)}│`);
		expect(lines[6]).toBe(`└${"─".repeat(38)}┘`);
	});

	test("routes every border glyph through colorizeBorder", () => {
		const seen: string[] = [];
		renderOverlayFrame({
			header: ["H"],
			body: ["B"],
			footer: "F",
			width: 40,
			colorizeBorder: (text) => {
				seen.push(text);
				return text;
			},
		});

		// Both horizontal rules and the vertical box glyph pass through the colorizer.
		expect(seen).toContain(`┌${"─".repeat(38)}┐`);
		expect(seen).toContain(`└${"─".repeat(38)}┘`);
		expect(seen).toContain("│");
	});
});

describe("overlay budget math", () => {
	test("modalRows mirrors floor(rows * ratio) capped by rows - 2 * margin", () => {
		expect(overlayModalRows(40)).toBe(34);
		expect(overlayModalRows(24)).toBe(20);
		expect(overlayModalRows(3)).toBe(1);
	});

	test("terminalRows applies the fallback only when the host omits a count", () => {
		expect(overlayTerminalRows(undefined)).toBe(24);
		expect(overlayTerminalRows(null)).toBe(24);
		expect(overlayTerminalRows(50)).toBe(50);
	});

	test("innerWidth and chromeRows follow the fixed chrome shape", () => {
		expect(overlayInnerWidth(10)).toBe(38);
		expect(overlayInnerWidth(100)).toBe(98);
		expect(overlayChromeRows(2)).toBe(7);
		expect(overlayChromeRows(3)).toBe(8);
	});
});

describe("detail-pane viewport", () => {
	test("wrapDetailLines preserves blank lines and passes through fitting content", () => {
		expect(wrapDetailLines(["", "short"], 40)).toEqual(["", "short"]);
		// A line longer than the width wraps into more than one row.
		expect(wrapDetailLines(["aaaa bbbb cccc dddd"], 4).length).toBeGreaterThan(1);
	});

	test("sliceWrappedDetailLinesForViewport clamps scroll to the wrapped bounds", () => {
		const lines = Array.from({ length: 10 }, (_unused, index) => `line ${index}`);
		const viewport = sliceWrappedDetailLinesForViewport({ lines, width: 40, rows: 4, scroll: 100 });
		expect(viewport.maxScroll).toBe(6);
		expect(viewport.scroll).toBe(6);
		expect(viewport.lines).toEqual(["line 6", "line 7", "line 8", "line 9"]);
	});
});
