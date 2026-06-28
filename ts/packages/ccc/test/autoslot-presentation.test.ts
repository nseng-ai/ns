import { describe, expect, test } from "vitest";

import type { Caps, ColorDepth } from "@sdl/clinkr";
import { stripAnsi } from "@sdl/clinkr/testing";

import { renderAutoslotResultBlock } from "../src/autoslot-presentation.ts";

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const SUCCESS_TRUECOLOR = "\x1b[38;2;63;185;80m";
const ERROR_TRUECOLOR = "\x1b[38;2;248;81;73m";

function caps(parts: { colorDepth?: ColorDepth; canRenderUnicode?: boolean } = {}): Caps {
	return {
		isTty: true,
		colorDepth: parts.colorDepth ?? "truecolor",
		columns: 80,
		canRenderUnicode: parts.canRenderUnicode ?? true,
	};
}

describe("renderAutoslotResultBlock — success", () => {
	const block = renderAutoslotResultBlock(caps(), {
		kind: "success",
		headline: "Autoslot moved demo-branch to slot-01.",
		cwd: "/repo",
		body: "Worktree: /slots/slot-01",
		guidance: "sdl slot co demo-branch",
	});
	const plain = stripAnsi(block);

	test("green ✓ headline carries the success swatch and bold", () => {
		const headline = block.split("\n")[0] ?? "";
		expect(headline).toContain(SUCCESS_TRUECOLOR);
		expect(headline).toContain(BOLD);
		expect(headline).toContain("✓ Autoslot moved demo-branch to slot-01.");
	});

	test("worktree body and copyable navigation line stay at normal weight, with dimmed cwd", () => {
		expect(plain).toContain("Worktree: /slots/slot-01");
		expect(plain).toContain("sdl slot co demo-branch");
		expect(block).toContain(`${DIM}Cwd: /repo\x1b[0m`);
		expect(block).not.toContain(`${DIM}sdl slot co demo-branch`);
	});
});

describe("renderAutoslotResultBlock — failure", () => {
	const block = renderAutoslotResultBlock(caps(), {
		kind: "failure",
		headline: "Autoslot created demo-branch, but sdl slot checkout failed.",
		cwd: "/repo",
		body: "Slot checkout failed (no_available_slot): No clean detached slot is available.",
	});

	test("bold error headline with the ✗ glyph", () => {
		const headline = block.split("\n")[0] ?? "";
		expect(headline).toContain(BOLD);
		expect(headline).toContain(ERROR_TRUECOLOR);
		expect(headline).toContain("✗ Autoslot created demo-branch, but sdl slot checkout failed.");
	});

	test("keeps the failure cause at normal weight", () => {
		expect(stripAnsi(block)).toContain("No clean detached slot is available.");
		expect(block).not.toContain(`${DIM}Slot checkout failed`);
	});
});

describe("renderAutoslotResultBlock — refusal", () => {
	const block = renderAutoslotResultBlock(caps(), {
		kind: "refusal",
		headline: "Autoslot created demo-branch, but slot movement was skipped.",
		cwd: "/repo",
		body: "The worktree is not clean; `sdl slot checkout --current` requires a clean worktree.",
	});

	test("warn ✗ headline is bold and never the red error swatch (house-style §7.3)", () => {
		const headline = block.split("\n")[0] ?? "";
		expect(headline).toContain(BOLD);
		expect(headline).not.toContain(ERROR_TRUECOLOR);
		expect(headline).toContain("✗ Autoslot created demo-branch, but slot movement was skipped.");
	});
});

describe("renderAutoslotResultBlock — caps degradation", () => {
	const input = {
		kind: "success" as const,
		headline: "done",
		cwd: "/repo",
		body: "Worktree: /slots/slot-01",
	};

	test("truecolor caps emit color SGR", () => {
		expect(renderAutoslotResultBlock(caps({ colorDepth: "truecolor" }), input)).toContain(
			SUCCESS_TRUECOLOR,
		);
	});

	test("mono caps drop color but keep bold/dim weight", () => {
		const mono = renderAutoslotResultBlock(caps({ colorDepth: "none" }), input);
		expect(mono).not.toContain("\x1b[38;2");
		expect(mono).not.toContain("\x1b[38;5");
		expect(mono).not.toMatch(/\x1b\[9[0-6]m/);
		expect(mono).toContain(BOLD);
		expect(mono).toContain(DIM);
	});

	test("no-unicode caps fall back to the ascii glyph", () => {
		const ascii = renderAutoslotResultBlock(caps({ canRenderUnicode: false }), input);
		expect(stripAnsi(ascii).split("\n")[0]).toContain("v done");
		expect(ascii).not.toContain("✓");
	});
});
