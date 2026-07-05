import { describe, expect, test } from "vitest";
import type { Caps } from "@nseng-ai/clinkr";
import { paint } from "../../src/cli-theme/palette.ts";
import { padCell, padPlain, truncatePlain, visibleWidth } from "../../src/cli-theme/text.ts";

function caps(): Caps {
	return { isTty: true, colorDepth: "truecolor", columns: 80, canRenderUnicode: true };
}

describe("visibleWidth", () => {
	test("strips SGR escapes before measuring", () => {
		const colored = paint(caps(), "success", "ok"); // wrapped in 24-bit SGR + reset
		expect(colored.length).toBeGreaterThan(2);
		expect(visibleWidth(colored)).toBe(2);
	});

	test("plain text width is its length", () => {
		expect(visibleWidth("hello")).toBe(5);
	});
});

describe("truncatePlain", () => {
	test("returns text unchanged when it fits", () => {
		expect(truncatePlain("abc", 5)).toBe("abc");
	});

	test("truncates overflow and appends ellipsis", () => {
		expect(truncatePlain("abcdefgh", 5)).toBe("abcd…");
	});

	test("width <= 0 returns empty string", () => {
		expect(truncatePlain("abc", 0)).toBe("");
		expect(truncatePlain("abc", -3)).toBe("");
	});

	test("ellipsis wider than width is sliced to fit", () => {
		expect(truncatePlain("abcdef", 2, "...")).toBe("..");
	});
});

describe("padPlain", () => {
	test("right-pads with spaces to width", () => {
		expect(padPlain("ab", 5)).toBe("ab   ");
	});

	test("no-op when already at or beyond width", () => {
		expect(padPlain("abcde", 3)).toBe("abcde");
	});
});

describe("padCell", () => {
	test("pads a styled cell using its plain width", () => {
		const plain = "ok";
		const colored = paint(caps(), "success", plain);
		const padded = padCell(colored, plain, 5);
		expect(padded).toBe(`${colored}   `); // gap = 5 - 2 = 3 spaces
		expect(visibleWidth(padded)).toBe(5);
	});

	test("no padding when plain width already meets width", () => {
		const colored = paint(caps(), "success", "okay");
		expect(padCell(colored, "okay", 4)).toBe(colored);
	});
});
