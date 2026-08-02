import { describe, expect, test } from "vitest";

import {
	allSpecializedTestGlobs,
	globsForTestCategory,
	testGlobsFor,
} from "../../../../../vitest.shared.ts";

const isolatedGlobs = testGlobsFor("isolated");
const sanityGlobs = testGlobsFor("sanity");

describe("Vitest test lanes", () => {
	test("discovery is rooted in the package disposition topology", () => {
		expect(testGlobsFor()).toEqual([
			"packages/public/**/test/**/*.test.ts",
			"packages/incubating/**/test/**/*.test.ts",
			"packages/internal/**/test/**/*.test.ts",
		]);
	});

	test("shared-cache default discovery excludes both isolated-cache test categories", () => {
		for (const glob of [...isolatedGlobs, ...sanityGlobs]) {
			expect(allSpecializedTestGlobs()).toContain(glob);
		}
	});

	test("isolated discovery includes only the exact isolated test globs", () => {
		expect(globsForTestCategory("isolated")).toEqual(isolatedGlobs);
	});

	test("sanity discovery includes only the exact sanity test globs", () => {
		expect(globsForTestCategory("sanity")).toEqual([
			"packages/public/**/test/sanity/**/*.test.ts",
			"packages/incubating/**/test/sanity/**/*.test.ts",
			"packages/internal/**/test/sanity/**/*.test.ts",
		]);
	});

	test("specialized lane globs remain disjoint", () => {
		const categories = ["integration", "isolated", "sanity", "typescript-style-guard"] as const;
		const globs = categories.flatMap((category) => globsForTestCategory(category));

		expect(new Set(globs).size).toBe(globs.length);
	});
});
