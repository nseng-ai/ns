import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";

import {
	FakeReviewCatalogGateway,
	RealReviewCatalogGateway,
} from "../../src/gateways/review-catalog.ts";

describe("FakeReviewCatalogGateway", () => {
	test("lists configured keys, loads sources, and records requests", async () => {
		const gateway = new FakeReviewCatalogGateway({
			reviewSourcesByKey: { python: "---\ndescription: Python\n---\nBody" },
		});

		const catalog = await gateway.listReviewKeys({ cwd: "/repo" });
		const source = await gateway.loadReviewSource({ cwd: "/repo", key: "python" });

		expect(catalog).toEqual({
			ok: true,
			value: { reviewsDir: "/repo/.ns/reviews", keys: ["python"] },
		});
		expect(source.ok).toBe(true);
		if (source.ok) expect(source.value.source).toContain("Python");
		expect(gateway.requestedReviewKeys()).toEqual(["python"]);
	});

	test("returns a typed missing-key failure", async () => {
		const gateway = new FakeReviewCatalogGateway();

		const result = await gateway.loadReviewSource({ cwd: "/repo", key: "missing" });

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe("review-definition-not-found");
	});
});

describe("RealReviewCatalogGateway", () => {
	test("discovers direct review folders in stable order", async () => {
		const repoRoot = await mkdtemp(join(tmpdir(), "reviews-review-catalog-"));
		await mkdir(join(repoRoot, ".ns", "reviews", "typescript-style", "references"), {
			recursive: true,
		});
		await mkdir(join(repoRoot, ".ns", "reviews", "python"), { recursive: true });
		await mkdir(join(repoRoot, ".ns", "reviews", "assets-only"), { recursive: true });
		await writeFile(
			join(repoRoot, ".ns", "reviews", "typescript-style", "review.md"),
			"ts",
			"utf8",
		);
		await writeFile(join(repoRoot, ".ns", "reviews", "python", "review.md"), "py", "utf8");
		await writeFile(
			join(repoRoot, ".ns", "reviews", "typescript-style", "references", "canonical.md"),
			"not a review",
			"utf8",
		);
		await writeFile(join(repoRoot, ".ns", "reviews", "README.md"), "ignored", "utf8");
		const gateway = new RealReviewCatalogGateway({
			gitGateway: new InMemoryGitGateway({ repoRoot }),
		});

		const result = await gateway.listReviewKeys({ cwd: repoRoot });

		expect(result).toEqual({
			ok: true,
			value: {
				reviewsDir: join(repoRoot, ".ns", "reviews"),
				keys: ["python", "typescript-style"],
			},
		});
	});

	test("loads source for a valid key", async () => {
		const repoRoot = await mkdtemp(join(tmpdir(), "reviews-review-catalog-load-"));
		await mkdir(join(repoRoot, ".ns", "reviews", "typescript-style"), { recursive: true });
		await writeFile(
			join(repoRoot, ".ns", "reviews", "typescript-style", "review.md"),
			"review source",
			"utf8",
		);
		const gateway = new RealReviewCatalogGateway({
			gitGateway: new InMemoryGitGateway({ repoRoot }),
		});

		const result = await gateway.loadReviewSource({ cwd: repoRoot, key: " typescript-style " });

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.key).toBe("typescript-style");
			expect(result.value.source).toBe("review source");
		}
	});

	test.each(["", ".", "..", "/absolute", "../escape", "nested/review", "nested\\review"])(
		"rejects invalid key %#",
		async (key) => {
			const gateway = new RealReviewCatalogGateway({
				gitGateway: new InMemoryGitGateway({ repoRoot: "/repo" }),
			});

			const result = await gateway.loadReviewSource({ cwd: "/repo", key });

			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.error.code).toBe("review-key-invalid");
		},
	);

	test("reports missing reviews directory and missing definitions", async () => {
		const repoRoot = await mkdtemp(join(tmpdir(), "reviews-review-catalog-missing-"));
		const gateway = new RealReviewCatalogGateway({
			gitGateway: new InMemoryGitGateway({ repoRoot }),
		});

		const catalog = await gateway.listReviewKeys({ cwd: repoRoot });
		expect(catalog.ok).toBe(false);
		if (!catalog.ok) expect(catalog.error.code).toBe("reviews-dir-missing");

		await mkdir(join(repoRoot, ".ns", "reviews"), { recursive: true });
		const source = await gateway.loadReviewSource({ cwd: repoRoot, key: "missing" });
		expect(source.ok).toBe(false);
		if (!source.ok) expect(source.error.code).toBe("review-definition-not-found");
	});
});
