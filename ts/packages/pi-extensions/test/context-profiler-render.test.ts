import { describe, expect, test } from "vitest";

import { visibleWidth } from "@earendil-works/pi-tui";
import { normalizeMessage } from "../src/context-profiler/model.ts";
import type { BaseRegion, LiveRegion, LiveTurn, TokenCount } from "../src/context-profiler/model.ts";
import {
	BAR_WIDTH,
	BASE_DETAIL_CLAIM,
	buildListRowCells,
	buildOverviewRowCells,
	buildUsageBarSegments,
	composeOverviewRowText,
	contentSourceForMember,
	contentSourceForTurn,
	delegationClaimText,
	delegationSummaryLine,
	fitToWidth,
	formatCompactNumber,
	formatTokenCount,
	formatUsage,
	liveSectionHeader,
	MIN_LABEL_WIDTH,
	overviewLabelWidth,
	PERCENT_COLUMN_WIDTH,
	sanitizeContentText,
	scrollNote,
	segmentationStatusText,
	STATUS_COLUMN_WIDTH,
	TOKENS_COLUMN_WIDTH,
	turnListClaim,
	turnListRowText,
	type OverviewRowSource,
} from "../src/context-profiler/render.ts";

const INNER_WIDTH = 80;

function estimated(value: number): TokenCount {
	return { value, provenance: "estimated" };
}

function makeBaseRegion(overrides: Partial<BaseRegion> = {}): BaseRegion {
	return {
		id: "base-tools",
		label: "tool/capability prompt",
		tokens: estimated(1_000),
		members: [],
		...overrides,
	};
}

function makeLiveRegion(overrides: Partial<LiveRegion> = {}): LiveRegion {
	return {
		id: "live-conversation",
		label: "conversation turns",
		kind: "chat",
		outcome: null,
		turnRange: { start: 1, end: 12 },
		tokens: estimated(2_000),
		isCurrent: true,
		source: "deterministic",
		episodeIndex: null,
		...overrides,
	};
}

function makeTurn(overrides: Partial<LiveTurn> = {}): LiveTurn {
	return {
		index: 3,
		role: "assistant",
		tokens: estimated(120),
		toolNames: [],
		excerpt: "doing things",
		message: normalizeMessage({ role: "assistant", content: "doing things" }),
		...overrides,
	};
}

describe("formatCompactNumber", () => {
	test("formats across magnitude breakpoints", () => {
		expect(formatCompactNumber(999)).toBe("999");
		expect(formatCompactNumber(1_000)).toBe("1.0k");
		expect(formatCompactNumber(3_500)).toBe("3.5k");
		expect(formatCompactNumber(10_000)).toBe("10k");
		expect(formatCompactNumber(42_000)).toBe("42k");
		expect(formatCompactNumber(1_200_000)).toBe("1.2M");
	});
});

describe("formatTokenCount", () => {
	test("prefixes estimated counts with ≈ and leaves reported counts plain", () => {
		expect(formatTokenCount(estimated(42_000))).toBe("≈42k");
		expect(formatTokenCount({ value: 42_000, provenance: "reported" })).toBe("42k");
	});
});

describe("formatUsage", () => {
	test("covers pending and measured usage", () => {
		expect(formatUsage(undefined)).toBe("usage pending");
		expect(formatUsage({ tokens: null, contextWindow: 200_000, percent: null })).toBe("usage pending / 200k");
		expect(formatUsage({ tokens: 100_000, contextWindow: 200_000, percent: 50 })).toBe("100k / 200k (50.0%)");
	});
});

