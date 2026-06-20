import { describe, expect, test } from "vitest";

import { listRoastSkillEntries, roastSkillLabel } from "../../src/skill-reviews.ts";

describe("Roaster skill review catalog", () => {
	test("contains the initial ordered roast skills", () => {
		const entries = listRoastSkillEntries();

		expect(entries).toHaveLength(2);
		expect(entries.map((entry) => entry.surface)).toEqual([
			"roast:thermonuclear-review",
			"roast:improve-codebase-architecture",
		]);
		expect(entries.map((entry) => roastSkillLabel(entry))).toEqual([
			"Roast: ThermonuclearReview",
			"Roast: Improve codebase architecture",
		]);
		expect(entries.map((entry) => entry.skillName)).toEqual([
			"thermo-nuclear-code-quality-review",
			"improve-codebase-architecture",
		]);
	});

	test("uses unique roast command surfaces", () => {
		const entries = listRoastSkillEntries();
		const surfaces = entries.map((entry) => entry.surface);

		expect(new Set(surfaces).size).toBe(surfaces.length);
		expect(surfaces.every((surface) => surface.startsWith("roast:"))).toBe(true);
	});

	test("returns a copy of the catalog list", () => {
		const first = listRoastSkillEntries();
		const second = listRoastSkillEntries();

		expect(first).toEqual(second);
		expect(first).not.toBe(second);
	});
});
