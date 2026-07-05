import type { Caps, ColorDepth } from "@nseng-ai/clinkr";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { ObjectiveListResult } from "../../src/core/operations/list-objectives.ts";
import { objectiveListNsCommand } from "../../src/ns/commands/list.ts";
import {
	relativeTime,
	renderObjectiveListPretty,
} from "../../src/core/operations/list-objectives-pretty.ts";

const ESC = String.fromCharCode(0x1b);
const NOW = Date.parse("2026-06-27T18:00:00Z");

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
});

function caps(
	parts: { colorDepth?: ColorDepth; columns?: number; canRenderUnicode?: boolean } = {},
): Caps {
	return {
		isTty: true,
		colorDepth: parts.colorDepth ?? "truecolor",
		columns: parts.columns ?? 80,
		canRenderUnicode: parts.canRenderUnicode ?? true,
	};
}

function result(parts: Partial<ObjectiveListResult>): ObjectiveListResult {
	return {
		trunkBranch: "master",
		rootPath: ".ns/objectives",
		statusFilter: "all",
		namesOnly: false,
		records: [],
		...parts,
	};
}

const TWO_RECORDS = result({
	records: [
		{
			slug: "alpha",
			status: "open",
			latestUpdateIso: "2026-06-27T16:00:00Z",
			hasOutstandingChanges: true,
		},
		{
			slug: "bravo",
			status: "closed",
			latestUpdateIso: null,
			hasOutstandingChanges: false,
		},
	],
});

describe("renderObjectiveListPretty colors", () => {
	test("truecolor emits the dialed-in accent/success/warn swatches", () => {
		const out = renderObjectiveListPretty(TWO_RECORDS, caps({ colorDepth: "truecolor" }), NOW);
		expect(out).toContain(`${ESC}[38;2;34;211;238m●${ESC}[0m`); // accent open dot
		expect(out).toContain(`${ESC}[38;2;63;185;80m✓${ESC}[0m`); // success closed check
		expect(out).toContain(`${ESC}[38;2;210;153;34mx${ESC}[0m`); // warn outstanding-changes marker
	});

	test("ansi16 degrades to bright SGR codes", () => {
		const out = renderObjectiveListPretty(TWO_RECORDS, caps({ colorDepth: "ansi16" }), NOW);
		expect(out).toContain(`${ESC}[96m●${ESC}[0m`); // accent
		expect(out).toContain(`${ESC}[92m✓${ESC}[0m`); // success
		expect(out).toContain(`${ESC}[93mx${ESC}[0m`); // warn
	});

	test("mono keeps glyphs and the bare x marker but emits no color", () => {
		const out = renderObjectiveListPretty(TWO_RECORDS, caps({ colorDepth: "none" }), NOW);
		expect(out).not.toContain(`${ESC}[38;2;`);
		expect(out).not.toContain(`${ESC}[96m`);
		expect(out).toContain("● open");
		expect(out).toContain("✓ closed");
		// In mono the warn marker drops color but the glyph survives so the flag still reads.
		expect(out).toContain("● open     x");
		expect(out).toContain("x = uncommitted changes not yet recorded in an update");
	});

	test("ascii mode swaps status glyphs", () => {
		const out = renderObjectiveListPretty(
			TWO_RECORDS,
			caps({ colorDepth: "none", canRenderUnicode: false }),
			NOW,
		);
		expect(out).toContain("o open"); // open glyph
		expect(out).toContain("v closed"); // done glyph
		expect(out).not.toContain("●");
	});
});

