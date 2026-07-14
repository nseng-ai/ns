import { describe, expect, it } from "vitest";

import {
	buildDecisionLogSection,
	buildDispatchFailureComment,
	buildDispatchFailureMarker,
	composeAnchorPrDescription,
	DISPATCH_DECISION_LOG_MAX_LENGTH,
	DISPATCH_DECISION_LOG_SECTION_END,
	DISPATCH_DECISION_LOG_SECTION_START,
} from "../../src/dispatch/anchor-pr-report.ts";

describe("buildDecisionLogSection", () => {
	it("wraps the decision log in the section markers", () => {
		const section = buildDecisionLogSection("- Chose the smaller refactor.");

		expect(section.startsWith(DISPATCH_DECISION_LOG_SECTION_START)).toBe(true);
		expect(section.endsWith(DISPATCH_DECISION_LOG_SECTION_END)).toBe(true);
		expect(section).toContain("## Decision log");
		expect(section).toContain("- Chose the smaller refactor.");
	});

	it.each([
		["a null log", null],
		["an empty log", ""],
		["a whitespace-only log", "  \n "],
	])("records that no decision log exists for %s", (_label, log) => {
		expect(buildDecisionLogSection(log)).toContain("recorded no decision log");
	});

	it("truncates an oversized decision log with a notice", () => {
		const section = buildDecisionLogSection("x".repeat(DISPATCH_DECISION_LOG_MAX_LENGTH + 500));

		expect(section).toContain("Decision log truncated");
		expect(section.length).toBeLessThan(DISPATCH_DECISION_LOG_MAX_LENGTH + 500);
	});
});

describe("composeAnchorPrDescription", () => {
	const section = buildDecisionLogSection("- Chose A.");

	it("appends the section to an existing CLI-authored description", () => {
		const composed = composeAnchorPrDescription("Dispatched from my-branch.\n", section);

		expect(composed).toBe(`Dispatched from my-branch.\n\n${section}`);
	});

	it("uses the section alone for an empty description", () => {
		expect(composeAnchorPrDescription(null, section)).toBe(section);
		expect(composeAnchorPrDescription("", section)).toBe(section);
	});

	it("replaces an existing marked section in place, keeping surrounding content", () => {
		const first = composeAnchorPrDescription("Intro.\n", buildDecisionLogSection("- Old."));
		const second = composeAnchorPrDescription(`${first}\n\nTrailer.`, section);

		expect(second).toContain("Intro.");
		expect(second).toContain("Trailer.");
		expect(second).toContain("- Chose A.");
		expect(second).not.toContain("- Old.");
	});

	it("is idempotent: recomposing the same section changes nothing", () => {
		const once = composeAnchorPrDescription("Intro.\n", section);
		const twice = composeAnchorPrDescription(once, section);

		expect(twice).toBe(once);
	});
});

describe("buildDispatchFailureComment", () => {
	it("carries the marker, the stable code, and the reason, and leaves triage to the human", () => {
		const comment = buildDispatchFailureComment({
			anchorBranch: "dispatch/widget-a1b2c3",
			code: "harness-failed",
			message: "The dispatched harness run reported failure.",
		});

		expect(comment).toContain(buildDispatchFailureMarker("dispatch/widget-a1b2c3"));
		expect(comment).toContain("`harness-failed`");
		expect(comment).toContain("The dispatched harness run reported failure.");
		expect(comment).toContain("stays open");
	});
});
