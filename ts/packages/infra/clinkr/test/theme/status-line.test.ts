import { describe, expect, test } from "vitest";
import type { Caps, ColorDepth } from "../../src/caps.ts";
import { glyph, spinnerFrame } from "../../src/theme/glyphs.ts";
import { bold, dim, paint } from "../../src/theme/palette.ts";
import { PHASE_NAME_WIDTH, type StatusLineItem, statusLine } from "../../src/theme/status-line.ts";
import { padPlain } from "../../src/theme/text.ts";

const BOLD = "\x1b[1m";

function caps(parts: { colorDepth?: ColorDepth; unicode?: boolean } = {}): Caps {
	return {
		isTty: true,
		colorDepth: parts.colorDepth ?? "truecolor",
		columns: 80,
		unicode: parts.unicode ?? true,
	};
}

const item = { name: "Push", detail: "pushed 3 branches", label: "pushing branches" };

describe("statusLine grammar (color)", () => {
	const c = caps();
	const name = padPlain(item.name, PHASE_NAME_WIDTH);

	test("done: success glyph + name + dim detail", () => {
		expect(statusLine(c, item, "done")).toBe(
			`  ${paint(c, "success", glyph(c, "done"))} ${name} ${dim(item.detail)}`,
		);
	});

	test("active: accent spinner at tick + bold name + label", () => {
		expect(statusLine(c, item, "active", 3)).toBe(
			`  ${paint(c, "accent", spinnerFrame(c, 3))} ${bold(name)} ${item.label}`,
		);
	});

	test("active spinner advances with the tick", () => {
		const a = statusLine(c, item, "active", 0);
		const b = statusLine(c, item, "active", 1);
		expect(a).not.toBe(b);
		expect(a).toContain(spinnerFrame(c, 0));
		expect(b).toContain(spinnerFrame(c, 1));
	});

	test("skipped: muted skip glyph + dim name + dim detail", () => {
		expect(statusLine(c, item, "skipped")).toBe(
			`  ${paint(c, "muted", glyph(c, "skip"))} ${dim(name)} ${dim(item.detail)}`,
		);
	});

	test("failed: error glyph + name + error label", () => {
		expect(statusLine(c, item, "failed")).toBe(
			`  ${paint(c, "error", glyph(c, "fail"))} ${name} ${paint(c, "error", item.label)}`,
		);
	});

	test("pending: dim bullet + dim name + dim pending literal", () => {
		expect(statusLine(c, item, "pending")).toBe(
			`  ${dim(glyph(c, "bullet"))} ${dim(name)} ${dim("pending")}`,
		);
	});
});

describe("statusLine label fallback", () => {
	const c = caps();
	const noLabel: StatusLineItem = { name: "Local", detail: "validated" };

	test("active falls back to detail when no in-flight label is given", () => {
		const name = padPlain(noLabel.name, PHASE_NAME_WIDTH);
		expect(statusLine(c, noLabel, "active", 0)).toBe(
			`  ${paint(c, "accent", spinnerFrame(c, 0))} ${bold(name)} ${noLabel.detail}`,
		);
	});

	test("failed falls back to detail when no label is given", () => {
		const name = padPlain(noLabel.name, PHASE_NAME_WIDTH);
		expect(statusLine(c, noLabel, "failed")).toBe(
			`  ${paint(c, "error", glyph(c, "fail"))} ${name} ${paint(c, "error", noLabel.detail)}`,
		);
	});
});

describe("statusLine default tick", () => {
	test("active uses frame 0 when no tick is passed", () => {
		const c = caps();
		expect(statusLine(c, item, "active")).toBe(statusLine(c, item, "active", 0));
	});
});

describe("statusLine mono honesty", () => {
	const mono = caps({ colorDepth: "none" });
	const name = padPlain(item.name, PHASE_NAME_WIDTH);

	test("active still bolds the name in mono", () => {
		const line = statusLine(mono, item, "active", 0);
		expect(line).toContain(`${BOLD}${name}`);
		// spinner is uncolored in mono
		expect(line).toBe(`  ${spinnerFrame(mono, 0)} ${bold(name)} ${item.label}`);
	});

	test("failed stays readable in mono: leans on the glyph, plain label", () => {
		expect(statusLine(mono, item, "failed")).toBe(`  ${glyph(mono, "fail")} ${name} ${item.label}`);
	});
});

describe("statusLine ascii glyphs", () => {
	test("non-unicode caps degrade the glyph set", () => {
		const ascii = caps({ unicode: false });
		const name = padPlain(item.name, PHASE_NAME_WIDTH);
		expect(statusLine(ascii, item, "done")).toBe(
			`  ${paint(ascii, "success", "v")} ${name} ${dim(item.detail)}`,
		);
	});
});
