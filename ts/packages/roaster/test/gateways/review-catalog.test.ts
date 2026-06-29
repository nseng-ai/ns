import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { InMemoryGitGateway } from "@sdl/core/git/testing";

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
			type: "ok",
			value: { reviewsDir: "/repo/.sdl/reviews", keys: ["python"] },
		});
		expect(source.type).toBe("ok");
		if (source.type === "ok") expect(source.value.source).toContain("Python");
		expect(gateway.requestedReviewKeys()).toEqual(["python"]);
	});

	test("returns a typed missing-key failure", async () => {
		const gateway = new FakeReviewCatalogGateway();

		const result = await gateway.loadReviewSource({ cwd: "/repo", key: "missing" });

		expect(result.type).toBe("error");
		if (result.type === "error") expect(result.error.type).toBe("review-definition-not-found");
	});
});

describe("RealReviewCatalogGateway", () => {
	test("discovers markdown review keys recursively in stable order", async () => {
		const repoRoot = await mkdtemp(join(tmpdir(), "roaster-review-catalog-"));
		await mkdir(join(repoRoot, ".sdl", "reviews", "nested"), { recursive: true });
		await writeFile(join(repoRoot, ".sdl", "reviews", "typescript-style.md"), "ts", "utf8");
		await writeFile(join(repoRoot, ".sdl", "reviews", "nested", "python.md"), "py", "utf8");
		await writeFile(join(repoRoot, ".sdl", "reviews", "README.txt"), "ignored", "utf8");
		const gateway = new RealReviewCatalogGateway({
			gitGateway: new InMemoryGitGateway({ repoRoot }),
		});

		const result = await gateway.listReviewKeys({ cwd: repoRoot });

		expect(result).toEqual({
			type: "ok",
			value: {
				reviewsDir: join(repoRoot, ".sdl", "reviews"),
				keys: ["nested/python", "typescript-style"],
			},
		});
	});

	test("loads source for a valid key", async () => {
		const repoRoot = await mkdtemp(join(tmpdir(), "roaster-review-catalog-load-"));
		await mkdir(join(repoRoot, ".sdl", "reviews"), { recursive: true });
		await writeFile(
			join(repoRoot, ".sdl", "reviews", "typescript-style.md"),
			"review source",
			"utf8",
		);
		const gateway = new RealReviewCatalogGateway({
			gitGateway: new InMemoryGitGateway({ repoRoot }),
		});

		const result = await gateway.loadReviewSource({ cwd: repoRoot, key: " typescript-style " });

		expect(result.type).toBe("ok");
		if (result.type === "ok") {
			expect(result.value.key).toBe("typescript-style");
			expect(result.value.source).toBe("review source");
		}
	});

	test.each(["", "/absolute", "../escape", "nested/../escape"])(
		"rejects invalid key %#",
		async (key) => {
			const gateway = new RealReviewCatalogGateway({
				gitGateway: new InMemoryGitGateway({ repoRoot: "/repo" }),
			});

			const result = await gateway.loadReviewSource({ cwd: "/repo", key });

			expect(result.type).toBe("error");
			if (result.type === "error") expect(result.error.type).toBe("review-key-invalid");
		},
	);

	test("reports missing reviews directory and missing definitions", async () => {
		const repoRoot = await mkdtemp(join(tmpdir(), "roaster-review-catalog-missing-"));
		const gateway = new RealReviewCatalogGateway({
			gitGateway: new InMemoryGitGateway({ repoRoot }),
		});

		const catalog = await gateway.listReviewKeys({ cwd: repoRoot });
		expect(catalog.type).toBe("error");
		if (catalog.type === "error") expect(catalog.error.type).toBe("reviews-dir-missing");

		await mkdir(join(repoRoot, ".sdl", "reviews"), { recursive: true });
		const source = await gateway.loadReviewSource({ cwd: repoRoot, key: "missing" });
		expect(source.type).toBe("error");
		if (source.type === "error") expect(source.error.type).toBe("review-definition-not-found");
	});
});