describe("buildOverviewRowCells", () => {
	test("emits exact-width cells and a composed row matching the inner width", () => {
		const source: OverviewRowSource = { type: "base", region: makeBaseRegion() };
		const cells = buildOverviewRowCells(source, { maxTokens: 2_000, totalTokens: 3_000, innerWidth: INNER_WIDTH });
		expect(visibleWidth(cells.label)).toBe(overviewLabelWidth(INNER_WIDTH));
		expect(visibleWidth(cells.barFilled) + visibleWidth(cells.barEmpty)).toBe(BAR_WIDTH);
		expect(visibleWidth(cells.tokens)).toBe(TOKENS_COLUMN_WIDTH);
		expect(visibleWidth(cells.percent)).toBe(PERCENT_COLUMN_WIDTH);
		expect(visibleWidth(cells.status)).toBe(STATUS_COLUMN_WIDTH);
		expect(visibleWidth(composeOverviewRowText(cells))).toBe(INNER_WIDTH);
	});

	test("renders identical widths across renders for differing values (no jitter)", () => {
		const small = buildOverviewRowCells({ type: "base", region: makeBaseRegion({ tokens: estimated(3) }) }, { maxTokens: 2_000, totalTokens: 3_000, innerWidth: INNER_WIDTH });
		const large = buildOverviewRowCells({ type: "base", region: makeBaseRegion({ tokens: estimated(1_999_999) }) }, { maxTokens: 2_000_000, totalTokens: 3_000_000, innerWidth: INNER_WIDTH });
		expect(visibleWidth(composeOverviewRowText(small))).toBe(visibleWidth(composeOverviewRowText(large)));
	});

	test("scales the bar to the largest visible row", () => {
		const full = buildOverviewRowCells({ type: "base", region: makeBaseRegion({ tokens: estimated(2_000) }) }, { maxTokens: 2_000, totalTokens: 4_000, innerWidth: INNER_WIDTH });
		expect(full.barFilled).toBe("█".repeat(BAR_WIDTH));
		const half = buildOverviewRowCells({ type: "base", region: makeBaseRegion({ tokens: estimated(1_000) }) }, { maxTokens: 2_000, totalTokens: 4_000, innerWidth: INNER_WIDTH });
		expect(half.barFilled).toBe("█".repeat(BAR_WIDTH / 2));
		const empty = buildOverviewRowCells({ type: "base", region: makeBaseRegion({ tokens: estimated(0) }) }, { maxTokens: 2_000, totalTokens: 4_000, innerWidth: INNER_WIDTH });
		expect(empty.barFilled).toBe("");
		expect(empty.barEmpty).toBe("░".repeat(BAR_WIDTH));
	});

	test("floors the label width on narrow terminals", () => {
		expect(overviewLabelWidth(20)).toBe(MIN_LABEL_WIDTH);
	});

	test("computes the percent column against the combined total", () => {
		const cells = buildOverviewRowCells({ type: "base", region: makeBaseRegion({ tokens: estimated(600) }) }, { maxTokens: 2_000, totalTokens: 900, innerWidth: INNER_WIDTH });
		expect(cells.percent).toBe("  67%");
	});

	test("composes the status column from outcome glyph and kind abbrev", () => {
		const base = buildOverviewRowCells({ type: "base", region: makeBaseRegion() }, { maxTokens: 2_000, totalTokens: 3_000, innerWidth: INNER_WIDTH });
		expect(base.status).toBe(" ".repeat(STATUS_COLUMN_WIDTH));
		expect(base.health).toBe("neutral");

		const current = buildOverviewRowCells({ type: "live", region: makeLiveRegion() }, { maxTokens: 2_000, totalTokens: 3_000, innerWidth: INNER_WIDTH });
		expect(current.status).toBe(fitToWidth("● chat", STATUS_COLUMN_WIDTH));
		expect(current.health).toBe("accent");

		const explore = buildOverviewRowCells(
			{ type: "live", region: makeLiveRegion({ kind: "explore", isCurrent: false, source: "annotation" }) },
			{ maxTokens: 2_000, totalTokens: 3_000, innerWidth: INNER_WIDTH },
		);
		expect(explore.status).toBe(fitToWidth("· exp", STATUS_COLUMN_WIDTH));
		expect(explore.health).toBe("neutral");

		const unannotated = buildOverviewRowCells(
			{ type: "live", region: makeLiveRegion({ kind: "uncategorized", isCurrent: false }) },
			{ maxTokens: 2_000, totalTokens: 3_000, innerWidth: INNER_WIDTH },
		);
		expect(unannotated.status).toBe(fitToWidth("· —", STATUS_COLUMN_WIDTH));
		expect(unannotated.health).toBe("dim");
	});

	test("renders outcome glyph and health on annotated rows, exact width preserved", () => {
		const cases = [
			{ outcome: "active", glyph: "●", health: "accent" },
			{ outcome: "completed", glyph: "✓", health: "muted" },
			{ outcome: "abandoned", glyph: "✗", health: "warning" },
			{ outcome: "errored", glyph: "✗", health: "warning" },
			{ outcome: "unknown", glyph: "?", health: "dim" },
		] as const;
		for (const { outcome, glyph, health } of cases) {
			const cells = buildOverviewRowCells(
				{ type: "live", region: makeLiveRegion({ kind: "edit", outcome, isCurrent: false, source: "annotation" }) },
				{ maxTokens: 2_000, totalTokens: 3_000, innerWidth: INNER_WIDTH },
			);
			expect(cells.status).toBe(fitToWidth(`${glyph} edit`, STATUS_COLUMN_WIDTH));
			expect(visibleWidth(cells.status)).toBe(STATUS_COLUMN_WIDTH);
			expect(cells.health).toBe(health);
		}
	});

	test("appends relevance abbreviations and lets relevance drive row health", () => {
		const staleCompleted = buildOverviewRowCells(
			{ type: "live", region: makeLiveRegion({ kind: "edit", outcome: "completed", relevance: "stale", isCurrent: false, source: "annotation" }) },
			{ maxTokens: 2_000, totalTokens: 3_000, innerWidth: INNER_WIDTH },
		);
		expect(staleCompleted.status).toBe(fitToWidth("✓ edit sta", STATUS_COLUMN_WIDTH));
		expect(staleCompleted.health).toBe("warning");

		const loadBearing = buildOverviewRowCells(
			{ type: "live", region: makeLiveRegion({ kind: "review", outcome: "unknown", relevance: "load-bearing", isCurrent: false, source: "annotation" }) },
			{ maxTokens: 2_000, totalTokens: 3_000, innerWidth: INNER_WIDTH },
		);
		expect(loadBearing.status).toBe(fitToWidth("? rev ldb", STATUS_COLUMN_WIDTH));
		expect(loadBearing.health).toBe("accent");
	});

	test("appends the delegation glyph in the exact-width status column", () => {
		const cells = buildOverviewRowCells(
			{ type: "live", region: makeLiveRegion({ kind: "chat", outcome: "completed", relevance: "load-bearing", isCurrent: false, source: "annotation" }) },
			{ maxTokens: 2_000, totalTokens: 3_000, innerWidth: INNER_WIDTH, hasDelegation: true },
		);
		expect(cells.status).toBe("✓ chat ldb ⇄");
		expect(visibleWidth(cells.status)).toBe(STATUS_COLUMN_WIDTH);
	});

	test("labels live rows with their turn range", () => {
		const cells = buildOverviewRowCells({ type: "live", region: makeLiveRegion() }, { maxTokens: 2_000, totalTokens: 3_000, innerWidth: INNER_WIDTH });
		expect(cells.label.trimEnd()).toBe("conversation turns · 1–12");
	});
});

