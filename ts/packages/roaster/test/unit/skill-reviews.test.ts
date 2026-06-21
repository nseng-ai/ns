import { describe, expect, test } from "vitest";

import { listRoastSkillEntries, roastSkillLabel } from "../../src/skill-reviews.ts";

const EXPECTED_SURFACES = [
	"roast:thermonuclear-review",
	"roast:improve-codebase-architecture",
	"roast:asdl-typescript-style",
	"roast:dignified-python",
	"roast:dry-but-not-too-dry",
	"roast:duplicative-abstractions",
] as const;

const EXPECTED_REVIEW_KEYS = [
	"thermonuclear-review",
	"improve-codebase-architecture",
	"asdl-typescript-style",
	"dignified-python",
	"dry-but-not-too-dry",
	"duplicative-abstractions",
] as const;

const EXPECTED_REVIEW_PATHS = EXPECTED_REVIEW_KEYS.map((key) => `reviews/${key}.md`);

describe("Roaster skill review catalog", () => {
	test("contains the ordered roast review definitions", () => {
		const entries = listRoastSkillEntries();

		expect(entries).toHaveLength(6);
		expect(entries.map((entry) => entry.surface)).toEqual(EXPECTED_SURFACES);
		expect(entries.map((entry) => roastSkillLabel(entry))).toEqual([
			"Roast: ThermonuclearReview",
			"Roast: Improve codebase architecture",
			"Roast: ASDL TypeScript style",
			"Roast: Dignified Python",
			"Roast: DRY but not too DRY",
			"Roast: Duplicative abstractions",
		]);
		expect(entries.map((entry) => entry.reviewKey)).toEqual(EXPECTED_REVIEW_KEYS);
		expect(entries.map((entry) => entry.reviewPath)).toEqual(EXPECTED_REVIEW_PATHS);
	});

	test("uses unique roast command surfaces and review keys", () => {
		const entries = listRoastSkillEntries();
		const surfaces = entries.map((entry) => entry.surface);
		const reviewKeys = entries.map((entry) => entry.reviewKey);

		expect(new Set(surfaces).size).toBe(surfaces.length);
		expect(new Set(reviewKeys).size).toBe(reviewKeys.length);
		expect(surfaces.every((surface) => surface.startsWith("roast:"))).toBe(true);
		expect(reviewKeys.every((key) => key.length > 0)).toBe(true);
	});

	test("returns the readonly catalog without changing order", () => {
		const first = listRoastSkillEntries();
		const second = listRoastSkillEntries();

		expect(first).toEqual(second);
		expect(first.map((entry) => entry.surface)).toEqual(EXPECTED_SURFACES);
	});
});
