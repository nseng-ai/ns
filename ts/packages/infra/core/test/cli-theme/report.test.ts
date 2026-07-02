import { describe, expect, test } from "vitest";

import type { Caps, ColorDepth } from "@sdl/clinkr";
import { renderBufferedReport, stripAnsiWhenDisabled } from "../../src/cli-theme/report.ts";

const ACCENT_TRUECOLOR = "\x1b[38;2;34;211;238m";

function caps(parts: { colorDepth?: ColorDepth } = {}): Caps {
	return {
		isTty: true,
		colorDepth: parts.colorDepth ?? "truecolor",
		columns: 80,
		canRenderUnicode: true,
	};
}

describe("stripAnsiWhenDisabled", () => {
	test("strips SGR sequences when ANSI is disabled", () => {
		expect(stripAnsiWhenDisabled("\x1b[31mred\x1b[0m", { canEmitAnsi: false })).toBe("red");
	});

	test("preserves SGR sequences when ANSI is enabled", () => {
		expect(stripAnsiWhenDisabled("\x1b[31mred\x1b[0m", { canEmitAnsi: true })).toBe(
			"\x1b[31mred\x1b[0m",
		);
	});
});

describe("renderBufferedReport", () => {
	test("renders an accent title and ordered sections", () => {
		const rendered = renderBufferedReport({
			caps: { canEmitAnsi: true, caps: caps() },
			title: "Outstanding changes on feature",
			sections: [
				{ title: "Summary", lines: ["- one", "- two"] },
				{ title: "Files", lines: [" M file.ts"] },
			],
		});

		expect(rendered).toContain(ACCENT_TRUECOLOR);
		expect(rendered).toContain("Outstanding changes on feature");
		expect(
			rendered.split("\n").map((line) => stripAnsiWhenDisabled(line, { canEmitAnsi: false })),
		).toEqual([
			"Outstanding changes on feature",
			"",
			"Summary",
			"- one",
			"- two",
			"",
			"Files",
			" M file.ts",
		]);
	});

	test("strips title ANSI when ANSI is disabled", () => {
		const rendered = renderBufferedReport({
			caps: { canEmitAnsi: false, caps: caps() },
			title: "Slots for repo",
			sections: [{ title: "", lines: ["SLOT  STATUS", "1     assigned"] }],
		});

		expect(rendered).toBe("Slots for repo\n\nSLOT  STATUS\n1     assigned");
	});
});