describe("buildUsageBarSegments", () => {
	test("splits the bar into base, live, and free against the context window", () => {
		const segments = buildUsageBarSegments({ tokens: 100_000, contextWindow: 200_000, percent: 50 }, { baseTokens: 60_000, liveTokens: 30_000, innerWidth: 40 });
		expect(segments.baseWidth).toBe(12);
		expect(segments.liveWidth).toBe(8);
		expect(segments.freeWidth).toBe(20);
		expect(segments.baseWidth + segments.liveWidth + segments.freeWidth).toBe(40);
		expect(segments.baseLegend).toBe("base ≈60k tok");
		expect(segments.liveLegend).toBe("live ≈30k tok");
		expect(segments.freeLegend).toBe("free 100k tok");
	});

	test("falls back to estimated totals when usage is unavailable", () => {
		const segments = buildUsageBarSegments(undefined, { baseTokens: 30_000, liveTokens: 10_000, innerWidth: 40 });
		expect(segments.baseWidth + segments.liveWidth + segments.freeWidth).toBe(40);
		expect(segments.freeWidth).toBe(0);
	});
});

describe("section headers and claims", () => {
	test("liveSectionHeader includes counts and the elided middle", () => {
		expect(liveSectionHeader({ originalCount: 10, includedCount: 10, elidedMiddleTurns: 0 })).toBe("LIVE · 10/10 turns");
		expect(liveSectionHeader({ originalCount: 92, includedCount: 80, elidedMiddleTurns: 12 })).toBe("LIVE · 80/92 turns · 12 middle turns elided");
	});

	test("liveSectionHeader appends the segmentation status only when present", () => {
		const cap = { originalCount: 10, includedCount: 10, elidedMiddleTurns: 0 };
		expect(liveSectionHeader(cap, null)).toBe("LIVE · 10/10 turns");
		expect(liveSectionHeader(cap, "symbolizing…")).toBe("LIVE · 10/10 turns · symbolizing…");
	});

	test("segmentationStatusText surfaces loading and error states only", () => {
		expect(segmentationStatusText({ type: "idle" })).toBeNull();
		expect(segmentationStatusText({ type: "ready", episodes: [], summary: null, delegations: [], analysis: [] })).toBeNull();
		expect(segmentationStatusText({ type: "loading" })).toBe("symbolizing…");
		expect(segmentationStatusText({ type: "error", message: "no API key" })).toBe("no symbols: no API key");
	});

	test("claim lines state what the view shows and what ⏎ does", () => {
		expect(BASE_DETAIL_CLAIM).toContain("⏎");
		const claim = turnListClaim(makeLiveRegion({ turnRange: { start: 3, end: 9 } }));
		expect(claim).toContain("turns 3–9");
		expect(claim).toContain("⏎");
		expect(claim).not.toContain("LM claim");
	});

	test("annotation regions claim their LM provenance in the turn list", () => {
		const claim = turnListClaim(makeLiveRegion({ source: "annotation", kind: "debug", outcome: "errored", turnRange: { start: 4, end: 8 } }));
		expect(claim).toBe("LM claim: kind=debug · outcome=errored · efficiency=unanalyzed · relevance=unanalyzed · turns 4–8 · ⏎ views turn content");
	});

	test("scrollNote formats the visible window", () => {
		expect(scrollNote(5, 20, 132, "rows")).toBe("rows 5–20 of 132");
		expect(scrollNote(1, 40, 2_000, "lines")).toBe("lines 1–40 of 2,000");
	});

	test("annotation claim lines include verdicts, analysis status, and delegation counts", () => {
		const claim = turnListClaim(
			makeLiveRegion({ source: "annotation", efficiency: "mixed", relevance: "stale", turnRange: { start: 4, end: 8 } }),
			{ analysisStatus: "analysis failed: invalid JSON", delegationCount: 2 },
		);
		expect(claim).toContain("efficiency=mixed · relevance=stale · analysis failed: invalid JSON · delegations=2");
	});

	test("formats delegation drill-down summaries with inferred suffixes", () => {
		expect(delegationClaimText({ turn: 3, label: "run subtask", confidence: "inferred" })).toBe("t3 run subtask (inferred)");
		expect(delegationSummaryLine([
			{ turn: 3, label: "run subtask", confidence: "inferred" },
			{ turn: 8, label: "review result", confidence: "high" },
		])).toBe("delegations: t3 run subtask (inferred) · t8 review result");
	});
});

