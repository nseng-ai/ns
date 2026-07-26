export function testGlobsFor(subdir?: string): readonly [string] {
	const testPath = subdir === undefined ? "" : `${subdir}/`;

	return [`packages/**/test/${testPath}**/*.test.ts`] as const;
}

export const SPECIALIZED_TEST_GLOBS_BY_CATEGORY = {
	integration: testGlobsFor("integration"),
	isolated: testGlobsFor("isolated"),
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
	// Shared-cache lanes must avoid guarded module and process-global operations.
	// Tests whose subject requires those operations belong under test/isolated/.
	isolate: false,
	maxWorkers: 2,
	globals: false,
	restoreMocks: true,
	// Model selection is explicit test input. Do not let a developer's shell override
	// deterministic fake command expectations across the shared default lane.
	env: { NS_FAST_MODEL: "", NS_SLUG_MODEL: "" },
	unstubEnvs: true,
	unstubGlobals: true,
} as const;
