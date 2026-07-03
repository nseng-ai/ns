import { describe, expect, test } from "vitest";

import {
	allSpecializedTestGlobs,
	globFamiliesForTestCategory,
	globsForTestCategory,
} from "../../../../vitest.shared.ts";

describe("Vitest lane globs", () => {
	test("names direct and nested integration glob families across workspace shapes", () => {
		expect(globFamiliesForTestCategory("integration")).toEqual({
			direct: [
				"packages/*/test/integration/**/*.test.ts",
				"packages/*/*/test/integration/**/*.test.ts",
				"../.ji/reviews/*/tools/*/test/integration/**/*.test.ts",
			],
			nested: [
				"packages/*/test/**/integration/**/*.test.ts",
				"packages/*/*/test/**/integration/**/*.test.ts",
				"../.ji/reviews/*/tools/*/test/**/integration/**/*.test.ts",
			],
		});
	});

	test("exclude nested integration directories from the default lane", () => {
		expect(allSpecializedTestGlobs()).toEqual(
			expect.arrayContaining([
				"packages/*/test/**/integration/**/*.test.ts",
				"packages/*/*/test/**/integration/**/*.test.ts",
				"../.ji/reviews/*/tools/*/test/**/integration/**/*.test.ts",
			]),
		);
	});

	test("flattens named glob families for Vitest include lists", () => {
		expect(globsForTestCategory("integration")).toEqual([
			"packages/*/test/integration/**/*.test.ts",
			"packages/*/*/test/integration/**/*.test.ts",
			"../.ji/reviews/*/tools/*/test/integration/**/*.test.ts",
			"packages/*/test/**/integration/**/*.test.ts",
			"packages/*/*/test/**/integration/**/*.test.ts",
			"../.ji/reviews/*/tools/*/test/**/integration/**/*.test.ts",
		]);
	});

	test("uses semantic category segments for non-integration specialized lanes", () => {
		expect(globFamiliesForTestCategory("typescript-style-guard").nested).toEqual(
			expect.arrayContaining(["packages/*/test/**/typescript-style-guard/**/*.test.ts"]),
		);
	});
});
