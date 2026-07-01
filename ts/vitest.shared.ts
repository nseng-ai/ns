export function testGlobsFor(subdir?: string): readonly [string, string, string] {
	const testPath = subdir === undefined ? "" : `${subdir}/`;

	return [
		`packages/*/test/${testPath}**/*.test.ts`,
		`packages/*/*/test/${testPath}**/*.test.ts`,
		`../.sdl/reviews/*/tools/*/test/${testPath}**/*.test.ts`,
	] as const;
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
