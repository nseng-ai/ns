const PACKAGE_TEST_ROOT_GLOBS = [
	"packages/*/test",
	"packages/*/*/test",
	"../.ji/reviews/*/tools/*/test",
] as const;

export interface SpecializedTestGlobFamilies {
	readonly direct: ReadonlyArray<string>;
	readonly nested: ReadonlyArray<string>;
}

export function defaultTestGlobs(): ReadonlyArray<string> {
	return PACKAGE_TEST_ROOT_GLOBS.map((testRoot) => `${testRoot}/**/*.test.ts`);
}

function specializedTestGlobFamiliesFor(subdir: string): SpecializedTestGlobFamilies {
	return {
		direct: PACKAGE_TEST_ROOT_GLOBS.map((testRoot) => `${testRoot}/${subdir}/**/*.test.ts`),
		nested: PACKAGE_TEST_ROOT_GLOBS.map((testRoot) => `${testRoot}/**/${subdir}/**/*.test.ts`),
	};
}

export const SPECIALIZED_TEST_GLOB_FAMILIES_BY_CATEGORY = {
	integration: specializedTestGlobFamiliesFor("integration"),
	"typescript-style-guard": specializedTestGlobFamiliesFor("typescript-style-guard"),
} as const;

export type SpecializedTestCategory = keyof typeof SPECIALIZED_TEST_GLOB_FAMILIES_BY_CATEGORY;

export function globFamiliesForTestCategory(
	category: SpecializedTestCategory,
): SpecializedTestGlobFamilies {
	return SPECIALIZED_TEST_GLOB_FAMILIES_BY_CATEGORY[category];
}

export function globsForTestCategory(category: SpecializedTestCategory): ReadonlyArray<string> {
	return flattenSpecializedTestGlobFamilies(globFamiliesForTestCategory(category));
}

export function allSpecializedTestGlobs(): ReadonlyArray<string> {
	return Object.values(SPECIALIZED_TEST_GLOB_FAMILIES_BY_CATEGORY).flatMap(
		flattenSpecializedTestGlobFamilies,
	);
}

function flattenSpecializedTestGlobFamilies(
	families: SpecializedTestGlobFamilies,
): ReadonlyArray<string> {
	return [...families.direct, ...families.nested];
}

export const sharedTestConfig = {
	environment: "node" as const,
	fileParallelism: true,
	isolate: false,
	maxWorkers: 2,
	globals: false,
} as const;
