import { describe, expect, test } from "vitest";

import { listRoastSkillEntries, roastSkillLabel } from "../../src/skill-reviews.ts";

describe("Roaster skill review catalog", () => {
	test("contains the ordered roast skills and CI review definitions", () => {
		const entries = listRoastSkillEntries();

		expect(entries).toHaveLength(6);
		expect(entries.map((entry) => entry.surface)).toEqual([
			"roast:thermonuclear-review",
			"roast:improve-codebase-architecture",
			"roast:asdl-typescript-style",
			"roast:dignified-python",
			"roast:dry-but-not-too-dry",
			"roast:duplicative-abstractions",
		]);
		expect(entries.map((entry) => roastSkillLabel(entry))).toEqual([
			"Roast: ThermonuclearReview",
			"Roast: Improve codebase architecture",
			"Roast: ASDL TypeScript style",
			"Roast: Dignified Python",
			"Roast: DRY but not too DRY",
			"Roast: Duplicative abstractions",
		]);
		expect(entries.map((entry) => entry.backing)).toEqual([
			"skill",
			"skill",
			"review-definition",
			"review-definition",
			"review-definition",
			"review-definition",
		]);
	});

	test("uses unique roast command surfaces", () => {
		const entries = listRoastSkillEntries();
		const surfaces = entries.map((entry) => entry.surface);

		expect(new Set(surfaces).size).toBe(surfaces.length);
		expect(surfaces.every((surface) => surface.startsWith("roast:"))).toBe(true);
	});

	test("records the skill-backed and review-definition-backed identifiers", () => {
		const entries = listRoastSkillEntries();
		const skillNames = entries.flatMap((entry) =>
			entry.backing === "skill" ? [entry.skillName] : [],
		);
		const reviewKeys = entries.flatMap((entry) =>
			entry.backing === "review-definition" ? [entry.reviewKey] : [],
		);

		expect(skillNames).toEqual([
			"thermo-nuclear-code-quality-review",
			"improve-codebase-architecture",
		]);
		expect(reviewKeys).toEqual([
			"asdl-typescript-style",
			"dignified-python",
			"dry-but-not-too-dry",
			"duplicative-abstractions",
		]);
	});

	test("returns the readonly catalog without changing order", () => {
		const first = listRoastSkillEntries();
		const second = listRoastSkillEntries();

		expect(first).toEqual(second);
		expect(first.map((entry) => entry.surface)).toEqual([
			"roast:thermonuclear-review",
			"roast:improve-codebase-architecture",
			"roast:asdl-typescript-style",
			"roast:dignified-python",
			"roast:dry-but-not-too-dry",
			"roast:duplicative-abstractions",
		]);
	});
});
