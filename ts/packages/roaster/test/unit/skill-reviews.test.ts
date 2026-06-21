import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { FakeReviewCatalogGateway } from "../../src/gateways/review-catalog.ts";
import {
	loadRoastReviewDefinition,
	loadRoastSkillEntries,
	loadRoastSkillEntriesFromReviewsDirSync,
	roastReviewPathForKey,
} from "../../src/skill-reviews.ts";

const REVIEW_SOURCE = `---
description: Fixture review description.
---

# Fixture review

Inspect the diff.
`;

function tempReviewsDir(): string {
	return mkdtempSync(join(tmpdir(), "roast-skill-reviews-"));
}

describe("Roaster skill review catalog", () => {
	test("derives command metadata from repo-local review definition files", () => {
		const reviewsDir = tempReviewsDir();
		try {
			writeFileSync(join(reviewsDir, "beta-review.md"), REVIEW_SOURCE, "utf8");
			writeFileSync(
				join(reviewsDir, "asdl-typescript-style.md"),
				`---
description: TypeScript style description.
---

# ASDL TypeScript style
`,
				"utf8",
			);

			const entries = loadRoastSkillEntriesFromReviewsDirSync(reviewsDir);

			expect(entries.map((entry) => entry.reviewKey)).toEqual([
				"asdl-typescript-style",
				"beta-review",
			]);
			expect(entries[0]).toMatchObject({
				surface: "roast:asdl-typescript-style",
				title: "ASDL TypeScript style",
				label: "Roast: ASDL TypeScript style",
				description: "TypeScript style description.",
				defaultPrompt: "Run the ASDL TypeScript style roast against the current branch changes.",
			});
			expect(roastReviewPathForKey(entries[0]?.reviewKey ?? "")).toBe(
				"reviews/asdl-typescript-style.md",
			);
			expect(entries[1]).toMatchObject({
				surface: "roast:beta-review",
				title: "Beta review",
				label: "Roast: Beta review",
				description: "Fixture review description.",
				defaultPrompt: "Run the Beta review roast against the current branch changes.",
			});
			expect(roastReviewPathForKey(entries[1]?.reviewKey ?? "")).toBe("reviews/beta-review.md");
		} finally {
			rmSync(reviewsDir, { recursive: true, force: true });
		}
	});

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
		expect(loaded.entry.surface).toBe("roast:alpha-review");
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
				type: "review_definition_invalid",
			},
		});
	});

	test("derives surfaces, paths, labels, and default prompts from review keys", async () => {
		const reviewCatalog = new FakeReviewCatalogGateway({
			reviewSourcesByKey: { "dry-but-not-too-dry": REVIEW_SOURCE },
		});

		const loaded = await loadRoastReviewDefinition({
			cwd: "/repo",
			reviewCatalog,
			key: "dry-but-not-too-dry",
		});

		expect(loaded.type).toBe("ok");
		if (loaded.type === "error") return;
		expect(loaded.entry).toMatchObject({
			surface: "roast:dry-but-not-too-dry",
			reviewKey: "dry-but-not-too-dry",
			title: "DRY but not too DRY",
			label: "Roast: DRY but not too DRY",
			defaultPrompt: "Run the DRY but not too DRY roast against the current branch changes.",
		});
		expect(roastReviewPathForKey(loaded.entry.reviewKey)).toBe("reviews/dry-but-not-too-dry.md");
	});
});
