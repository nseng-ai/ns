const PACKAGE_TEST_ROOT_GLOBS = [
	"packages/*/test",
	"packages/*/*/test",
	"../.ji/reviews/*/tools/*/test",
] as const;

export function testGlobsFor(subdir?: string): ReadonlyArray<string> {
	if (subdir === undefined) {
		return PACKAGE_TEST_ROOT_GLOBS.map((testRoot) => `${testRoot}/**/*.test.ts`);
	}

	return PACKAGE_TEST_ROOT_GLOBS.flatMap((testRoot) => [
		`${testRoot}/${subdir}/**/*.test.ts`,
		`${testRoot}/**/${subdir}/**/*.test.ts`,
	]);
}

export const SPECIALIZED_TEST_GLOBS_BY_CATEGORY = {
	integration: testGlobsFor("integration"),
	"typescript-style-guard": testGlobsFor("typescript-style-guard"),
} as const;

export type SpecializedTestCategory = keyof typeof SPECIALIZED_TEST_GLOBS_BY_CATEGORY;

export function globsForTestCategory(category: SpecializedTestCategory): ReadonlyArray<string> {
	return SPECIALIZED_TEST_GLOBS_BY_CATEGORY[category];
}

export function allSpecializedTestGlobs(): ReadonlyArray<string> {
	return Object.values(SPECIALIZED_TEST_GLOBS_BY_CATEGORY).flat();
}

export const sharedTestConfig = {
	environment: "node" as const,
	fileParallelism: true,
	isolate: false,
	maxWorkers: 2,
	globals: false,
} as const;
