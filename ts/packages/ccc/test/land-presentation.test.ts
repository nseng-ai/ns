import { describe, expect, test } from "vitest";

import type { Caps, ColorDepth } from "@sdl/clinkr";
import { stripAnsi } from "@sdl/clinkr/testing";

import { renderLandResultBlock } from "../src/land-stack/land-presentation.ts";

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

describe("renderLandResultBlock — success", () => {
	const block = renderLandResultBlock(caps(), {
		kind: "success",
		headline: "Landed 1 PR: #42 feature-branch.",
		body: "Remaining cleanup:\n  - Remote branches were not deleted.",
		cwd: "/repo",
	});
	const plain = stripAnsi(block);

	test("green ✓ headline carries the success swatch and bold", () => {
		const headline = block.split("\n")[0] ?? "";
		expect(headline).toContain(SUCCESS_TRUECOLOR);
		expect(headline).toContain(BOLD);
		expect(headline).toContain("✓ Landed 1 PR: #42 feature-branch.");
	});

	test("body stays at normal weight with dimmed cwd", () => {
		expect(plain).toContain("Remaining cleanup:");
		expect(plain).toContain("  - Remote branches were not deleted.");
		expect(block).toContain(`${DIM}Cwd: /repo\x1b[0m`);
		expect(block).not.toContain(`${DIM}Remaining cleanup:`);
	});
});

describe("renderLandResultBlock — failure", () => {
	const block = renderLandResultBlock(caps(), {
		kind: "failure",
		headline: "land stopped.",
		body: "Already landed:\n  - #41 base-branch\n\nFailed at: #42 feature-branch",
		guidance: "Suggested next action: Fix the reported issue, then rerun land.",
	});

	test("bold error headline with the ✗ glyph", () => {
		const headline = block.split("\n")[0] ?? "";
		expect(headline).toContain(BOLD);
		expect(headline).toContain(ERROR_TRUECOLOR);
		expect(headline).toContain("✗ land stopped.");
	});

	test("keeps the partial-success body and recovery guidance at normal weight", () => {
		expect(stripAnsi(block)).toContain("Already landed:");
		expect(stripAnsi(block)).toContain("Failed at: #42 feature-branch");
		expect(stripAnsi(block)).toContain("Suggested next action:");
		expect(block).not.toContain(`${DIM}Already landed:`);
	});
});

describe("renderLandResultBlock — refusal", () => {
	const block = renderLandResultBlock(caps(), {
		kind: "refusal",
		headline: "Cancelled before merge; no PRs were landed.",
	});

	test("warn ✗ headline is bold and never the red error swatch (house-style §7.3)", () => {
		const headline = block.split("\n")[0] ?? "";
		expect(headline).toContain(BOLD);
		expect(headline).not.toContain(ERROR_TRUECOLOR);
		expect(headline).toContain("✗ Cancelled before merge; no PRs were landed.");
	});

	test("omits the cwd line when no cwd is provided", () => {
		expect(stripAnsi(block).split("\n")).toHaveLength(1);
	});
});

describe("renderLandResultBlock — caps degradation", () => {
	const input = {
		kind: "success" as const,
		headline: "done",
		cwd: "/repo",
		body: "Remaining cleanup:",
	};

	test("truecolor caps emit color SGR", () => {
		expect(renderLandResultBlock(caps({ colorDepth: "truecolor" }), input)).toContain(
			SUCCESS_TRUECOLOR,
		);
	});

	test("mono caps drop color but keep bold/dim weight", () => {
		const mono = renderLandResultBlock(caps({ colorDepth: "none" }), input);
		expect(mono).not.toContain("\x1b[38;2");
		expect(mono).not.toContain("\x1b[38;5");
		expect(mono).not.toMatch(/\x1b\[9[0-6]m/);
		expect(mono).toContain(BOLD);
		expect(mono).toContain(DIM);
	});

	test("no-unicode caps fall back to the ascii glyph", () => {
		const ascii = renderLandResultBlock(caps({ canRenderUnicode: false }), input);
		expect(stripAnsi(ascii).split("\n")[0]).toContain("v done");
		expect(ascii).not.toContain("✓");
	});
});
