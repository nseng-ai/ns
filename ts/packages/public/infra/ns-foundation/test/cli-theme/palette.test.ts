import { describe, expect, test } from "vitest";
import type { Caps, ColorDepth } from "@nseng-ai/clinkr";
import {
	bold,
	dim,
	PALETTE,
	paint,
	paintSwatch,
	type Swatch,
} from "../../src/cli-theme/palette.ts";

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";

function caps(parts: { colorDepth?: ColorDepth; canRenderUnicode?: boolean } = {}): Caps {
	return {
		isTty: true,
		colorDepth: parts.colorDepth ?? "truecolor",
		columns: 80,
		canRenderUnicode: parts.canRenderUnicode ?? true,
	};
}

describe("paint rungs", () => {
	test("truecolor emits 24-bit SGR for success", () => {
		expect(paint(caps({ colorDepth: "truecolor" }), "success", "ok")).toBe(
			`\x1b[38;2;63;185;80mok${RESET}`,
		);
	});

	test("ansi256 emits 256-color SGR for error", () => {
		expect(paint(caps({ colorDepth: "ansi256" }), "error", "no")).toBe(`\x1b[38;5;203mno${RESET}`);
	});

	test("ansi16 emits bright-fg SGR for accent", () => {
		expect(paint(caps({ colorDepth: "ansi16" }), "accent", "*")).toBe(`\x1b[96m*${RESET}`);
	});

	test("warn truecolor uses dialed-in rgb", () => {
		expect(paint(caps({ colorDepth: "truecolor" }), "warn", "!")).toBe(
			`\x1b[38;2;210;153;34m!${RESET}`,
		);
	});

	test("reset is appended to every colored span", () => {
		expect(paint(caps({ colorDepth: "ansi256" }), "muted", "x").endsWith(RESET)).toBe(true);
	});
});

describe("mono honesty (colorDepth none)", () => {
	const mono = caps({ colorDepth: "none" });

	test("muted still dims so hierarchy survives", () => {
		expect(paint(mono, "muted", "ts")).toBe(`${DIM}ts${RESET}`);
	});

	test("success degrades to plain text (leans on the glyph)", () => {
		expect(paint(mono, "success", "ok")).toBe("ok");
	});

	test("error degrades to plain text", () => {
		expect(paint(mono, "error", "no")).toBe("no");
	});

	test("bold still emits BOLD in mono (load-bearing for failure summaries)", () => {
		expect(bold("FAILED")).toBe(`${BOLD}FAILED${RESET}`);
	});
});

describe("paintSwatch (accent override path)", () => {
	const candidate: Swatch = { rgb: [56, 189, 248], x256: 75, x16: "94" }; // sky, not in PALETTE

	test("truecolor colorizes with the explicit candidate rgb", () => {
		expect(paintSwatch(caps({ colorDepth: "truecolor" }), candidate, "#2201")).toBe(
			`\x1b[38;2;56;189;248m#2201${RESET}`,
		);
	});

	test("ansi256 uses the candidate x256", () => {
		expect(paintSwatch(caps({ colorDepth: "ansi256" }), candidate, "o")).toBe(
			`\x1b[38;5;75mo${RESET}`,
		);
	});

	test("ansi16 uses the candidate x16", () => {
		expect(paintSwatch(caps({ colorDepth: "ansi16" }), candidate, "o")).toBe(`\x1b[94mo${RESET}`);
	});

	test("none returns plain text", () => {
		expect(paintSwatch(caps({ colorDepth: "none" }), candidate, "o")).toBe("o");
	});
});

describe("dim", () => {
	test("wraps text in DIM/RESET", () => {
		expect(dim("ts")).toBe(`${DIM}ts${RESET}`);
	});
});

describe("PALETTE", () => {
	test("holds the dialed-in sign-off values", () => {
		expect(PALETTE.success).toEqual({ rgb: [63, 185, 80], x256: 71, x16: "92" });
		expect(PALETTE.accent).toEqual({ rgb: [34, 211, 238], x256: 45, x16: "96" });
		expect(PALETTE.muted).toEqual({ rgb: [139, 148, 158], x256: 245, x16: "90" });
	});
});
