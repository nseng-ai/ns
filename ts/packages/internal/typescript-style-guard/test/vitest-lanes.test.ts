import { describe, expect, test } from "vitest";

import {
	allSpecializedTestGlobs,
	globsForTestCategory,
	testGlobsFor,
} from "../../../../vitest.shared.ts";

const isolatedGlobs = testGlobsFor("isolated");

describe("Vitest test lanes", () => {
	test("default discovery excludes isolated tests through the specialized glob set", () => {
		expect(allSpecializedTestGlobs()).toContain(isolatedGlobs[0]);
		expect(allSpecializedTestGlobs()).toContain(isolatedGlobs[1]);
		expect(allSpecializedTestGlobs()).toContain(isolatedGlobs[2]);
	});

	test("isolated discovery includes only isolated test globs", () => {
		expect(globsForTestCategory("isolated")).toEqual(isolatedGlobs);
	});

	test("specialized lane globs remain disjoint", () => {
		const categories = ["integration", "isolated", "typescript-style-guard"] as const;
		const globs = categories.flatMap((category) => globsForTestCategory(category));

		expect(new Set(globs).size).toBe(globs.length);
	});
});
