import { describe, expect, test } from "vitest";

import type { ReviewDefinition } from "../../src/core/models.ts";
import { reviewSkillEntryFromDefinition } from "../../src/core/skill-reviews.ts";

const BASE_DEFINITION = {
	name: "fixture-review",
	description: "Fixture review description.",
	instructions: "Inspect the diff.",
	modelProfile: "fast",
	applicability: { include: [], exclude: [] },
	localOnly: false,
} as const satisfies ReviewDefinition;

describe("reviewSkillEntryFromDefinition", () => {
	test("does not derive a tripwire skill from the fast profile alias", () => {
		expect(reviewSkillEntryFromDefinition("zeta-review", BASE_DEFINITION)).toEqual({
			surface: "skill:review-zeta-review",
			label: "Review: Zeta review",
		});
	});

	test("keeps the tripwire suffix out of labels and unprefixed tripwire surfaces", () => {
		const definition = {
			...BASE_DEFINITION,
			modelProfile: "custom-routing-alias",
		} satisfies ReviewDefinition;

		expect(reviewSkillEntryFromDefinition("typescript-tripwire", definition)).toEqual({
			surface: "skill:typescript-tripwire",
			label: "Tripwire: TypeScript",
		});
	});

	test("derives deep review skill labels with acronym humanization", () => {
		const definition = { ...BASE_DEFINITION, modelProfile: "deep" } satisfies ReviewDefinition;

		expect(reviewSkillEntryFromDefinition("dry-but-not-too-dry", definition)).toEqual({
			surface: "skill:review-dry-but-not-too-dry",
			label: "Review: DRY but not too DRY",
		});
	});
});
