export const INTEGRATION_TEST_GLOBS = [
	"packages/*/test/integration/**/*.test.ts",
	"packages/*/*/test/integration/**/*.test.ts",
] as const;

export const TYPESCRIPT_STYLE_GUARD_TEST_GLOBS = [
	"packages/*/test/typescript-style-guard/**/*.test.ts",
	"packages/*/*/test/typescript-style-guard/**/*.test.ts",
] as const;

export const sharedTestConfig = {
	environment: "node" as const,
	fileParallelism: true,
	isolate: false,
	maxWorkers: 2,
	globals: false,
} as const;
