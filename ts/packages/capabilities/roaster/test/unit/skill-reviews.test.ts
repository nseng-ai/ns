import { describe, expect, test } from "vitest";

import { FakeReviewCatalogGateway } from "../../src/gateways/review-catalog.ts";
import {
	loadRoastReviewDefinition,
	loadRoastSkillEntries,
	roastReviewPathForKey,
} from "../../src/core/skill-reviews.ts";

const REVIEW_SOURCE = `---
description: Fixture review description.
---

# Fixture review

Inspect the diff.
`;

describe("Roaster skill review catalog", () => {
	test("uses the catalog gateway and parser for async discovery", async () => {
		const reviewCatalog = new FakeReviewCatalogGateway({
			reviewKeys: ["zeta-review", "alpha-review"],
			reviewSourcesByKey: {
				"alpha-review": REVIEW_SOURCE.replace("Fixture review description.", "Alpha description."),
				"zeta-review": REVIEW_SOURCE.replace("Fixture review description.", "Zeta description."),
			},
		});

		const loaded = await loadRoastSkillEntries({ cwd: "/repo", reviewCatalog });

		expect(loaded.type).toBe("ok");
		if (loaded.type === "error") return;
		expect(loaded.value.map((entry) => entry.reviewKey)).toEqual(["zeta-review", "alpha-review"]);
		expect(loaded.value.map((entry) => entry.description)).toEqual([
			"Zeta description.",
			"Alpha description.",
		]);
		expect(loaded.value[0]).toMatchObject({
			surface: "skill:roast-zeta-review",
			title: "Zeta review",
			label: "Tripwire: Zeta review",
			defaultPrompt: "Run the Zeta review tripwire against the current branch changes.",
		});
		expect(reviewCatalog.requestedReviewKeys()).toEqual(["zeta-review", "alpha-review"]);
	});

	test("loads a canonical review source and parsed definition for invocation", async () => {
		const reviewCatalog = new FakeReviewCatalogGateway({
			reviewSourcesByKey: { "alpha-review": REVIEW_SOURCE },
		});

		const loaded = await loadRoastReviewDefinition({
			cwd: "/repo",
			reviewCatalog,
			key: "alpha-review",
		});

		expect(loaded.type).toBe("ok");
		if (loaded.type === "error") return;
		expect(loaded.entry.surface).toBe("skill:roast-alpha-review");
		expect(loaded.source.source).toBe(REVIEW_SOURCE);
		expect(loaded.definition.description).toBe("Fixture review description.");
	});

	test("rejects invalid review definitions instead of advertising stale commands", async () => {
		const invalidSource = "---\ndescription: Invalid only\n---\n\n";
		const reviewCatalog = new FakeReviewCatalogGateway({
			reviewSourcesByKey: { "invalid-review": invalidSource },
		});

		const loaded = await loadRoastSkillEntries({ cwd: "/repo", reviewCatalog });

		expect(loaded).toMatchObject({
			type: "error",
			error: {
				type: "review-definition-invalid",
			},
		});
	});

	test("derives surfaces, paths, labels, and default prompts from review keys", async () => {
		const reviewCatalog = new FakeReviewCatalogGateway({
			reviewSourcesByKey: {
				"dry-but-not-too-dry": REVIEW_SOURCE.replace("---\n", "---\nmodel_profile: deep\n"),
			},
		});

		const loaded = await loadRoastReviewDefinition({
			cwd: "/repo",
			reviewCatalog,
			key: "dry-but-not-too-dry",
		});

		expect(loaded.type).toBe("ok");
		if (loaded.type === "error") return;
		expect(loaded.entry).toMatchObject({
			surface: "skill:roast-dry-but-not-too-dry",
			reviewKey: "dry-but-not-too-dry",
			title: "DRY but not too DRY",
			label: "Roast: DRY but not too DRY",
			defaultPrompt: "Run the DRY but not too DRY roast against the current branch changes.",
		});
		expect(roastReviewPathForKey(loaded.entry.reviewKey)).toBe(
			".ji/reviews/dry-but-not-too-dry/review.md",
		);
	});
});
