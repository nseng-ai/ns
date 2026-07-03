import { describe, expect, test } from "vitest";

import { allSpecializedTestGlobs, globsForTestCategory } from "../../../../vitest.shared.ts";

describe("Vitest lane globs", () => {
	test("discover direct and nested integration directories across workspace shapes", () => {
		expect(globsForTestCategory("integration")).toEqual(
			expect.arrayContaining([
				"packages/*/test/integration/**/*.test.ts",
				"packages/*/test/**/integration/**/*.test.ts",
				"packages/*/*/test/integration/**/*.test.ts",
				"packages/*/*/test/**/integration/**/*.test.ts",
				"../.ji/reviews/*/tools/*/test/integration/**/*.test.ts",
				"../.ji/reviews/*/tools/*/test/**/integration/**/*.test.ts",
			]),
		);
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

	test("uses semantic category segments for non-integration specialized lanes", () => {
		expect(globsForTestCategory("typescript-style-guard")).toEqual(
			expect.arrayContaining(["packages/*/test/**/typescript-style-guard/**/*.test.ts"]),
		);
	});
});
