export function testGlobsFor(subdir?: string): readonly [string, string] {
	const testPath = subdir === undefined ? "" : `${subdir}/`;

	return [
		`packages/*/test/${testPath}**/*.test.ts`,
		`packages/*/*/test/${testPath}**/*.test.ts`,
	] as const;
}

export const SPECIALIZED_TEST_CATEGORIES = [
	{ category: "integration", globs: testGlobsFor("integration") },
	{ category: "typescript-style-guard", globs: testGlobsFor("typescript-style-guard") },
] as const;

export type SpecializedTestCategory = (typeof SPECIALIZED_TEST_CATEGORIES)[number]["category"];

export function globsForTestCategory(category: SpecializedTestCategory): ReadonlyArray<string> {
	const entry = SPECIALIZED_TEST_CATEGORIES.find((candidate) => candidate.category === category);
	if (entry === undefined) {
		throw new Error(`Unknown specialized test category: ${category}`);
	}

	return entry.globs;
}

export const sharedTestConfig = {
	environment: "node" as const,
	fileParallelism: true,
	isolate: false,
	maxWorkers: 2,
	globals: false,
} as const;
