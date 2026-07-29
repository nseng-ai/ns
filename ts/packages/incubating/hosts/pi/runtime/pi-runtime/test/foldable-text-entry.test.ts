import { visibleWidth } from "@earendil-works/pi-tui";
import type { EntryRenderTheme } from "@nseng-ai/extension-kit/pi-types";
import { describe, expect, test } from "vitest";

import {
	createFoldableTextEntryComponent,
	type FoldableTextEntryOptions,
} from "../src/kit/terminal/foldable-text-entry.ts";

const PLAIN_THEME: EntryRenderTheme = { fg: (_color, text) => text };
const MARKED_THEME: EntryRenderTheme = {
	fg: (color, text) => `[${color}]${text}`,
	bold: (text) => `<b>${text}</b>`,
};
const ANSI_THEME: EntryRenderTheme = {
	fg: (_color, text) => `\u001b[35m${text}\u001b[0m`,
	bold: (text) => `\u001b[1m${text}\u001b[0m`,
};

function render(overrides: Partial<FoldableTextEntryOptions>, width: number): string[] {
	return createFoldableTextEntryComponent({
		title: "example entry (2 lines)",
		lines: ["first line", "second line"],
		expanded: false,
		previewLineLimit: 6,
		gutter: "▌ ",
		theme: PLAIN_THEME,
		...overrides,
	}).render(width);
}

describe("createFoldableTextEntryComponent", () => {
	test("renders header, blank separator, and gutter-prefixed body lines", () => {
		const lines = render({ theme: MARKED_THEME, expanded: true }, 80);
		expect(lines[0]).toBe("[accent]<b>example entry (2 lines)</b>");
		expect(lines[1]).toBe("");
		expect(lines[2]).toBe("[accent]▌ [text]first line");
		expect(lines[3]).toBe("[accent]▌ [text]second line");
		expect(lines).toHaveLength(4);
	});

	test("collapses to the preview limit with a remainder line", () => {
		const body = Array.from({ length: 9 }, (_, i) => `line ${i + 1}`);
		const collapsed = render({ lines: body, expanded: false }, 80);
		expect(collapsed).toContain("▌ line 6");
		expect(collapsed.join("\n")).not.toContain("line 7");
		expect(collapsed.at(-1)).toBe("▌ … (+3 more lines — expand to view)");

		const expanded = render({ lines: body, expanded: true }, 80);
		expect(expanded).toContain("▌ line 9");
		expect(expanded.join("\n")).not.toContain("more lines");
	});

	test("works without a theme bold capability", () => {
		const lines = render({ theme: { fg: (_c, text) => text } }, 40);
		expect(lines[0]).toBe("example entry (2 lines)");
	});

	const WIDE_AND_COMBINING = [
		"plain ascii text",
		"wide 世界の文字がとても長い行です",
		"combining a\u0301e\u0301i\u0301o\u0301u\u0301 marks repeated a\u0301e\u0301i\u0301",
		"λ unicode with $shell 'quotes' and \"doubles\"",
	];

	test.each([0, 1, 2, 3, 5, 8, 13, 21, 80] as const)(
		"every rendered line fits width %i by display width",
		(width) => {
			for (const theme of [PLAIN_THEME, MARKED_THEME, ANSI_THEME]) {
				for (const expanded of [false, true]) {
					const lines = render(
						{
							title: "a very long header title that certainly exceeds narrow widths",
							lines: WIDE_AND_COMBINING,
							previewLineLimit: 2,
							expanded,
							theme,
						},
						width,
					);
					for (const line of lines) {
						expect(visibleWidth(line)).toBeLessThanOrEqual(Math.max(0, width));
					}
				}
			}
		},
	);

	test("fits widths narrower than the gutter", () => {
		const lines = render({ gutter: "▌▌▌ " }, 2);
		for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(2);
	});

	test("invalidate is a no-op", () => {
		expect(() =>
			createFoldableTextEntryComponent({
				title: "t",
				lines: [],
				expanded: false,
				previewLineLimit: 1,
				gutter: "▌ ",
				theme: PLAIN_THEME,
			}).invalidate(),
		).not.toThrow();
	});
});