describe("list rows", () => {
	test("buildListRowCells produces fixed bar and token columns", () => {
		const cells = buildListRowCells(estimated(500), "member name", 1_000);
		expect(visibleWidth(cells.barFilled) + visibleWidth(cells.barEmpty)).toBe(BAR_WIDTH);
		expect(visibleWidth(cells.tokens)).toBe(TOKENS_COLUMN_WIDTH);
		expect(cells.barFilled).toBe("█".repeat(BAR_WIDTH / 2));
	});

	test("turnListRowText includes index, role, tools, excerpt, and delegation prefix", () => {
		expect(turnListRowText(makeTurn({ toolNames: ["read", "bash"] }))).toBe("t3 assistant [read,bash] · doing things");
		expect(turnListRowText(makeTurn())).toBe("t3 assistant · doing things");
		expect(turnListRowText(makeTurn(), true)).toBe("⇄ t3 assistant · doing things");
	});
});

describe("verbatim content", () => {
	test("sanitizeContentText strips CR and expands tabs", () => {
		expect(sanitizeContentText("a\r\n\tb")).toBe("a\n  b");
	});

	test("contentSourceForMember distinguishes captured text from estimate-only members", () => {
		const captured = contentSourceForMember({ name: "AGENTS.md", tokens: estimated(100), content: "body", note: "verbatim file" });
		expect(captured.text).toBe("body");
		expect(captured.note).toBe("verbatim file");
		const estimateOnly = contentSourceForMember({ name: "bash", tokens: estimated(1), content: null, note: null });
		expect(estimateOnly.note).toBe("estimate only — raw text not captured");
	});

	test("contentSourceForTurn carries the ≈ token meta and verbatim body", () => {
		const source = contentSourceForTurn(makeTurn({ toolNames: ["bash"] }));
		expect(source.title).toBe("t3 assistant · bash");
		expect(source.meta).toBe("≈120 tok");
		expect(source.text).toContain("doing things");
	});
});

describe("fitToWidth", () => {
	test("truncates then pads to the exact display width", () => {
		expect(visibleWidth(fitToWidth("abcdef", 4))).toBe(4);
		expect(fitToWidth("abcdef", 4)).toContain("…");
		expect(fitToWidth("ab", 5)).toBe("ab   ");
	});
});
