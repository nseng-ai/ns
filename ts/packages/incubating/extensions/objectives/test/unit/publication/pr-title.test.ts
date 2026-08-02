import { describe, expect, test } from "vitest";

import {
	formatObjectiveAutorunPrTitle,
	OBJECTIVE_AUTORUN_PR_TITLE_MAX_CHARACTERS,
} from "../../../src/publication/pr-title.ts";

const DEFAULT_TEMPLATE = "[obj:{{objectiveSlug}}] [autorun:{{autorunOrdinal}}] {{existingTitle}}";
const SLUG = "remediate-high-severity-repeated-switches";

function format(
	override: Partial<Parameters<typeof formatObjectiveAutorunPrTitle>[0]> = {},
): ReturnType<typeof formatObjectiveAutorunPrTitle> {
	return formatObjectiveAutorunPrTitle({
		template: DEFAULT_TEMPLATE,
		objectiveSlug: SLUG,
		autorunOrdinal: 1,
		existingTitle: "Centralize Review Harness Execution Diagnostics",
		...override,
	});
}

describe("formatObjectiveAutorunPrTitle", () => {
	test("renders the exact canonical default title", () => {
		expect(format()).toEqual({
			type: "resolved",
			title: `[obj:${SLUG}] [autorun:1] Centralize Review Harness Execution Diagnostics`,
			normalizedExistingTitle: "Centralize Review Harness Execution Diagnostics",
			isCanonicalPrefixStripped: false,
		});
	});

	test("recomputing from an already annotated title is idempotent", () => {
		const first = format();
		if (first.type !== "resolved") throw new Error("Expected a resolved title.");
		const second = format({ existingTitle: first.title });
		expect(second).toEqual({
			type: "resolved",
			title: first.title,
			normalizedExistingTitle: "Centralize Review Harness Execution Diagnostics",
			isCanonicalPrefixStripped: true,
		});
	});

	test("replaces a different prior Objective/ordinal prefix instead of stacking", () => {
		const result = format({
			existingTitle: "[obj:other-objective] [autorun:9] Centralize Diagnostics",
			autorunOrdinal: 3,
		});
		expect(result).toEqual({
			type: "resolved",
			title: `[obj:${SLUG}] [autorun:3] Centralize Diagnostics`,
			normalizedExistingTitle: "Centralize Diagnostics",
			isCanonicalPrefixStripped: true,
		});
	});

	test("strips at most one canonical prefix", () => {
		const result = format({
			objectiveSlug: "demo",
			existingTitle: "[obj:demo] [autorun:1] [obj:demo] [autorun:1] Real title",
		});
		expect(result).toMatchObject({
			type: "resolved",
			normalizedExistingTitle: "[obj:demo] [autorun:1] Real title",
		});
	});

	test.each([
		["[obj:Bad_Slug] [autorun:1] Kept", "invalid slug in prefix"],
		["[obj:demo] [autorun:0] Kept", "non-positive ordinal in prefix"],
		["[obj:demo][autorun:1] Kept", "missing separator space"],
		["prefix [obj:demo] [autorun:1] Kept", "not leading"],
	])("does not strip noncanonical text: %s (%s)", (existingTitle) => {
		const result = format({ existingTitle });
		expect(result).toMatchObject({
			type: "resolved",
			normalizedExistingTitle: existingTitle,
			isCanonicalPrefixStripped: false,
		});
	});

	test.each([
		["not-A-Slug!", "invalid characters"],
		["", "empty"],
		["-leading-dash", "leading dash"],
	])("refuses invalid Objective slug %s (%s)", (objectiveSlug) => {
		expect(format({ objectiveSlug })).toMatchObject({
			type: "refused",
			code: "invalid-objective-slug",
		});
	});

	test.each([0, -1, 1.5, Number.NaN])("refuses non-positive-integer ordinal %s", (ordinal) => {
		expect(format({ autorunOrdinal: ordinal })).toMatchObject({
			type: "refused",
			code: "invalid-autorun-ordinal",
		});
	});

	test.each([
		["", "empty"],
		["   ", "whitespace only"],
		["line one\nline two", "multiline"],
	])("refuses invalid existing title %j (%s)", (existingTitle) => {
		expect(format({ existingTitle })).toMatchObject({
			type: "refused",
			code: "invalid-existing-title",
		});
	});

	test.each([
		["[autorun:{{autorunOrdinal}}] {{existingTitle}}", "missing objectiveSlug"],
		[`${DEFAULT_TEMPLATE} {{objectiveSlug}}`, "duplicate objectiveSlug"],
		["{{objectiveSlug}} {{autorunOrdinal}} {{existingTitle}} {{unknown}}", "unknown placeholder"],
		["{{objectiveSlug}} {{autorunOrdinal}} {{existingTitle}} {{", "stray open braces"],
		["{{objectiveSlug}} {{autorunOrdinal}} {{existingTitle}} }}", "stray close braces"],
		["", "empty template"],
	])("refuses malformed template %j (%s)", (template) => {
		expect(format({ template })).toMatchObject({ type: "refused", code: "invalid-template" });
	});

	test("refuses rendered titles with a newline without truncation", () => {
		expect(
			format({
				template: "{{objectiveSlug}}\n{{autorunOrdinal}} {{existingTitle}}",
			}),
		).toMatchObject({ type: "refused", code: "invalid-rendered-title" });
	});

	test(`refuses rendered titles over ${OBJECTIVE_AUTORUN_PR_TITLE_MAX_CHARACTERS} characters without truncation`, () => {
		const longTitle = "x".repeat(OBJECTIVE_AUTORUN_PR_TITLE_MAX_CHARACTERS);
		const result = format({ existingTitle: longTitle });
		expect(result).toMatchObject({ type: "refused", code: "invalid-rendered-title" });
		if (result.type !== "refused") return;
		expect(result.message).toContain(`${OBJECTIVE_AUTORUN_PR_TITLE_MAX_CHARACTERS}`);
	});

	test("accepts a rendered title at exactly the maximum length", () => {
		const prefixLength = `[obj:${SLUG}] [autorun:1] `.length;
		const existingTitle = "x".repeat(OBJECTIVE_AUTORUN_PR_TITLE_MAX_CHARACTERS - prefixLength);
		const result = format({ existingTitle });
		expect(result).toMatchObject({ type: "resolved" });
		if (result.type !== "resolved") return;
		expect(result.title.length).toBe(OBJECTIVE_AUTORUN_PR_TITLE_MAX_CHARACTERS);
	});
});
