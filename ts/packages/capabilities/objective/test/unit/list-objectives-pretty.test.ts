import type { Caps, ColorDepth } from "@sdl/clinkr";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { ObjectiveListResult } from "../../src/core/operations/list-objectives.ts";
import { objectiveListSdlCommand } from "../../src/sdl/commands/list.ts";
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
		rootPath: ".sdl/objectives",
		statusFilter: "all",
		namesOnly: false,
		records: [],
		...parts,
	};
}

const TWO_RECORDS = result({
	updatedBranchesIncluded: true,
	records: [
		{
			slug: "alpha",
			status: "open",
			latestUpdateIso: "2026-06-27T16:00:00Z",
			updatedBranches: ["feat/alpha", "feat/beta"],
			hasOutstandingChanges: true,
		},
		{
			slug: "bravo",
			status: "closed",
			latestUpdateIso: null,
			updatedBranches: [],
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
		expect(out).toMatch(/open {4}x {2}/);
		expect(out).toContain("x = uncommitted changes not yet recorded in an update");
	});

	test("ascii mode swaps glyphs and tree markers", () => {
		const out = renderObjectiveListPretty(
			TWO_RECORDS,
			caps({ colorDepth: "none", canRenderUnicode: false }),
			NOW,
		);
		expect(out).toContain("o open"); // open glyph
		expect(out).toContain("v closed"); // done glyph
		expect(out).toContain("|- feat/alpha"); // tee
		expect(out).toContain("`- feat/beta"); // last
		expect(out).not.toContain("●");
		expect(out).not.toContain("├");
	});
});

describe("renderObjectiveListPretty layout", () => {
	test("relativizes the latest-update stamp on the human surface", () => {
		const out = renderObjectiveListPretty(TWO_RECORDS, caps({ colorDepth: "none" }), NOW);
		expect(out).toContain("2 hours ago");
		expect(out).toContain("—"); // null stamp still shows the em dash
	});

	test("branch attribution renders as dim tree sub-rows under each record", () => {
		const out = renderObjectiveListPretty(TWO_RECORDS, caps({ colorDepth: "none" }), NOW);
		const lines = out.split("\n");
		const alpha = lines.findIndex((line) => line.startsWith("alpha"));
		expect(lines[alpha + 1]).toContain("├ feat/alpha");
		expect(lines[alpha + 2]).toContain("└ feat/beta");
	});

	test("omits branch sub-rows when attribution is not included", () => {
		const minimal = result({
			records: [
				{
					slug: "alpha",
					status: "open",
					latestUpdateIso: null,
					hasOutstandingChanges: false,
				},
			],
		});
		const out = renderObjectiveListPretty(minimal, caps({ colorDepth: "none" }), NOW);
		expect(out).not.toContain("├");
		expect(out).not.toContain("└");
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

	test("SDL renderHuman uses settled caps instead of process TTY state", () => {
		vi.stubEnv("FORCE_COLOR", "3");
		const originalIsTty = process.stdout.isTTY;
		const originalColumns = process.stdout.columns;
		Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
		Object.defineProperty(process.stdout, "columns", { value: 36, configurable: true });
		try {
			const out =
				objectiveListSdlCommand.renderHuman?.(
					result({
						records: [
							{
								slug: "long-slug-that-fits-default-hosted-width",
								status: "open",
								latestUpdateIso: null,
								hasOutstandingChanges: false,
							},
						],
					}),
					{ canEmitAnsi: false },
				) ?? "";

			expect(out).toContain("long-slug-that-fits-default-hosted-width");
			expect(out).not.toContain("…");
		} finally {
			Object.defineProperty(process.stdout, "isTTY", { value: originalIsTty, configurable: true });
			Object.defineProperty(process.stdout, "columns", {
				value: originalColumns,
				configurable: true,
			});
		}
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

	test("notes truncated branch attribution", () => {
		const truncated = result({
			updatedBranchesIncluded: true,
			updatedBranchesTruncated: true,
			records: [
				{
					slug: "alpha",
					status: "open",
					latestUpdateIso: null,
					updatedBranches: ["feat/alpha"],
					hasOutstandingChanges: false,
				},
			],
		});
		const out = renderObjectiveListPretty(truncated, caps({ colorDepth: "none" }), NOW);
		expect(out).toContain("limited to newest 50 changed local branches");
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