describe("renderObjectiveListPretty layout", () => {
	test("relativizes the latest-update stamp on the human surface", () => {
		const out = renderObjectiveListPretty(TWO_RECORDS, caps({ colorDepth: "none" }), NOW);
		expect(out).toContain("2 hours ago");
		expect(out).toContain("—"); // null stamp still shows the em dash
	});

	test("never renders branch sub-rows", () => {
		const out = renderObjectiveListPretty(TWO_RECORDS, caps({ colorDepth: "none" }), NOW);
		expect(out).not.toContain("├");
		expect(out).not.toContain("└");
		expect(out).not.toContain("feat/alpha");
		expect(out).not.toContain("feat/beta");
	});

	test("truncates the slug column against a narrow terminal", () => {
		const wide = result({
			records: [
				{
					slug: "a-very-long-objective-slug-that-overflows-a-narrow-terminal",
					status: "open",
					latestUpdateIso: null,
					hasOutstandingChanges: false,
				},
			],
		});
		const out = renderObjectiveListPretty(wide, caps({ colorDepth: "none", columns: 40 }), NOW);
		expect(out).toContain("…");
	});

	test("ns renderHuman uses settled caps instead of process TTY state", () => {
		vi.stubEnv("FORCE_COLOR", "3");
		const originalIsTty = process.stdout.isTTY;
		const originalColumns = process.stdout.columns;
		Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
		Object.defineProperty(process.stdout, "columns", { value: 36, configurable: true });
		try {
			const out =
				objectiveListNsCommand.renderHuman?.(
					result({
						records: [
							{
								slug: "slug-that-fits-default-width",
								status: "open",
								latestUpdateIso: null,
								hasOutstandingChanges: false,
							},
						],
					}),
					{ canEmitAnsi: false },
				) ?? "";

			expect(out).toContain("slug-that-fits-default-width");
			expect(out).not.toContain("…");
		} finally {
			Object.defineProperty(process.stdout, "isTTY", { value: originalIsTty, configurable: true });
			Object.defineProperty(process.stdout, "columns", {
				value: originalColumns,
				configurable: true,
			});
		}
	});

	test("branch and edge counts render right of LATEST UPDATE", () => {
		const withEdges = result({
			records: [
				{
					slug: "alpha",
					status: "open",
					latestUpdateIso: null,
					edgeCount: 2,
					hasOutstandingChanges: false,
				},
				{ slug: "bravo", status: "open", latestUpdateIso: null, hasOutstandingChanges: false },
			],
		});
		const out = renderObjectiveListPretty(withEdges, caps({ colorDepth: "none" }), NOW);
		const lines = out.split("\n");
		const header = lines.find((line) => line.includes("OBJECTIVE"));
		if (header === undefined) throw new Error("expected objective list header");
		expect(header.slice(header.indexOf("LATEST UPDATE"))).toMatch(
			/^LATEST UPDATE {2}BRANCHES {2}EDGES/,
		);
		expect(lines.find((line) => line.startsWith("alpha"))).toMatch(/0\s+2$/);
		// The zero-edge row still renders the branch-count column, then trims the blank edge cell.
		expect(lines.find((line) => line.startsWith("bravo"))).toMatch(/0$/);
	});

	test("blocked renders with blocked text and warn blocked glyph", () => {
		const blocked = result({
			records: [
				{
					slug: "alpha",
					status: "open",
					isBlocked: true,
					latestUpdateIso: null,
					edgeCount: 1,
					hasOutstandingChanges: false,
				},
			],
		});

		const mono = renderObjectiveListPretty(blocked, caps({ colorDepth: "none" }), NOW);
		expect(mono).toContain("⊘ blocked");
		expect(mono).not.toContain("⊘ open");
		expect(mono).not.toContain("= blocked");

		const colored = renderObjectiveListPretty(blocked, caps({ colorDepth: "truecolor" }), NOW);
		expect(colored).toContain(`${ESC}[38;2;210;153;34m⊘${ESC}[0m`); // warn intent on the glyph

		const ascii = renderObjectiveListPretty(
			blocked,
			caps({ colorDepth: "none", canRenderUnicode: false }),
			NOW,
		);
		expect(ascii).toContain("! blocked");
		expect(ascii).not.toContain("= blocked");
	});

	test("legend appears only when a record has outstanding changes", () => {
		const clean = result({
			records: [
				{ slug: "alpha", status: "open", latestUpdateIso: null, hasOutstandingChanges: false },
			],
		});
		expect(renderObjectiveListPretty(clean, caps({ colorDepth: "none" }), NOW)).not.toContain(
			"x = uncommitted changes",
		);
	});

	test("names-only mode returns bare slugs with no chrome", () => {
		const names = result({
			namesOnly: true,
			records: [
				{ slug: "alpha", status: "open", latestUpdateIso: null, hasOutstandingChanges: false },
				{ slug: "bravo", status: "closed", latestUpdateIso: null, hasOutstandingChanges: false },
			],
		});
		expect(renderObjectiveListPretty(names, caps(), NOW)).toBe("alpha\nbravo");
	});

	test("empty result shows the filter-aware empty message", () => {
		const empty = result({ statusFilter: "closed", records: [] });
		const out = renderObjectiveListPretty(empty, caps({ colorDepth: "none" }), NOW);
		expect(out).toContain("No closed Objective records found.");
	});
});

describe("relativeTime", () => {
	test("buckets across the scale", () => {
		expect(relativeTime("2026-06-27T17:59:40Z", NOW)).toBe("just now");
		expect(relativeTime("2026-06-27T17:30:00Z", NOW)).toBe("30 minutes ago");
		expect(relativeTime("2026-06-27T17:00:00Z", NOW)).toBe("1 hour ago");
		expect(relativeTime("2026-06-25T18:00:00Z", NOW)).toBe("2 days ago");
		expect(relativeTime("2026-06-01T18:00:00Z", NOW)).toBe("4 weeks ago");
	});

	test("passes non-timestamps through untouched", () => {
		expect(relativeTime("not-a-date", NOW)).toBe("not-a-date");
	});
});
