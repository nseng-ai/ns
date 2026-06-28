import { describe, expect, test } from "vitest";
import type { Caps } from "../../src/caps.ts";
import {
	ellipsisFor,
	glyph,
	type GlyphName,
	ruleChar,
	spinnerFrame,
	treeMarkers,
} from "../../src/theme/glyphs.ts";

function caps(canRenderUnicode: boolean): Caps {
	return { isTty: true, colorDepth: "truecolor", columns: 80, canRenderUnicode };
}

const uni = caps(true);
const ascii = caps(false);

describe("glyph", () => {
	const cases: ReadonlyArray<[GlyphName, string, string]> = [
		["done", "✓", "v"],
		["open", "●", "o"],
		["fail", "✗", "x"],
		["skip", "–", "-"],
		["bullet", "•", "*"],
	];

	for (const [name, unicode, asciiGlyph] of cases) {
		test(`${name} selects unicode vs ascii`, () => {
			expect(glyph(uni, name)).toBe(unicode);
			expect(glyph(ascii, name)).toBe(asciiGlyph);
		});
	}
});

describe("spinnerFrame", () => {
	test("unicode braille cycles and wraps with tick", () => {
		expect(spinnerFrame(uni, 0)).toBe("⠋");
		expect(spinnerFrame(uni, 1)).toBe("⠙");
		expect(spinnerFrame(uni, 9)).toBe("⠏");
		expect(spinnerFrame(uni, 10)).toBe("⠋"); // wraps (10 frames)
	});

	test("ascii fallback cycles through its four frames", () => {
		expect(spinnerFrame(ascii, 0)).toBe("|");
		expect(spinnerFrame(ascii, 1)).toBe("/");
		expect(spinnerFrame(ascii, 2)).toBe("-");
		expect(spinnerFrame(ascii, 3)).toBe("\\");
		expect(spinnerFrame(ascii, 4)).toBe("|"); // wraps (4 frames)
	});
});

describe("ruleChar", () => {
	test("unicode vs ascii", () => {
		expect(ruleChar(uni)).toBe("─");
		expect(ruleChar(ascii)).toBe("-");
	});
});

describe("treeMarkers", () => {
	test("unicode markers", () => {
		expect(treeMarkers(uni)).toEqual({ tee: "├", last: "└" });
	});

	test("ascii markers", () => {
		expect(treeMarkers(ascii)).toEqual({ tee: "|-", last: "`-" });
	});
});

describe("ellipsisFor", () => {
	test("unicode vs ascii", () => {
		expect(ellipsisFor(uni)).toBe("…");
		expect(ellipsisFor(ascii)).toBe("...");
	});
});
