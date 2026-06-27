import ansis from "ansis";
import { describe, expect, test } from "vitest";
import type { Caps, ColorDepth } from "../../src/caps.ts";
import { glyph } from "../../src/theme/glyphs.ts";
import { dim, paint } from "../../src/theme/palette.ts";
import { type Cell, cell, type Column, kv, renderTable } from "../../src/theme/table.ts";
import { visibleWidth } from "../../src/theme/text.ts";

const DIM = "\x1b[2m";

function caps(parts: { colorDepth?: ColorDepth; columns?: number; unicode?: boolean } = {}): Caps {
	return {
		isTty: true,
		colorDepth: parts.colorDepth ?? "truecolor",
		columns: parts.columns ?? 80,
		unicode: parts.unicode ?? true,
	};
}

function statusCell(c: Caps, word: "open" | "closed"): Cell {
	const g = word === "closed" ? glyph(c, "done") : glyph(c, "open");
	const intent = word === "closed" ? "success" : "accent";
	return cell(`${paint(c, intent, g)} ${word}`, `${g} ${word}`);
}

describe("renderTable column alignment", () => {
	const c = caps();
	const columns: readonly Column[] = [
		{ header: "OBJECTIVE", width: "auto", min: 6 },
		{ header: "STATUS", width: 8 },
		{ header: "UPDATED", width: "fill", min: 6 },
	];

	test("styled cells with SGR escapes still align the trailing column", () => {
		const token = "2026-06-01";
		const rows: readonly Cell[][] = [
			[cell("alpha", "alpha"), statusCell(c, "open"), cell(token, token)],
			[cell("beta-objective", "beta-objective"), statusCell(c, "closed"), cell(token, token)],
		];
		const lines = renderTable(c, columns, rows);
		const data = lines.slice(1); // drop header row

		const offsets = data.map((line) => ansis.strip(line).indexOf(token));
		expect(offsets[0]).toBeGreaterThan(0);
		expect(offsets[0]).toBe(offsets[1]); // dates line up despite differing slug widths + SGR
	});

	test("header row is dimmed", () => {
		const rows: readonly Cell[][] = [
			[cell("alpha", "alpha"), statusCell(c, "open"), cell("now", "now")],
		];
		const lines = renderTable(c, columns, rows);
		expect(lines[0]).toContain(DIM);
		expect(ansis.strip(lines[0] ?? "").startsWith("OBJECTIVE")).toBe(true);
	});
});

describe("renderTable truncation at caps.columns", () => {
	test("fill column clips overflowing content with a caps-aware ellipsis", () => {
		const c = caps({ columns: 20 });
		const columns: readonly Column[] = [{ header: "NAME", width: "fill", min: 4 }];
		const long = "this-is-a-very-long-objective-slug";
		const lines = renderTable(c, columns, [[cell(long, long)]]);
		const dataLine = lines[1] ?? "";
		expect(visibleWidth(dataLine)).toBeLessThanOrEqual(20);
		expect(ansis.strip(dataLine).endsWith("…")).toBe(true);
	});

	test("ascii caps degrade the ellipsis to dots", () => {
		const c = caps({ columns: 20, unicode: false });
		const columns: readonly Column[] = [{ header: "NAME", width: "fill", min: 4 }];
		const long = "this-is-a-very-long-objective-slug";
		const lines = renderTable(c, columns, [[cell(long, long)]]);
		expect(ansis.strip(lines[1] ?? "").endsWith("...")).toBe(true);
	});
});

describe("renderTable right alignment", () => {
	test("right-aligned cells pad on the left", () => {
		const c = caps();
		const columns: readonly Column[] = [
			{ header: "N", width: 5, align: "right" },
			{ header: "X", width: "fill", min: 3 },
		];
		const lines = renderTable(c, columns, [[cell("7", "7"), cell("end", "end")]]);
		const data = ansis.strip(lines[1] ?? "");
		expect(data.startsWith("    7")).toBe(true); // 4 spaces then the digit
	});
});

describe("renderTable legend footer", () => {
	const c = caps();
	const columns: readonly Column[] = [{ header: "NAME", width: "fill", min: 4 }];
	const rows: readonly Cell[][] = [[cell("alpha", "alpha")]];

	test("renders a dim legend line after a blank when provided", () => {
		const lines = renderTable(c, columns, rows, { legend: "x = uncommitted changes" });
		expect(lines.at(-2)).toBe("");
		expect(lines.at(-1)).toBe(dim("x = uncommitted changes"));
	});

	test("omits the legend when not provided", () => {
		const lines = renderTable(c, columns, rows);
		expect(lines).toHaveLength(2); // header + one row, no footer
		expect(lines.some((line) => line === "")).toBe(false);
	});
});

describe("kv primitive", () => {
	test("dims the key as muted and keeps the value as foreground", () => {
		const c = caps();
		expect(kv(c, "branch", "main")).toBe(`${paint(c, "muted", "branch")} main`);
	});

	test("mono honesty: muted key still dims so the key recedes", () => {
		const mono = caps({ colorDepth: "none" });
		expect(kv(mono, "branch", "main")).toBe(`${DIM}branch${"\x1b[0m"} main`);
	});
});

describe("cell helper", () => {
	test("computes plain width from the styled string when plain is omitted", () => {
		const c = caps();
		const styled = paint(c, "success", "ok");
		expect(cell(styled).plain).toBe("ok");
		expect(cell(styled).styled).toBe(styled);
	});

	test("uses the explicit plain text when provided", () => {
		expect(cell("<b>hi</b>", "hi")).toEqual({ styled: "<b>hi</b>", plain: "hi" });
	});
});
