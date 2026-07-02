import { describe, expect, test } from "vitest";

import type { Caps, ColorDepth } from "@sdl/clinkr";
import {
	renderDestructiveResultBlock,
	renderResultBlock,
	renderResultBlockFromMessage,
	resultBlockHeadline,
} from "../../src/cli-theme/result-block.ts";
import { stripTerminalEscapes } from "@sdl/core/terminal-escapes";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const SUCCESS_TRUECOLOR = "\x1b[38;2;63;185;80m";
const ERROR_TRUECOLOR = "\x1b[38;2;248;81;73m";
const WARN_TRUECOLOR = "\x1b[38;2;210;153;34m";

function caps(parts: { colorDepth?: ColorDepth; canRenderUnicode?: boolean } = {}): Caps {
	return {
		isTty: true,
		colorDepth: parts.colorDepth ?? "truecolor",
		columns: 80,
		canRenderUnicode: parts.canRenderUnicode ?? true,
	};
}

describe("resultBlockHeadline", () => {
	test("success uses a bold success-painted done glyph", () => {
		const headline = resultBlockHeadline(caps(), { kind: "success", headline: "done" });
		expect(headline).toContain(BOLD);
		expect(headline).toContain(SUCCESS_TRUECOLOR);
		expect(headline).toContain("✓ done");
	});

	test("failure uses a bold error-painted fail glyph", () => {
		const headline = resultBlockHeadline(caps(), { kind: "failure", headline: "failed" });
		expect(headline).toContain(BOLD);
		expect(headline).toContain(ERROR_TRUECOLOR);
		expect(headline).toContain("✗ failed");
	});

	test("refusal uses warn, not error, with the fail glyph", () => {
		const headline = resultBlockHeadline(caps(), { kind: "refusal", headline: "declined" });
		expect(headline).toContain(BOLD);
		expect(headline).toContain(WARN_TRUECOLOR);
		expect(headline).not.toContain(ERROR_TRUECOLOR);
		expect(headline).toContain("✗ declined");
	});
});

describe("renderDestructiveResultBlock", () => {
	test("resolves render capabilities before delegating to result-block rendering", () => {
		const block = renderDestructiveResultBlock(
			{ canEmitAnsi: true, caps: caps({ canRenderUnicode: false }) },
			{ kind: "refusal", headline: "Stopped.", guidance: "Retry later." },
		);

		expect(stripTerminalEscapes(block).split("\n")).toEqual(["x Stopped.", "Retry later."]);
	});
});

describe("renderResultBlock", () => {
	test("renders body and guidance at normal weight with dimmed cwd", () => {
		const block = renderResultBlock(caps(), {
			kind: "success",
			headline: "Moved work.",
			body: "New branch: demo\nWorking directory is clean.",
			guidance: "sdl slot co demo",
			cwd: "/repo",
		});

		expect(stripTerminalEscapes(block)).toContain("New branch: demo");
		expect(stripTerminalEscapes(block)).toContain("sdl slot co demo");
		expect(block).toContain(`${DIM}Cwd: /repo${RESET}`);
		expect(block).not.toContain(`${DIM}New branch: demo`);
		expect(block).not.toContain(`${DIM}sdl slot co demo`);
	});

	test("omits empty body, guidance, and cwd", () => {
		const block = renderResultBlock(caps(), {
			kind: "success",
			headline: "done",
			body: "",
			guidance: "",
			cwd: "",
		});

		expect(stripTerminalEscapes(block).split("\n")).toEqual(["✓ done"]);
	});

	test("trims trailing whitespace from body and guidance", () => {
		const block = renderResultBlock(caps(), {
			kind: "failure",
			headline: "failed",
			body: "cause\n\n",
			guidance: "retry   ",
		});

		expect(stripTerminalEscapes(block).split("\n")).toEqual(["✗ failed", "cause", "retry"]);
	});

	test("renders a domain-authored message by splitting the first line as headline", () => {
		const block = renderResultBlockFromMessage(caps(), {
			kind: "failure",
			message: "Could not regenerate the PR.\nmissing prompt\ntry again",
			cwd: "/repo",
		});

		expect(stripTerminalEscapes(block).split("\n")).toEqual([
			"✗ Could not regenerate the PR.",
			"missing prompt",
			"try again",
			"Cwd: /repo",
		]);
	});

	test("message rendering omits an empty body after the first newline", () => {
		const block = renderResultBlockFromMessage(caps(), {
			kind: "refusal",
			message: "Cancelled.\n",
		});

		expect(stripTerminalEscapes(block).split("\n")).toEqual(["✗ Cancelled."]);
	});

	test("mono caps drop color but keep bold and dim", () => {
		const block = renderResultBlock(caps({ colorDepth: "none" }), {
			kind: "success",
			headline: "done",
			cwd: "/repo",
		});

		expect(block).not.toContain("\x1b[38;2");
		expect(block).not.toContain("\x1b[38;5");
		expect(block).not.toMatch(/\x1b\[9[0-6]m/);
		expect(block).toContain(BOLD);
		expect(block).toContain(DIM);
	});

	test("no-unicode caps use ASCII glyph fallbacks", () => {
		const success = renderResultBlock(caps({ canRenderUnicode: false }), {
			kind: "success",
			headline: "done",
		});
		const failure = renderResultBlock(caps({ canRenderUnicode: false }), {
			kind: "failure",
			headline: "failed",
		});

		expect(stripTerminalEscapes(success).split("\n")[0]).toBe("v done");
		expect(stripTerminalEscapes(failure).split("\n")[0]).toBe("x failed");
	});
});
